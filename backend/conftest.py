from datetime import timedelta

import pytest
from django.core.cache import cache
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.games.models import Game
from apps.learning.models import LearningRecord

PASSWORD = "Kn1ght-of-YZU!"


@pytest.fixture(autouse=True)
def _clear_throttle_cache():
    cache.clear()


@pytest.fixture
def game(db):
    call_command("seed_games", verbosity=0)
    return Game.objects.get(slug="yuanze-knight")


@pytest.fixture
def make_user(db):
    def _make(username="taro"):
        return User.objects.create_user(username, f"{username}@example.com", PASSWORD)

    return _make


@pytest.fixture
def user(make_user):
    return make_user()


@pytest.fixture
def client(user):
    api = APIClient()
    api.force_authenticate(user)
    return api


class Player:
    """以 API 模擬遊戲橋接層送出的事件。"""

    def __init__(self, api, game):
        self.api, self.game, self.seq = api, game, 0
        self.session_id = api.post("/api/game-sessions/", {"game": game.slug}, format="json").json()["data"]["id"]

    def send(self, type_, level_key, seq=None, **extra):
        if seq is None:
            self.seq += 1
            seq = self.seq
        body = {"seq": seq, "type": type_, "level_key": level_key, **extra}
        return self.api.post(f"/api/game-sessions/{self.session_id}/events/", body, format="json")

    def answer(self, level_key, question_key="Q01", choice="(正解)mo", is_correct=True):
        return self.send(
            "QUESTION_ANSWERED", level_key, question_key=question_key, choice=choice, is_correct=is_correct
        )

    def age(self, level_key, seconds=60):
        """把關卡開始時間往前調，模擬玩家真的花了時間。"""
        record = LearningRecord.objects.get(session_id=self.session_id, level__key=level_key)
        LearningRecord.objects.filter(pk=record.pk).update(started_at=record.started_at - timedelta(seconds=seconds))

    def clear(self, level_key):
        level = self.game.levels.get(key=level_key)
        self.send("LEVEL_STARTED", level_key)
        for _ in range(level.questions_required):
            self.answer(level_key)
        self.age(level_key)
        return self.send("LEVEL_COMPLETED", level_key)

    def complete(self, outcome, **extra):
        return self.api.post(
            f"/api/game-sessions/{self.session_id}/complete/", {"outcome": outcome, **extra}, format="json"
        )


@pytest.fixture
def player(client, game):
    return Player(client, game)
