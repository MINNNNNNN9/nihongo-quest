"""學習儀表板與排行榜的統計查詢。所有查詢都以傳入的 user 為範圍。"""
from collections import defaultdict
from datetime import timedelta

from django.db.models import Count, DurationField, ExpressionWrapper, F, Max, Q, Sum
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone

from apps.accounts.models import PlayerProfile
from apps.games.furigana import annotate
from apps.games.models import GameLevel, Question
from apps.games.topics import TOPIC_LABELS
from apps.learning.models import GameSession, QuestionAttempt, ReviewAttempt

from .leveling import level_for, level_progress
from .models import ExperienceTransaction

EXP_HISTORY_DAYS = 14
LEADERBOARD_SIZE = 20


def _rate(correct: int, total: int) -> float | None:
    return round(correct / total, 3) if total else None


def _profile(user) -> PlayerProfile:
    # 重新查詢而不用掛在 user 物件上的快取，確保拿到 EXP 更新後的值
    return PlayerProfile.objects.get(user=user)


def question_counts(users) -> dict[int, list[int]]:
    """各題的 [作答次數, 答對次數]，遊戲內作答與網頁複習合併計算。users 可以是單一使用者的 list 或 queryset。"""
    counts: dict[int, list[int]] = defaultdict(lambda: [0, 0])
    for model, lookup in ((QuestionAttempt, "record__session__user__in"), (ReviewAttempt, "user__in")):
        rows = (
            model.objects.filter(**{lookup: users})
            .values("question_id")
            .annotate(total=Count("id"), correct=Count("id", filter=Q(is_correct=True)))
        )
        for row in rows:
            counts[row["question_id"]][0] += row["total"]
            counts[row["question_id"]][1] += row["correct"]
    return counts


def answer_report(users, missed_limit: int = 5) -> dict:
    """作答總數、各助詞正確率與最常答錯的題目。"""
    counts = question_counts(users)
    questions = Question.objects.in_bulk(counts)
    by_topic: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for question_id, (total, correct) in counts.items():
        by_topic[questions[question_id].topic][0] += total
        by_topic[questions[question_id].topic][1] += correct
    missed = sorted(
        ((total - correct, questions[qid], total) for qid, (total, correct) in counts.items() if total > correct),
        key=lambda row: (-row[0], row[1].key),
    )[:missed_limit]
    answered = sum(total for total, _ in counts.values())
    correct = sum(correct for _, correct in counts.values())
    return {
        "questions_answered": answered,
        "accuracy": _rate(correct, answered),
        "topics": [
            {
                "topic": topic,
                "label": TOPIC_LABELS.get(topic, topic),
                "attempts": total,
                "correct": right,
                "accuracy": _rate(right, total),
            }
            for topic, (total, right) in sorted(by_topic.items())
        ],
        "most_missed": [
            {
                "key": q.key,
                "prompt": q.prompt,
                "context": q.context,
                "prompt_ruby": annotate(q.prompt),
                "context_ruby": annotate(q.context),
                "hint_zh": q.hint_zh.strip(),
                "correct_answer": q.correct_answer,
                "topic": q.topic,
                "topic_label": TOPIC_LABELS.get(q.topic, q.topic),
                "wrong": wrong,
                "attempts": total,
            }
            for wrong, q, total in missed
        ],
    }


