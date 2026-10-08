import secrets

from django.conf import settings
from django.db import models

# 去掉容易看錯的 0/O、1/I/L
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def new_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))


class Classroom(models.Model):
    """班級。建立的人是老師，學生用加入代碼加入。"""

    name = models.CharField("班級名稱", max_length=40)
    code = models.CharField("加入代碼", max_length=6, unique=True, default=new_code)
    teacher = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="classrooms_taught")
    members = models.ManyToManyField(settings.AUTH_USER_MODEL, through="Membership", related_name="classrooms")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "班級"
        verbose_name_plural = "班級"

    def __str__(self):
        return f"{self.name}（{self.code}）"


class Membership(models.Model):
    classroom = models.ForeignKey(Classroom, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships")
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "班級成員"
        verbose_name_plural = "班級成員"
        constraints = [models.UniqueConstraint(fields=["classroom", "user"], name="membership_unique")]
