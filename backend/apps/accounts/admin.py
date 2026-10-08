from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import PlayerProfile, User

admin.site.register(User, UserAdmin)


@admin.register(PlayerProfile)
class PlayerProfileAdmin(admin.ModelAdmin):
    list_display = ("display_name", "user", "total_exp", "show_on_leaderboard")
    search_fields = ("display_name", "user__username")
    readonly_fields = ("total_exp",)
