from datetime import timedelta

import pytest
from django.utils import timezone

from apps.games.furigana import annotate, uncovered
from apps.games.models import Question
from apps.gamification import quests
from apps.gamification.models import ExperienceTransaction
from apps.learning import review
from apps.learning.models import ReviewAttempt

pytestmark = pytest.mark.django_db


def answer(client, question, choice):
    return client.post("/api/review/answer/", {"question_id": question.id, "choice": choice}, format="json")


def test_every_kanji_has_a_reading(game):
    missing = {ch for q in Question.objects.all() for text in (q.context, q.prompt) for ch in uncovered(text)}
    assert missing == set()


def test_furigana_segments():
    assert annotate("私（？）エンジニアです。") == [["私", "わたし"], ["（？）エンジニアです。", ""]]
    assert annotate("午後4時") == [["午後", "ごご"], ["4時", "よじ"]]
    assert annotate("14時") == [["14", ""], ["時", "じ"]]  # 不會把 14時 的後半當成 4時（よじ）


def test_extra_questions_are_review_only(game, client):
    assert game.questions.filter(in_game=False).count() == 32
    detail = client.get(f"/api/games/{game.slug}/").json()["data"]
    assert detail["question_count"] == 75
    assert "wo" not in [t["topic"] for t in detail["topics"]]


def test_batch_never_reveals_the_answer(game, client):
    batch = client.get("/api/review/next/").json()["data"]
    assert len(batch) == review.BATCH_SIZE and len({q["id"] for q in batch}) == review.BATCH_SIZE
    assert set(batch[0]) == {
        "id", "topic", "topic_label", "context", "prompt", "context_ruby", "prompt_ruby", "choices", "debt",
    }
    topic_only = client.get("/api/review/next/?topic=wo").json()["data"]
    assert {q["topic"] for q in topic_only} == {"wo"}


def test_server_judges_the_answer_and_explains(game, client, user):
    question = game.questions.get(key="Q01")
    wrong = answer(client, question, "が").json()["data"]
    assert wrong["is_correct"] is False and wrong["exp_awarded"] == 0 and wrong["debt"] == 1
    assert wrong["feedback"]["correct_answer"] == "も" and wrong["feedback"]["note"]

    right = answer(client, question, "も").json()["data"]
    assert right["is_correct"] is True and right["exp_awarded"] == review.REVIEW_EXP and right["debt"] == 0
    assert right["progress"]["total_exp"] == review.REVIEW_EXP
    assert answer(client, question, "ね").status_code == 400  # 不在選項裡


def test_mistakes_mode_only_serves_pending_questions(game, client, player):
    assert client.get("/api/review/next/?mode=mistakes").json()["data"] == []
    # 在遊戲裡答錯的題目也會進到待複習
    player.send("LEVEL_STARTED", "1-1")
    player.answer("1-1", question_key="Q02", choice="ga", is_correct=False)
    pending = client.get("/api/review/next/?mode=mistakes").json()["data"]
    assert [q["prompt"] for q in pending] == ["学生たち（？）台湾人です。"]
    assert client.get("/api/review/").json()["data"]["pending"] == 1


def test_game_answer_event_returns_feedback(player):
    player.send("LEVEL_STARTED", "1-1")
    data = player.answer("1-1", question_key="Q01", choice="ga", is_correct=False).json()["data"]
    assert data["feedback"]["choice"] == "が" and data["feedback"]["correct_answer"] == "も"
    assert data["feedback"]["hint_zh"].startswith("爸爸是工程師")


def test_review_exp_has_a_daily_cap(game, client, user):
    question = game.questions.get(key="Q01")
    for _ in range(review.REVIEW_EXP_DAILY_CAP // review.REVIEW_EXP + 3):
        answer(client, question, "も")
    user.profile.refresh_from_db()
    assert user.profile.total_exp == review.REVIEW_EXP_DAILY_CAP


def test_daily_quest_is_claimed_once(game, client, user):
    question = game.questions.get(key="Q01")
    assert client.post("/api/player/quests/review_10/claim/").status_code == 409  # 還沒完成
    for _ in range(10):
        answer(client, question, "が")
    quest = next(q for q in client.get("/api/player/quests/").json()["data"]["quests"] if q["key"] == "review_10")
    assert quest["done"] is True and quest["claimed"] is False

    claimed = client.post("/api/player/quests/review_10/claim/").json()["data"]
    assert claimed["exp_awarded"] == 20 and claimed["progress"]["total_exp"] == 20
    assert client.post("/api/player/quests/review_10/claim/").status_code == 409
    assert ExperienceTransaction.objects.filter(user=user, reason="quest").count() == 1


def test_streak_counts_consecutive_days(game, user):
    question = game.questions.get(key="Q01")
    now = timezone.now()
    for days_ago in (0, 1, 2, 5, 6):
        attempt = ReviewAttempt.objects.create(user=user, question=question, choice="も", is_correct=True)
        ReviewAttempt.objects.filter(pk=attempt.pk).update(created_at=now - timedelta(days=days_ago))
    assert quests.streak(user) == {"current": 3, "best": 3, "active_today": True}


def test_achievements_unlock_once(player, client):
    player.clear("1-1")
    first = {a["key"]: a for a in client.get("/api/player/quests/").json()["data"]["achievements"]}
    assert first["first_clear"]["is_new"] is True and first["first_clear"]["unlocked_at"]
    assert first["chapter_1"]["progress"] == 1 and first["chapter_1"]["unlocked_at"] is None
    again = {a["key"]: a for a in client.get("/api/player/quests/").json()["data"]["achievements"]}
    assert again["first_clear"]["is_new"] is False and again["first_clear"]["unlocked_at"]