def dashboard(user) -> dict:
    sessions = GameSession.objects.filter(user=user)

    duration = sessions.filter(ended_at__isnull=False).aggregate(
        total=Sum(ExpressionWrapper(F("ended_at") - F("started_at"), output_field=DurationField()))
    )["total"]

    mine = Q(records__session__user=user)
    levels = [
        {
            "game": level.game.slug,
            "key": level.key,
            "title": level.title,
            "attempts": level.attempts,
            "clears": level.clears,
            "completion_rate": _rate(level.clears, level.attempts),
        }
        for level in GameLevel.objects.select_related("game")
        .annotate(
            attempts=Count("records", filter=mine),
            clears=Count("records", filter=mine & Q(records__completed_at__isnull=False)),
        )
        .order_by("game_id", "order")
    ]

    return {
        "progress": level_progress(_profile(user).total_exp),
        "total_sessions": sessions.count(),
        "cleared_sessions": sessions.filter(status=GameSession.Status.CLEARED).count(),
        "total_seconds": int(duration.total_seconds()) if duration else 0,
        **answer_report([user]),
        "levels": levels,
        "exp_history": exp_history(user),
        "recent_sessions": [
            {
                "id": str(s.id),
                "game_title": s.game.title,
                "status": s.status,
                "started_at": s.started_at,
                "ended_at": s.ended_at,
                "total_score": s.total_score,
                "levels_cleared": s.cleared,
            }
            for s in sessions.select_related("game")
            .annotate(cleared=Count("records", filter=Q(records__completed_at__isnull=False)))
            .order_by("-started_at")[:8]
        ],
    }


def exp_history(user) -> list[dict]:
    """最近 N 天每日獲得的 EXP 與當日結束時的累積值。"""
    today = timezone.localdate()
    start = today - timedelta(days=EXP_HISTORY_DAYS - 1)
    daily = dict(
        ExperienceTransaction.objects.filter(user=user, created_at__date__gte=start)
        .annotate(day=TruncDate("created_at"))
        .values_list("day")
        .annotate(total=Sum("amount"))
    )
    running = _profile(user).total_exp - sum(daily.values())
    history = []
    for offset in range(EXP_HISTORY_DAYS):
        day = start + timedelta(days=offset)
        running += daily.get(day, 0)
        history.append({"date": day.isoformat(), "gained": daily.get(day, 0), "total": running})
    return history


def _entry(rank: int, profile: PlayerProfile, value: int, me) -> dict:
    # 排行榜只公開暱稱、等級與數值；不含帳號、email 或任何使用者 ID
    return {
        "rank": rank,
        "display_name": profile.display_name,
        "level": level_for(profile.total_exp),
        "value": value,
        "is_me": profile.user_id == me.id,
    }


def exp_leaderboard(user) -> dict:
    public = PlayerProfile.objects.filter(show_on_leaderboard=True, total_exp__gt=0)
    top = public.order_by("-total_exp", "id")[:LEADERBOARD_SIZE]
    profile = _profile(user)
    me = None
    if profile.show_on_leaderboard and profile.total_exp > 0:
        ahead = public.filter(Q(total_exp__gt=profile.total_exp) | Q(total_exp=profile.total_exp, id__lt=profile.id))
        me = _entry(ahead.count() + 1, profile, profile.total_exp, user)
    return {
        "board": "exp",
        "entries": [_entry(i, p, p.total_exp, user) for i, p in enumerate(top, start=1)],
        "me": me,
        "hidden": not profile.show_on_leaderboard,
    }


def score_leaderboard(user, game_slug: str | None) -> dict:
    """各玩家「通關」場次的最高總評價。答題分數由伺服器計算，戰鬥分數來自遊戲端。"""
    score = F("answer_score") + Coalesce(F("battle_score"), 0)
    cleared = GameSession.objects.filter(status=GameSession.Status.CLEARED)
    if game_slug:
        cleared = cleared.filter(game__slug=game_slug)
    best = (
        cleared.filter(user__profile__show_on_leaderboard=True)
        .values("user_id")
        .annotate(best=Max(score), first=Max("ended_at"))
        .order_by("-best", "first")
    )
    rows = list(best[:LEADERBOARD_SIZE])
    profiles = PlayerProfile.objects.in_bulk([r["user_id"] for r in rows], field_name="user_id")
    profile = _profile(user)
    me = None
    if profile.show_on_leaderboard:
        mine = cleared.filter(user=user).aggregate(best=Max(score))["best"]
        if mine is not None:
            me = _entry(best.filter(best__gt=mine).count() + 1, profile, mine, user)
    return {
        "board": "score",
        "entries": [_entry(i, profiles[r["user_id"]], r["best"], user) for i, r in enumerate(rows, start=1)],
        "me": me,
        "hidden": not profile.show_on_leaderboard,
    }
