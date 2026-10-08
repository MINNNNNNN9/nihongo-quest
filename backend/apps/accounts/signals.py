from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import PlayerProfile


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_profile(sender, instance, created, raw=False, **kwargs):
    """保證每個 User 都有 PlayerProfile（含 createsuperuser 建立的帳號）。"""
    if created and not raw and not hasattr(instance, "_profile_display_name"):
        PlayerProfile.objects.get_or_create(user=instance, defaults={"display_name": instance.username[:20]})
