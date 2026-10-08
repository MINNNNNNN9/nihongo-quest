import re

import pytest
from django.core import mail
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.accounts.models import User
from conftest import PASSWORD

pytestmark = pytest.mark.django_db
NEW_PASSWORD = "Sakura-Mochi-2026!"


@pytest.fixture
def guest():
    return APIClient()


def reset_link_parts(message) -> dict:
    match = re.search(r"/reset-password\?uid=([^&\s]+)&token=(\S+)", message.body)
    return {"uid": match[1], "token": match[2]}


def test_forgot_password_sends_a_working_link(guest, user, settings):
    settings.EMAIL_ENABLED = True
    assert guest.get("/api/auth/password/forgot/").json()["data"] == {"enabled": True}
    assert guest.post("/api/auth/password/forgot/", {"email": "TARO@example.com"}, format="json").status_code == 204
    assert len(mail.outbox) == 1 and mail.outbox[0].to == ["taro@example.com"]
    assert "taro" in mail.outbox[0].body  # 信裡會提醒登入帳號

    parts = reset_link_parts(mail.outbox[0])
    done = guest.post("/api/auth/password/reset/", {**parts, "new_password": NEW_PASSWORD}, format="json")
    assert done.status_code == 204
    user.refresh_from_db()
    assert user.check_password(NEW_PASSWORD)
    # 連結只能用一次
    again = guest.post("/api/auth/password/reset/", {**parts, "new_password": PASSWORD}, format="json")
    assert again.status_code == 400


def test_forgot_password_does_not_reveal_unknown_emails(guest, user, settings):
    settings.EMAIL_ENABLED = True
    res = guest.post("/api/auth/password/forgot/", {"email": "nobody@example.com"}, format="json")
    assert res.status_code == 204 and mail.outbox == []


def test_forgot_password_without_mail_config(guest, user, settings):
    settings.EMAIL_ENABLED = False
    assert guest.get("/api/auth/password/forgot/").json()["data"] == {"enabled": False}
    guest.post("/api/auth/password/forgot/", {"email": "taro@example.com"}, format="json")
    assert mail.outbox == []


def test_reset_rejects_bad_token_and_weak_password(guest, user, settings):
    settings.EMAIL_ENABLED = True
    guest.post("/api/auth/password/forgot/", {"email": "taro@example.com"}, format="json")
    parts = reset_link_parts(mail.outbox[0])
    bad = guest.post("/api/auth/password/reset/", {**parts, "token": "x-y", "new_password": NEW_PASSWORD}, format="json")
    weak = guest.post("/api/auth/password/reset/", {**parts, "new_password": "12345678"}, format="json")
    assert bad.status_code == 400 and weak.status_code == 400
    user.refresh_from_db()
    assert user.check_password(PASSWORD)


def test_only_teachers_can_create_classes(client, user):
    assert client.post("/api/classes/", {"name": "日文一 A"}, format="json").status_code == 403
    assert client.get("/api/auth/me/").json()["data"]["is_teacher"] is False
    user.profile.is_teacher = True
    user.profile.save()
    assert client.post("/api/classes/", {"name": "日文一 A"}, format="json").status_code == 201
    # 老師身分只能由管理員設定，自己改不了
    client.patch("/api/auth/me/", {"is_teacher": False}, format="json")
    user.profile.refresh_from_db()
    assert user.profile.is_teacher is True


def test_ensure_superuser_from_environment(monkeypatch):
    call_command("ensure_superuser")  # 沒設定環境變數時什麼都不做
    assert not User.objects.filter(is_superuser=True).exists()

    monkeypatch.setenv("DJANGO_SUPERUSER_USERNAME", "boss")
    monkeypatch.setenv("DJANGO_SUPERUSER_PASSWORD", NEW_PASSWORD)
    call_command("ensure_superuser")
    boss = User.objects.get(username="boss")
    assert boss.is_superuser and boss.is_staff and boss.check_password(NEW_PASSWORD) and boss.profile.is_teacher

    # 已存在時不覆蓋密碼（管理員可能已經在後台改過）
    monkeypatch.setenv("DJANGO_SUPERUSER_PASSWORD", "Another-Pass-9999!")
    call_command("ensure_superuser")
    boss.refresh_from_db()
    assert boss.check_password(NEW_PASSWORD)


def test_admin_can_open_user_pages(make_user):
    admin_user = User.objects.create_superuser("root", "root@example.com", PASSWORD)
    student = make_user("hanako")
    browser = APIClient()
    browser.force_login(admin_user)
    assert browser.get("/admin/accounts/user/").status_code == 200
    assert browser.get("/admin/accounts/user/add/").status_code == 200
    assert browser.get(f"/admin/accounts/user/{student.pk}/change/").status_code == 200
    assert browser.get(f"/admin/accounts/user/{student.pk}/password/").status_code == 200

    made = browser.post("/admin/accounts/user/", {"action": "make_teacher", "_selected_action": [student.pk]})
    assert made.status_code == 302
    student.profile.refresh_from_db()
    assert student.profile.is_teacher is True


def test_stale_admin_login_form_is_sent_back_to_retry():
    browser = APIClient(enforce_csrf_checks=True)
    stale = browser.post("/admin/login/?next=/admin/", {"username": "x", "password": "y", "csrfmiddlewaretoken": "stale"})
    assert stale.status_code == 302 and stale["Location"] == "/admin/login/?next=/admin/"
    page = browser.get(stale["Location"])
    assert page.status_code == 200 and "安全驗證已經過期" in page.content.decode()
    # API 仍然是 403，不會被導走
    assert browser.post("/api/auth/login/", {"username": "x", "password": "y"}, format="json").status_code == 403
