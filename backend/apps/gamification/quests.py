"""連續學習天數、每日任務與成就。

進度一律由既有的作答紀錄即時算出，不另外存計數器，所以不會和實際紀錄不一致。
每日任務的 EXP 由玩家按「領取」時發放，以 ExperienceTransaction.ref 保證同一天同一個任務只領一次。
"""
from datetime import date, timedelta

from django.db.models.functions import TruncDate
from django.utils import timezone

from apps.common.api import Conflict
from apps.games.topics import TOPIC_LABELS
from apps.learning.models import GameSession, LearningRecord, QuestionAttempt, ReviewAttempt
from apps.learning.review import debts

from . import services
from .models import AchievementUnlock, ExperienceTransaction

# 每天輪一個助詞當「今日助詞」
TOPIC_ROTATION = ["mo", "ni", "wo", "wa", "ga", "e", "de", "kara", "to", "no"]


def _attempts(user):
    return (
        QuestionAttempt.objects.filter(record__session__user=user),
        ReviewAttempt.objects.filter(user=user),
    )


def active_days(user) -> set[date]:
    """有作答紀錄的日期（依伺服器時區）。"""
    days: set[date] = set()
    for attempts in _attempts(user):
        days.update(attempts.annotate(day=TruncDate("created_at")).values_list("day", flat=True).distinct())
    return days


def streak(user, today: date | None = None) -> dict:
    today = today or timezone.localdate()
    days = active_days(user)
    # 今天還沒學習時，昨天為止的連續天數仍然有效
    cursor = today if today in days else today - timedelta(days=1)
    current = 0
    while cursor in days:
        current += 1
        cursor -= timedelta(days=1)
    best = run = 0
    previous = None
    for day in sorted(days):
        run = run + 1 if previous and day - previous == timedelta(days=1) else 1
        best = max(best, run)
        previous = day
    return {"current": current, "best": best, "active_today": today in days}


def _count(user, today: date | None = None, **filters) -> int:
    total = 0
    for attempts in _attempts(user):
        if today:
            attempts = attempts.filter(created_at__date=today)
        total += attempts.filter(**filters).count()
    return total


def daily_quests(user, today: date | None = None) -> list[dict]:
    today = today or timezone.localdate()
    topic = TOPIC_ROTATION[today.toordinal() % len(TOPIC_ROTATION)]
    label = TOPIC_LABELS[topic]
    quests = [
        {
            "key": "correct_10", "title": "今天答對 10 題", "detail": "遊戲和錯題複習都算。",
            "target": 10, "reward": 20, "link": "/review",
            "progress": _count(user, today, is_correct=True),
        },
        {
            "key": f"topic_{topic}", "title": f"今日助詞：答對 5 題「{label}」", "detail": "到錯題複習選這個助詞最快。",
            "target": 5, "reward": 25, "link": f"/review?topic={topic}",
            "progress": _count(user, today, is_correct=True, question__topic=topic),
        },
        {
            "key": "review_10", "title": "完成 10 題錯題複習", "detail": "答對答錯都算，重點是有練習。",
            "target": 10, "reward": 20, "link": "/review",
            "progress": ReviewAttempt.objects.filter(user=user, created_at__date=today).count(),
        },
    ]
    claimed = set(
        ExperienceTransaction.objects.filter(
            user=user, reason=ExperienceTransaction.Reason.QUEST, ref__startswith=f"{today.isoformat()}:"
        ).values_list("ref", flat=True)
    )
    for quest in quests:
        quest["progress"] = min(quest["progress"], quest["target"])
        quest["done"] = quest["progress"] >= quest["target"]
        quest["claimed"] = f"{today.isoformat()}:{quest['key']}" in claimed
    return quests


def claim_quest(user, key: str) -> int:
    today = timezone.localdate()
    quest = next((q for q in daily_quests(user, today) if q["key"] == key), None)
    if quest is None:
        raise Conflict("今天沒有這個任務")
    if not quest["done"]:
        raise Conflict("任務還沒完成")
    awarded = services.grant(
        user, quest["reward"], ExperienceTransaction.Reason.QUEST, ref=f"{today.isoformat()}:{key}"
    )
    if not awarded:
        raise Conflict("這個任務的獎勵已經領過了")
    return awarded


# (代號, 圖示, 名稱, 說明, 用哪個統計值, 目標)
ACHIEVEMENTS = [
    ("first_clear", "🗡️", "初陣", "第一次通過關卡", "levels_cleared", 1),
    ("chapter_1", "📖", "第一章突破", "通過第一章全部 6 個關卡", "chapter1_cleared", 6),
    ("all_clear", "👑", "元智ナイト", "全破一次《元智騎士》", "full_clears", 1),
    ("correct_50", "✅", "助詞入門", "累積答對 50 題", "correct", 50),
    ("correct_200", "💯", "助詞職人", "累積答對 200 題", "correct", 200),
    ("review_30", "📝", "複習の鬼", "完成 30 題錯題複習", "reviews", 30),
    ("comeback", "🔁", "七転び八起き", "把 5 題答錯過的題目練到不再出錯", "recovered", 5),
    ("streak_3", "🔥", "三日坊主じゃない", "連續 3 天學習", "streak", 3),
    ("streak_7", "🌟", "一週間皆勤", "連續 7 天學習", "streak", 7),
    ("streak_30", "🏯", "継続は力なり", "連續 30 天學習", "streak", 30),
]


def _achievement_stats(user) -> dict:
    cleared = LearningRecord.objects.filter(session__user=user, completed_at__isnull=False)
    wrong_questions = set()
    for attempts in _attempts(user):
        wrong_questions.update(attempts.filter(is_correct=False).values_list("question_id", flat=True))
    return {
        "levels_cleared": cleared.values("level_id").distinct().count(),
        "chapter1_cleared": cleared.filter(level__chapter=1).values("level_id").distinct().count(),
        "full_clears": GameSession.objects.filter(user=user, status=GameSession.Status.CLEARED).count(),
        "correct": _count(user, is_correct=True),
        "reviews": ReviewAttempt.objects.filter(user=user).count(),
        # 曾經答錯、現在已經不在待複習清單裡的題數
        "recovered": len(wrong_questions - set(debts(user))),
        "streak": streak(user)["best"],
    }


def achievements(user) -> list[dict]:
    """回傳所有成就與進度；達成條件的成就在這裡解鎖並記錄時間。"""
    stats = _achievement_stats(user)
    unlocked = dict(AchievementUnlock.objects.filter(user=user).values_list("key", "unlocked_at"))
    result = []
    for key, icon, title, description, stat, target in ACHIEVEMENTS:
        is_new = key not in unlocked and stats[stat] >= target
        if is_new:
            unlocked[key] = AchievementUnlock.objects.get_or_create(user=user, key=key)[0].unlocked_at
        result.append({
            "key": key, "icon": icon, "title": title, "description": description,
            "progress": min(stats[stat], target), "target": target,
            "unlocked_at": unlocked.get(key), "is_new": is_new,
        })
    return result


def overview(user) -> dict:
    return {"streak": streak(user), "quests": daily_quests(user), "achievements": achievements(user)}
