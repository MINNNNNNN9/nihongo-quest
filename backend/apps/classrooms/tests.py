import pytest
from rest_framework.test import APIClient

from apps.classrooms.models import Classroom

pytestmark = pytest.mark.django_db


def api_for(user) -> APIClient:
    api = APIClient()
    api.force_authenticate(user)
    return api


@pytest.fixture
def teacher(make_user):
    user = make_user("sensei")
    user.profile.is_teacher = True
    user.profile.save()
    return user


@pytest.fixture
def classroom(teacher):
    return Classroom.objects.create(teacher=teacher, name="日文一 A")


def test_teacher_creates_class_and_student_joins(teacher, user, client):
    created = api_for(teacher).post("/api/classes/", {"name": "日文一 A"}, format="json")
    assert created.status_code == 201
    code = created.json()["data"]["code"]
    assert len(code) == 6

    joined = client.post("/api/classes/join/", {"code": code.lower()}, format="json")  # 代碼不分大小寫
    assert joined.status_code == 200 and joined.json()["data"]["is_teacher"] is False
    client.post("/api/classes/join/", {"code": code}, format="json")  # 重複加入不會多一筆
    assert Classroom.objects.get(code=code).memberships.count() == 1
    assert [c["code"] for c in client.get("/api/classes/").json()["data"]] == [code]


def test_wrong_code_and_teacher_cannot_join_own_class(teacher, classroom, client):
    assert client.post("/api/classes/join/", {"code": "ZZZZZZ"}, format="json").status_code == 404
    assert api_for(teacher).post("/api/classes/join/", {"code": classroom.code}, format="json").status_code == 409


def test_outsiders_cannot_see_a_class(classroom, client):
    assert client.get(f"/api/classes/{classroom.code}/").status_code == 404


def test_only_teacher_sees_the_report(teacher, classroom, client, user, game):
    client.post("/api/classes/join/", {"code": classroom.code}, format="json")
    question = game.questions.get(key="Q01")
    client.post("/api/review/answer/", {"question_id": question.id, "choice": "が"}, format="json")
    client.post("/api/review/answer/", {"question_id": question.id, "choice": "も"}, format="json")

    student_view = client.get(f"/api/classes/{classroom.code}/").json()["data"]
    assert student_view["report"] is None
    assert student_view["leaderboard"][0]["is_me"] is True
    assert set(student_view["leaderboard"][0]) == {"rank", "display_name", "level", "value", "is_me"}

    report = api_for(teacher).get(f"/api/classes/{classroom.code}/").json()["data"]["report"]
    assert report["students"][0]["answered"] == 2 and report["students"][0]["accuracy"] == 0.5
    assert report["topics"] == [
        {"topic": "mo", "label": "も（也）", "attempts": 2, "correct": 1, "accuracy": 0.5}
    ]
    assert report["most_missed"][0]["key"] == "Q01"


def test_leave_and_delete(teacher, classroom, client):
    client.post("/api/classes/join/", {"code": classroom.code}, format="json")
    assert client.delete(f"/api/classes/{classroom.code}/").status_code == 403  # 學生不能刪班級
    assert client.post(f"/api/classes/{classroom.code}/leave/").status_code == 204
    assert classroom.memberships.count() == 0
    assert api_for(teacher).delete(f"/api/classes/{classroom.code}/").status_code == 204
    assert not Classroom.objects.exists()
