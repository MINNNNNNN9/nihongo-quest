import pytest
from rest_framework.test import APIClient

from apps.gamification.leveling import level_for, level_progress, threshold
from conftest import Player

pytestmark = pytest.mark.django_db


def test_level_curve():
    assert [threshold(n) for n in (1, 2, 3, 4, 5)] == [0, 100, 300, 600, 1000]
    assert [level_for(exp) for exp in (0, 99, 100, 299, 300, 1050)] == [1, 1, 2, 2, 3, 5]
    assert level_progress(150) == {
        "level": 2, "title": "見習騎士", "total_exp": 150, "exp_into_level": 50, "exp_for_next_level": 200,
    }


def test_level_up_is_reported(player):
    player.clear("1-1")
    reward = player.clear("1-2").json()["data"]["reward"]
    assert reward["leveled_up"] is True and reward["level_before"] == 1
    assert reward["progress"]["level"] == 2


def test_experience_history(player, client):
    player.clear("1-1")
    data = client.get("/api/player/experience/").json()["data"]
    assert data["count"] == 1
    assert data["results"][0]["amount"] == 50
    assert data["results"][0]["level_title"] == "第一章・關卡 1"


def test_dashboard_statistics(player, client):
    player.send("LEVEL_STARTED", "1-1")
    player.answer("1-1", question_key="Q01", choice="ga", is_correct=False)
    player.answer("1-1", question_key="Q01", choice="(正解)mo")
    player.age("1-1")
    player.send("LEVEL_COMPLETED", "1-1")
    player.send("LEVEL_STARTED", "1-2")
    player.answer("1-2", question_key="Q71", choice="(正解)ga2")
    player.complete("failed")

    data = client.get("/api/player/dashboard/").json()["data"]
    assert data["total_sessions"] == 1 and data["cleared_sessions"] == 0
    assert data["questions_answered"] == 3 and data["accuracy"] == 0.667
    topics = {t["topic"]: t for t in data["topics"]}
    assert topics["mo"]["accuracy"] == 0.5 and topics["ga"]["accuracy"] == 1.0
    levels = {lv["key"]: lv for lv in data["levels"]}
    assert levels["1-1"]["completion_rate"] == 1.0 and levels["1-2"]["completion_rate"] == 0.0
    assert levels["1-3"]["completion_rate"] is None
    assert data["most_missed"][0]["key"] == "Q01" and data["most_missed"][0]["wrong"] == 1
    assert data["exp_history"][-1] == {**data["exp_history"][-1], "gained": 50, "total": 50}
    assert len(data["exp_history"]) == 14
    assert data["recent_sessions"][0]["levels_cleared"] == 1


def test_exp_leaderboard_respects_privacy(client, game, user, make_user):
    Player(client, game).clear("1-1")
    for name, levels in (("jiro", ["1-1", "1-2"]), ("hidden", ["1-1", "1-2", "1-3"])):
        other = make_user(name)
        api = APIClient()
        api.force_authenticate(other)
        p = Player(api, game)
        for key in levels:
            p.clear(key)
        if name == "hidden":
            api.patch("/api/auth/me/", {"show_on_leaderboard": False}, format="json")
            assert api.get("/api/leaderboard/").json()["data"] == {
                "board": "exp", "entries": [
                    {"rank": 1, "display_name": "jiro", "level": 2, "value": 100, "is_me": False},
                    {"rank": 2, "display_name": "taro", "level": 1, "value": 50, "is_me": False},
                ], "me": None, "hidden": True,
            }

    board = client.get("/api/leaderboard/").json()["data"]
    assert [e["display_name"] for e in board["entries"]] == ["jiro", "taro"]
    assert board["me"]["rank"] == 2 and board["me"]["value"] == 50
    # 不外洩帳號、email 或使用者 ID
    assert set(board["entries"][0]) == {"rank", "display_name", "level", "value", "is_me"}


def test_score_leaderboard_only_counts_cleared_runs(client, game, make_user):
    p = Player(client, game)
    for level in game.levels.order_by("order"):
        p.clear(level.key)
    p.complete("cleared", battle_score=100)

    api = APIClient()
    api.force_authenticate(make_user("jiro"))
    loser = Player(api, game)
    loser.clear("1-1")
    loser.complete("failed", battle_score=140)

    board = client.get("/api/leaderboard/?board=score&game=yuanze-knight").json()["data"]
    assert [(e["display_name"], e["value"]) for e in board["entries"]] == [("taro", 600)]
    assert board["me"]["rank"] == 1
    assert api.get("/api/leaderboard/?board=score").json()["data"]["me"] is None
