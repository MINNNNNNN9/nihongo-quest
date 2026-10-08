from django.conf import settings
from django.db import models
from django.db.models import Q


class ExperienceTransaction(models.Model):
    """經驗值帳本（只增不改）。PlayerProfile.total_exp 是這張表的加總快取。"""

    class Reason(models.TextChoices):
        LEVEL_CLEAR = "level_clear", "通關獎勵"
        REVIEW = "review", "錯題複習"
        QUEST = "quest", "每日任務"
        ADJUSTMENT = "adjustment", "管理員調整"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="experience")
    amount = models.PositiveIntegerField()
    reason = models.CharField(max_length=20, choices=Reason.choices)
    # One-to-One：同一筆關卡紀錄最多對應一筆獎勵，由資料庫保證不會重複發放
    learning_record = models.OneToOneField(
        "learning.LearningRecord", on_delete=models.PROTECT, null=True, blank=True, related_name="experience"
    )
    # 只能領一次的獎勵用它去重，例如每日任務「2026-10-08:correct_10」；可重複的獎勵留空
    ref = models.CharField(max_length=40, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["user", "-created_at"], name="exp_user_recent_idx")]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="exp_amount_positive"),
            models.CheckConstraint(
                condition=~Q(reason="level_clear") | Q(learning_record__isnull=False),
                name="exp_level_clear_has_record",
            ),
            models.UniqueConstraint(
                fields=["user", "reason", "ref"], condition=~Q(ref=""), name="exp_unique_ref_per_reason"
            ),
        ]


class AchievementUnlock(models.Model):
    """玩家已解鎖的成就。成就的定義（名稱、條件）寫在 quests.py，這裡只記錄解鎖時間。"""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="achievements")
    key = models.CharField(max_length=30)
    unlocked_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "key"], name="achievement_unique_per_user")]
