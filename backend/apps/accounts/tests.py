import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from conftest import PASSWORD

pytestmark = pytest.mark.django_db

REGISTER = {"username": "hanako", "email": "hanako@example.com", "display_name": "花子", "password": PASSWORD}


def csrf_client():
    """模擬真實瀏覽器：強制 CSRF 檢查，先取 token 再帶進標頭。"""
    api = APIClient(enforce_csrf_checks=True)
    api.get("/api/auth/csrf/")
    api.credentials(HTTP_X_CSRFTOKEN=api.cookies["csrftoken"].value)
    return api


def test_register_logs_in_and_hashes_password():
    api = csrf_client()
    res = api.post("/api/auth/register/", REGISTER, format="json")
    assert res.status_code == 201
    body = res.json()
    assert body["success"] is True and body["error"] is None
    assert body["data"]["display_name"] == "花子"
    assert body["data"]["progress"]["level"] == 1
    assert "password" not in body["data"]

    user = User.objects.get(username="hanako")
    assert user.password != PASSWORD and user.password.startswith("pbkdf2_")
    assert api.get("/api/auth/me/").json()["data"]["username"] == "hanako"


def test_register_without_csrf_token_is_rejected():
    res = APIClient(enforce_csrf_checks=True).post("/api/auth/register/", REGISTER, format="json")
    assert res.status_code == 403


def test_register_rejects_weak_password_and_duplicates(user):
    api = csrf_client()
    weak = api.post("/api/auth/register/", {**REGISTER, "password": "12345678"}, format="json")
    assert weak.status_code == 400
    assert weak.json()["error"]["code"] == "validation_error"

    dup = api.post("/api/auth/register/", {**REGISTER, "username": user.username.upper()}, format="json")
    assert dup.status_code == 400
    assert "username" in dup.json()["error"]["details"]


def test_login_logout_cycle(user):
    api = csrf_client()
    bad = api.post("/api/auth/login/", {"username": user.username, "password": "wrong"}, format="json")
    assert bad.status_code == 400

    ok = api.post("/api/auth/login/", {"username": user.username, "password": PASSWORD}, format="json")
    assert ok.status_code == 200

    # 登入後 CSRF token 會輪替
    api.credentials(HTTP_X_CSRFTOKEN=api.cookies["csrftoken"].value)
    assert api.post("/api/auth/logout/").status_code == 204
    assert api.get("/api/auth/me/").status_code == 403


@pytest.mark.parametrize(
    "path",
    [
        "/api/auth/me/", "/api/games/", "/api/learning-records/", "/api/player/profile/",
        "/api/player/experience/", "/api/player/dashboard/", "/api/leaderboard/",
    ],
)
def test_protected_endpoints_require_login(path):
    res = APIClient().get(path)
    assert res.status_code == 403
    assert res.json()["success"] is False


def test_update_profile_and_unique_display_name(client, user, make_user):
    other = make_user("jiro")
    res = client.patch("/api/auth/me/", {"display_name": "太郎", "show_on_leaderboard": False}, format="json")
    assert res.status_code == 200
    user.profile.refresh_from_db()
    assert user.profile.display_name == "太郎" and user.profile.show_on_leaderboard is False

    taken = client.patch("/api/auth/me/", {"display_name": other.profile.display_name}, format="json")
    assert taken.status_code == 400


def test_profile_cannot_set_exp(client, user):
    client.patch("/api/auth/me/", {"total_exp": 99999}, format="json")
    user.profile.refresh_from_db()
    assert user.profile.total_exp == 0


def test_change_password(client, user):
    wrong = client.post(
        "/api/auth/password/", {"current_password": "nope", "new_password": "An0ther-Pass!"}, format="json"
    )
    assert wrong.status_code == 400

    ok = client.post(
        "/api/auth/password/", {"current_password": PASSWORD, "new_password": "An0ther-Pass!"}, format="json"
    )
    assert ok.status_code == 204
    user.refresh_from_db()
    assert user.check_password("An0ther-Pass!")


def test_login_is_rate_limited(user):
    api = csrf_client()
    codes = [
        api.post("/api/auth/login/", {"username": user.username, "password": "x"}, format="json").status_code
        for _ in range(12)
    ]
    assert codes[0] == 400 and codes[-1] == 429


def test_database_url_is_parsed():
    from config.settings import database_from_url

    db = database_from_url("postgresql://neon_user:p%40ss@ep-x-pooler.aws.neon.tech/neondb?sslmode=require&channel_binding=require")
    assert (db["NAME"], db["USER"], db["PASSWORD"], db["PORT"]) == ("neondb", "neon_user", "p@ss", "5432")
    assert db["HOST"] == "ep-x-pooler.aws.neon.tech"
    assert db["OPTIONS"] == {"sslmode": "require", "channel_binding": "require"}
