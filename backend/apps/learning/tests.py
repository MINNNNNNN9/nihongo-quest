import pytest
from rest_framework.test import APIClient

from apps.gamification.models import ExperienceTransaction
from apps.learning.models import GameSession, LearningRecord, QuestionAttempt
from conftest import Player

pytestmark = pytest.mark.django_db


def test_seed_matches_original_game(game):
    assert game.levels.count() == 18
    assert game.questions.filter(in_game=True).count() == 75
    q = game.questions.get(key="Q01")
    assert q.prompt == "私（？）エンジニアです。" and q.correct_answer == "も"
    assert game.questions.get(key="Q48").topic == "none"


def test_clearing_a_level_awards_server_defined_exp(player, user):
    res = player.clear("1-1")
    assert res.status_code == 200
    reward = res.json()["data"]["reward"]
    assert reward == {
        "exp_awarded": 50,
        "is_first_clear": True,
        "leveled_up": False,
        "level_before": 1,
        "progress": {
            "level": 1, "title": "見習騎士", "total_exp": 50, "exp_into_level": 50, "exp_for_next_level": 100,
        },
    }
    user.profile.refresh_from_db()
    assert user.profile.total_exp == 50


def test_client_cannot_dictate_exp(player, user):
    player.send("LEVEL_STARTED", "1-1")
    player.answer("1-1")
    player.age("1-1")
    player.send("LEVEL_COMPLETED", "1-1", exp=99999, exp_awarded=99999, score=99999)
    user.profile.refresh_from_db()
    assert user.profile.total_exp == 50


def test_duplicate_event_does_not_award_twice(player, user):
    player.clear("1-1")
    replay = player.send("LEVEL_COMPLETED", "1-1", seq=player.seq)  # 同一序號重送
    assert replay.json()["data"] == {"duplicate": True, "is_correct": None, "reward": None, "feedback": None}
    again = player.send("LEVEL_COMPLETED", "1-1")  # 新序號、但關卡已完成
    assert again.json()["data"]["duplicate"] is True
    user.profile.refresh_from_db()
    assert user.profile.total_exp == 50
    assert ExperienceTransaction.objects.filter(user=user).count() == 1


def test_replaying_a_cleared_level_gives_reduced_exp(client, game, user):
    Player(client, game).clear("1-1")
    second = Player(client, game).clear("1-1").json()["data"]["reward"]
    assert second["is_first_clear"] is False and second["exp_awarded"] == 15
    user.profile.refresh_from_db()
    assert user.profile.total_exp == 65
    # 開新局時，上一局會被標記為中途離開
    assert GameSession.objects.filter(user=user, status="abandoned").count() == 1


def test_completion_requires_enough_correct_answers(player, user):
    player.send("LEVEL_STARTED", "1-1")
    player.answer("1-1", choice="ga", is_correct=False)
    player.age("1-1")
    res = player.send("LEVEL_COMPLETED", "1-1")
    assert res.status_code == 409 and res.json()["error"]["code"] == "conflict"
    user.profile.refresh_from_db()
    assert user.profile.total_exp == 0


def test_completion_rejects_impossibly_fast_clear(player):
    player.send("LEVEL_STARTED", "1-1")
    player.answer("1-1")
    assert player.send("LEVEL_COMPLETED", "1-1").status_code == 409


def test_levels_must_be_cleared_in_order(player):
    player.send("LEVEL_STARTED", "1-2")
    player.answer("1-2")
    player.age("1-2")
    assert player.send("LEVEL_COMPLETED", "1-2").status_code == 409


def test_server_judges_answer_from_choice_not_client_flag(player):
    player.send("LEVEL_STARTED", "1-1")
    lie = player.answer("1-1", question_key="Q01", choice="ga", is_correct=True)
    assert lie.json()["data"]["is_correct"] is False
    attempt = QuestionAttempt.objects.get()
    assert attempt.is_correct is False and attempt.verified is True

    unknown = player.answer("1-1", question_key="Q01", choice="", is_correct=True)
    assert unknown.json()["data"]["is_correct"] is True
    assert QuestionAttempt.objects.filter(verified=False).count() == 1


def test_event_validation(player):
    assert player.send("LEVEL_STARTED", "9-9").status_code == 400
    assert player.send("QUESTION_ANSWERED", "1-1").status_code == 400
    assert player.send("HACK", "1-1").status_code == 400
    player.send("LEVEL_STARTED", "1-1")
    assert player.answer("1-1", question_key="Q999").status_code == 400


def test_other_users_session_is_not_accessible(player, make_user):
    intruder = APIClient()
    intruder.force_authenticate(make_user("mallory"))
    url = f"/api/game-sessions/{player.session_id}"
    body = {"seq": 1, "type": "LEVEL_STARTED", "level_key": "1-1"}
    assert intruder.post(f"{url}/events/", body, format="json").status_code == 404
    assert intruder.post(f"{url}/complete/", {"outcome": "failed"}, format="json").status_code == 404
    assert LearningRecord.objects.count() == 0


def test_game_over_closes_session_and_computes_answer_score(player):
    player.send("LEVEL_STARTED", "1-1")
    player.answer("1-1", choice="ga", is_correct=False)
    player.answer("1-1", choice="wa", is_correct=False)
    res = player.complete("failed", battle_score=9999)
    data = res.json()["data"]
    assert data["status"] == "failed"
    assert data["answer_score"] == 480  # 500 - 2 × 10，由伺服器依作答紀錄計算
    assert data["battle_score"] == 140  # 遊戲端回報值被限制在原遊戲的上限內
    assert player.send("LEVEL_STARTED", "1-2").status_code == 409
    assert player.complete("cleared").json()["data"]["status"] == "failed"  # 冪等


def test_cannot_claim_clear_without_finishing_all_levels(player):
    player.clear("1-1")
    assert player.complete("cleared").status_code == 409


def test_full_run_and_learning_records(player, client, game, user):
    for level in game.levels.order_by("order"):
        assert player.clear(level.key).status_code == 200
    done = player.complete("cleared", battle_score=120).json()["data"]
    assert done["status"] == "cleared" and done["total_score"] == 620

    user.profile.refresh_from_db()
    assert user.profile.total_exp == 5 * 50 + 150 + 5 * 80 + 250 + 5 * 110 + 350  # 1050

    records = client.get("/api/learning-records/").json()["data"]
    assert records["count"] == 18
    first = records["results"][-1]
    assert first["level_key"] == "1-1" and first["completed"] and first["exp_awarded"] == 50

    levels = client.get(f"/api/games/{game.slug}/levels/").json()["data"]
    assert all(level["cleared"] for level in levels)
    listing = client.get("/api/games/").json()["data"][0]
    assert listing["levels_total"] == 18 and listing["levels_cleared"] == 18


def test_learning_records_are_private(player, make_user):
    player.clear("1-1")
    other = APIClient()
    other.force_authenticate(make_user("jiro"))
    assert other.get("/api/learning-records/").json()["data"]["count"] == 0


def test_abandoned_session_ends_at_last_activity(client, game):
    """中途離開的局要到下次開局才會被標記；結束時間應該是最後一次作答，而不是標記的當下。"""
    first = Player(client, game)
    first.send("LEVEL_STARTED", "1-1")
    first.answer("1-1")

    Player(client, game)  # 之後才回來開新的一局
    session = GameSession.objects.get(pk=first.session_id)
    assert session.status == GameSession.Status.ABANDONED
    assert session.ended_at == QuestionAttempt.objects.get(record__session=session).created_at
