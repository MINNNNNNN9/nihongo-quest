from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = "apps.accounts"
    verbose_name = "帳號"

    def ready(self):
        from . import signals  # noqa: F401
