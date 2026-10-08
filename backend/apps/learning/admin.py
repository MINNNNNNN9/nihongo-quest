from django.contrib import admin

from .models import GameSession, LearningRecord, QuestionAttempt


@admin.register(GameSession)
class GameSessionAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "game", "status", "started_at", "answer_score", "battle_score")
    list_filter = ("status", "game")


@admin.register(LearningRecord)
class LearningRecordAdmin(admin.ModelAdmin):
    list_display = ("session", "level", "completed_at", "correct_count", "wrong_count", "is_first_clear")


admin.site.register(QuestionAttempt)
