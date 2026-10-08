"""學習儀表板與排行榜的統計查詢。所有查詢都以傳入的 user 為範圍。"""
from datetime import timedelta

from django.db.models import Count, DurationField, ExpressionWrapper, F, Max, Q, Sum
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone

from apps.accounts.models import PlayerProfile
from apps.games.models import GameLevel
from apps.games.topics import TOPIC_LABELS
from apps.learning.models import GameSession, LearningRecord, QuestionAttempt

from .leveling import level_for, level_progress
from .models import ExperienceTransaction

EXP_HISTORY_DAYS = 14
LEADERBOARD_SIZE = 20


def _rate(correct: int, total: int) -> float | None:
    return round(correct / total, 3) if total else None


def _profile(user) -> PlayerProfile:
    # 重新查詢而不用掛在 user 物件上的快取，確保拿到 EXP 更新後的值
    return PlayerProfile.objects.get(user=user)


def dashboard(user) -> dict:
    sessions = GameSession.objects.filter(user=user)
    attempts = QuestionAttempt.objects.filter(record__session__user=user)

    duration = sessions.filter(ended_at__isnull=False).aggregate(
        total=Sum(ExpressionWrapper(F("ended_at") - F("started_at"), output_field=DurationField()))
    )["total"]
    answered = attempts.aggregate(total=Count("id"), correct=Count("id", filter=Q(is_correct=True)))

    topics = [
        {
            "topic": row["question__topic"],
            "label": TOPIC_LABELS.get(row["question__topic"], row["question__topic"]),
            "attempts": row["total"],
            "correct": row["correct"],
            "accuracy": _rate(row["correct"], row["total"]),
        }
        for row in attempts.values("question__topic")
        .annotate(total=Count("id"), correct=Count("id", filter=Q(is_correct=True)))
        .order_by("question__topic")
    ]

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

    missed = [
        {
            "key": row["question__key"],
            "prompt": row["question__prompt"],
            "context": row["question__context"],
            "hint_zh": row["question__hint_zh"],
            "correct_answer": row["question__correct_answer"],
            "topic_label": TOPIC_LABELS.get(row["question__topic"], row["question__topic"]),
            "wrong": row["wrong"],
            "attempts": row["total"],
        }
        for row in attempts.values(
            "question__key", "question__prompt", "question__context", "question__hint_zh",
            "question__correct_answer", "question__topic",
        )
        .annotate(total=Count("id"), wrong=Count("id", filter=Q(is_correct=False)))
        .filter(wrong__gt=0)
        .order_by("-wrong", "question__key")[:5]
    ]

    return {
        "progress": level_progress(_profile(user).total_exp),
        "total_sessions": sessions.count(),
        "cleared_sessions": sessions.filter(status=GameSession.Status.CLEARED).count(),
        "total_seconds": int(duration.total_seconds()) if duration else 0,
        "questions_answered": answered["total"],
        "accuracy": _rate(answered["correct"], answered["total"]),
        "topics": topics,
        "levels": levels,
        "most_missed": missed,
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
