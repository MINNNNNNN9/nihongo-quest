from django.contrib import admin

from .models import ExperienceTransaction


@admin.register(ExperienceTransaction)
class ExperienceTransactionAdmin(admin.ModelAdmin):
    list_display = ("user", "amount", "reason", "learning_record", "created_at")
    list_filter = ("reason",)
