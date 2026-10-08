from django.contrib import admin

from .models import Classroom, Membership


@admin.register(Classroom)
class ClassroomAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "teacher", "created_at")


admin.site.register(Membership)
