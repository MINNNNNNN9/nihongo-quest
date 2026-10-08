from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models import Q


class User(AbstractUser):
    """登入帳號。密碼由 Django 以 PBKDF2 雜湊儲存。"""

    email = models.EmailField("電子郵件", unique=True)


class PlayerProfile(models.Model):
    """玩家的遊戲身分（One-to-One User）。對外只會顯示 display_name，不顯示帳號或 email。"""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    display_name = models.CharField("冒險者暱稱", max_length=20, unique=True)
    show_on_leaderboard = models.BooleanField("公開於排行榜", default=True)
    # 老師才能建立班級；由管理員在後台設定
    is_teacher = models.BooleanField("老師", default=False)
    # total_exp 是 ExperienceTransaction 加總的快取，只會在 gamification.services 的交易內更新。
    total_exp = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "玩家資料"
        verbose_name_plural = "玩家資料"
        indexes = [
            models.Index(
                fields=["-total_exp", "id"],
                name="profile_exp_rank_idx",
                condition=Q(show_on_leaderboard=True),
            )
        ]

    def __str__(self):
        return self.display_name
