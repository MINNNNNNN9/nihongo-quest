import os

from django.core.management.base import BaseCommand

from apps.accounts.models import User


class Command(BaseCommand):
    help = "依環境變數建立超級管理員（已存在就不動，不會覆蓋密碼）。給沒有 Shell 可用的平台在啟動時呼叫。"

    def handle(self, *args, **options):
        username = os.environ.get("DJANGO_SUPERUSER_USERNAME", "").strip()
        password = os.environ.get("DJANGO_SUPERUSER_PASSWORD", "")
        if not username or not password:
            return  # 沒設定就略過
        if User.objects.filter(username__iexact=username).exists():
            return
        email = os.environ.get("DJANGO_SUPERUSER_EMAIL", "").strip() or f"{username}@admin.invalid"
        user = User.objects.create_superuser(username=username, email=email, password=password)
        user.profile.is_teacher = True
        user.profile.save(update_fields=["is_teacher"])
        self.stdout.write(self.style.SUCCESS(f"已建立超級管理員 {username}"))
