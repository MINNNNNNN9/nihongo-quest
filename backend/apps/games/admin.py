from django.contrib import admin

from .models import Game, GameLevel, Question


class LevelInline(admin.TabularInline):
    model = GameLevel
    extra = 0


@admin.register(Game)
class GameAdmin(admin.ModelAdmin):
    list_display = ("title", "slug", "is_active")
    inlines = [LevelInline]


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ("key", "game", "topic", "prompt", "correct_answer")
    list_filter = ("game", "topic")
    search_fields = ("prompt",)
