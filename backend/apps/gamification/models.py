from django.conf import settings
from django.db import models
from django.db.models import Q


class ExperienceTransaction(models.Model):
    """經驗值帳本（只增不改）。PlayerProfile.total_exp 是這張表的加總快取。"""

    class Reason(models.TextChoices):
        LEVEL_CLEAR = "level_clear", "通關獎勵"
        ADJUSTMENT = "adjustment", "管理員調整"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="experience")
    amount = models.PositiveIntegerField()
    reason = models.CharField(max_length=20, choices=Reason.choices)
    # One-to-One：同一筆關卡紀錄最多對應一筆獎勵，由資料庫保證不會重複發放
    learning_record = models.OneToOneField(
        "learning.LearningRecord", on_delete=models.PROTECT, null=True, blank=True, related_name="experience"
    )
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
        ]
