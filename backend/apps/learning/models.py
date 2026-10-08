import uuid

from django.conf import settings
from django.db import models
from django.db.models import F, Q


class GameSession(models.Model):
    """一次遊玩（從進入第一關到通關或 Game Over）。"""

    class Status(models.TextChoices):
        IN_PROGRESS = "in_progress", "進行中"
        CLEARED = "cleared", "通關"
        FAILED = "failed", "Game Over"
        ABANDONED = "abandoned", "中途離開"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="game_sessions")
    game = models.ForeignKey("games.Game", on_delete=models.PROTECT, related_name="sessions")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.IN_PROGRESS)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    last_seq = models.PositiveIntegerField("已處理的最後事件序號", default=0)
    # answer_score 由伺服器依收到的作答計算；battle_score 來自遊戲端（僅供參考、不可信）
    answer_score = models.IntegerField(null=True, blank=True)
    battle_score = models.IntegerField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "-started_at"], name="session_user_recent_idx"),
            models.Index(fields=["game", "status"], name="session_game_status_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(ended_at__isnull=True) | Q(ended_at__gte=F("started_at")),
                name="session_ends_after_start",
            ),
            # 同一玩家同一遊戲同時只會有一個進行中的 session
            models.UniqueConstraint(
                fields=["user", "game"], condition=Q(status="in_progress"), name="session_single_in_progress"
            ),
        ]

    @property
    def total_score(self) -> int | None:
        if self.answer_score is None:
            return None
        return self.answer_score + (self.battle_score or 0)


class LearningRecord(models.Model):
    """某次遊玩中某一關的學習紀錄。使用者與遊戲由 session 推得，不重複儲存。"""

    session = models.ForeignKey(GameSession, on_delete=models.CASCADE, related_name="records")
    level = models.ForeignKey("games.GameLevel", on_delete=models.PROTECT, related_name="records")
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    correct_count = models.PositiveSmallIntegerField(default=0)
    wrong_count = models.PositiveSmallIntegerField(default=0)
    is_first_clear = models.BooleanField(default=False)

    class Meta:
        ordering = ["-started_at"]
        constraints = [
            models.UniqueConstraint(fields=["session", "level"], name="record_unique_level_per_session"),
        ]
        indexes = [models.Index(fields=["level", "completed_at"], name="record_level_done_idx")]

    @property
    def is_completed(self) -> bool:
        return self.completed_at is not None


class QuestionAttempt(models.Model):
    record = models.ForeignKey(LearningRecord, on_delete=models.CASCADE, related_name="attempts")
    question = models.ForeignKey("games.Question", on_delete=models.PROTECT, related_name="attempts")
    choice = models.CharField("玩家選的選項", max_length=40, blank=True)
    is_correct = models.BooleanField()
    # True：對錯是伺服器依題庫與玩家選項判定；False：只能採信遊戲端回報
    verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["question", "is_correct"], name="attempt_question_result_idx")]
