from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import PlayerProfile, User

admin.site.site_header = "Nihongo Quest 管理後台"
admin.site.site_title = "Nihongo Quest 管理後台"
admin.site.index_title = "管理項目"


class ProfileInline(admin.StackedInline):
    model = PlayerProfile
    can_delete = False
    fields = ("display_name", "is_teacher", "show_on_leaderboard", "total_exp")
    readonly_fields = ("total_exp",)
    verbose_name_plural = "玩家資料（勾選「老師」後，這個帳號可以建立班級）"


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """使用者管理。

    - 建立老師帳號：按「新增使用者」填帳號密碼並儲存，接著在下一頁勾選「老師」；
      或在列表勾選帳號後用上方的動作「設為老師」。
    - 重設密碼：點進使用者，在密碼欄位下方按「這個表單」。
    """

    list_display = ("username", "display_name", "email", "is_teacher", "is_staff", "last_login")
    list_filter = ("profile__is_teacher", "is_staff", "is_active")
    search_fields = ("username", "email", "profile__display_name")
    actions = ("make_teacher", "remove_teacher")

    def get_inlines(self, request, obj):
        # 新增頁不顯示：玩家資料會在帳號建立時自動產生，儲存後的下一頁才編輯
        return [ProfileInline] if obj else []

    def get_fieldsets(self, request, obj=None):
        if obj is None:
            # 新增時一併填電子郵件（每個帳號的信箱不能重複，找回密碼也靠它）
            return ((None, {"classes": ("wide",), "fields": ("username", "email", "usable_password", "password1", "password2")}),)
        return super().get_fieldsets(request, obj)

    @admin.display(description="暱稱", ordering="profile__display_name")
    def display_name(self, user):
        return user.profile.display_name

    @admin.display(description="老師", boolean=True, ordering="profile__is_teacher")
    def is_teacher(self, user):
        return user.profile.is_teacher

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("profile")

    @admin.action(description="設為老師（可以建立班級）")
    def make_teacher(self, request, queryset):
        updated = PlayerProfile.objects.filter(user__in=queryset).update(is_teacher=True)
        self.message_user(request, f"已將 {updated} 個帳號設為老師")

    @admin.action(description="取消老師身分")
    def remove_teacher(self, request, queryset):
        updated = PlayerProfile.objects.filter(user__in=queryset).update(is_teacher=False)
        self.message_user(request, f"已取消 {updated} 個帳號的老師身分")


@admin.register(PlayerProfile)
class PlayerProfileAdmin(admin.ModelAdmin):
    list_display = ("display_name", "user", "is_teacher", "total_exp", "show_on_leaderboard")
    list_filter = ("is_teacher",)
    search_fields = ("display_name", "user__username")
    readonly_fields = ("total_exp",)
