"""遊戲事件處理。

遊戲在玩家的瀏覽器裡執行，所以這裡收到的每個事件都可能被竄改。能做到的是：
- 經驗值「只」由伺服器依關卡設定計算，前端送來的任何分數／EXP 都不採用；
- 以 session 鎖 + 事件序號去重，重送或並發請求不會重複發獎；
- 檢查事件順序、答對題數、最短耗時等合理性，擋掉最粗糙的偽造。
這不等於防作弊：懂技術的玩家仍可偽造「看起來合理」的事件序列（見 docs/architecture.md）。
"""
from dataclasses import dataclass

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from apps.common.api import Conflict
from apps.games.models import Game, GameLevel, Question
from apps.gamification import services as gamification

from .models import GameSession, LearningRecord, QuestionAttempt
from .review import feedback

ANSWER_SCORE_BASE = 500  # 與原遊戲的「答題評價」相同：500 起算、每答錯一次 -10
ANSWER_SCORE_PENALTY = 10
BATTLE_SCORE_MAX = 140  # 原遊戲「戰鬥評價」的上限
MAX_WRONG_PER_LEVEL = 200


@dataclass
class EventResult:
    duplicate: bool = False
    is_correct: bool | None = None
    reward: gamification.Reward | None = None
    feedback: dict | None = None  # 作答後的解說（題目、正解、提示）


def start_session(user, game: Game) -> GameSession:
    """開始新的一次遊玩；同遊戲尚未結束的舊 session 標記為中途離開。"""
    with transaction.atomic():
        stale = GameSession.objects.select_for_update().filter(
            user=user, game=game, status=GameSession.Status.IN_PROGRESS
        )
        for session in stale:
            _finish(session, GameSession.Status.ABANDONED)
        try:
            with transaction.atomic():
                return GameSession.objects.create(user=user, game=game)
        except IntegrityError:
            raise Conflict("已有另一個進行中的遊戲，請重新整理後再試")


def _locked_session(user, session_id) -> GameSession:
    # 以 user 過濾：別人的 session 一律回 404，不洩漏是否存在（防 IDOR）
    session = GameSession.objects.select_for_update().filter(pk=session_id, user=user).first()
    if session is None:
        raise NotFound("找不到這個遊戲紀錄")
    return session


def _level(session: GameSession, key: str) -> GameLevel:
    level = GameLevel.objects.filter(game_id=session.game_id, key=key).first()
    if level is None:
        raise ValidationError({"level_key": "這個遊戲沒有此關卡"})
    return level


@transaction.atomic
def handle_event(user, session_id, data: dict) -> EventResult:
    session = _locked_session(user, session_id)
    if data["seq"] <= session.last_seq:
        return EventResult(duplicate=True)  # 重送的事件：不重複處理、不重複發獎
    if session.status != GameSession.Status.IN_PROGRESS:
        raise Conflict("這次遊玩已經結束")

    level = _level(session, data["level_key"])
    handler = {
        "LEVEL_STARTED": _level_started,
        "QUESTION_ANSWERED": _question_answered,
        "LEVEL_COMPLETED": _level_completed,
    }[data["type"]]
    result = handler(session, level, data)

    session.last_seq = data["seq"]
    session.save(update_fields=["last_seq"])
    return result


def _level_started(session, level, data) -> EventResult:
    LearningRecord.objects.get_or_create(session=session, level=level)
    return EventResult()


def _question_answered(session, level, data) -> EventResult:
    record = LearningRecord.objects.filter(session=session, level=level).first()
    if record is None:
        raise Conflict("尚未開始這個關卡")
    if record.is_completed:
        raise Conflict("這個關卡已經完成")
    question = Question.objects.filter(game_id=session.game_id, key=data["question_key"]).first()
    if question is None:
        raise ValidationError({"question_key": "題庫中沒有這一題"})

    label = question.label_for(data.get("choice", ""))
    if label is not None:
        is_correct, verified = label == question.correct_answer, True
    else:
        is_correct, verified = data["is_correct"], False

    if not is_correct and record.wrong_count >= MAX_WRONG_PER_LEVEL:
        raise Conflict("作答次數異常")
    QuestionAttempt.objects.create(
        record=record, question=question, choice=data.get("choice", ""), is_correct=is_correct, verified=verified
    )
    if is_correct:
        record.correct_count += 1
    else:
        record.wrong_count += 1
    record.save(update_fields=["correct_count", "wrong_count"])
    return EventResult(is_correct=is_correct, feedback=feedback(question, label or ""))


def _level_completed(session, level, data) -> EventResult:
    record = LearningRecord.objects.filter(session=session, level=level).first()
    if record is None:
        raise Conflict("尚未開始這個關卡")
    if record.is_completed:
        return EventResult(duplicate=True)
    if record.correct_count < level.questions_required:
        raise Conflict("答對題數不足，無法完成關卡")
    now = timezone.now()
    if (now - record.started_at).total_seconds() < level.min_seconds:
        raise Conflict("通關時間異常")
    if level.order > 1:
        previous_done = LearningRecord.objects.filter(
            session=session, level__order=level.order - 1, completed_at__isnull=False
        ).exists()
        if not previous_done:
            raise Conflict("尚未完成前一個關卡")

    record.is_first_clear = not LearningRecord.objects.filter(
        session__user_id=session.user_id, level=level, completed_at__isnull=False
    ).exists()
    record.completed_at = now
    record.save(update_fields=["is_first_clear", "completed_at"])
    return EventResult(reward=gamification.award_level_clear(session.user, record))


def _finish(session: GameSession, status: str, battle_score: int | None = None) -> None:
    wrong = sum(session.records.values_list("wrong_count", flat=True))
    session.status = status
    session.ended_at = timezone.now()
    session.answer_score = max(0, ANSWER_SCORE_BASE - ANSWER_SCORE_PENALTY * wrong)
    if battle_score is not None:
        session.battle_score = max(0, min(BATTLE_SCORE_MAX, battle_score))
    session.save(update_fields=["status", "ended_at", "answer_score", "battle_score"])


@transaction.atomic
def complete_session(user, session_id, outcome: str, battle_score: int | None) -> GameSession:
    session = _locked_session(user, session_id)
    if session.status != GameSession.Status.IN_PROGRESS:
        return session  # 冪等：重複呼叫直接回傳既有結果
    if outcome == GameSession.Status.CLEARED:
        total = GameLevel.objects.filter(game_id=session.game_id).count()
        done = session.records.filter(completed_at__isnull=False).count()
        if done < total:
            raise Conflict("尚有關卡未完成，不能標記為通關")
    _finish(session, outcome, battle_score)
    return session
