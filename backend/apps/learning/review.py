"""錯題複習：不經過 Scratch 的網頁小測驗。

出題與判定都在伺服器（前端拿不到正解），所以這裡的作答紀錄可以完全採信。
"""
import random
from collections import defaultdict

from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from apps.games.furigana import annotate
from apps.games.models import Question
from apps.games.topics import TOPIC_LABELS, TOPIC_NOTES
from apps.gamification import services as gamification
from apps.gamification.models import ExperienceTransaction

from .models import QuestionAttempt, ReviewAttempt

BATCH_SIZE = 10
MAX_DEBT = 3
REVIEW_EXP = 2  # 複習答對一題的 EXP
REVIEW_EXP_DAILY_CAP = 40  # 每天上限，避免靠重複作答刷等級


def debts(user) -> dict[int, int]:
    """每一題還「欠」幾次答對：答錯 +1（上限 3）、答對 -1。大於 0 就是待複習的題目。"""
    history = [
        *QuestionAttempt.objects.filter(record__session__user=user).values_list(
            "created_at", "question_id", "is_correct"
        ),
        *ReviewAttempt.objects.filter(user=user).values_list("created_at", "question_id", "is_correct"),
    ]
    debt: dict[int, int] = defaultdict(int)
    for _, question_id, is_correct in sorted(history):
        debt[question_id] = max(0, debt[question_id] - 1) if is_correct else min(MAX_DEBT, debt[question_id] + 1)
    return {question_id: n for question_id, n in debt.items() if n > 0}


def feedback(question: Question, choice_label: str = "") -> dict:
    """作答後給玩家看的解說。"""
    return {
        "question_id": question.id,
        "context": question.context,
        "prompt": question.prompt,
        "context_ruby": annotate(question.context),
        "prompt_ruby": annotate(question.prompt),
        "choice": choice_label,
        "correct_answer": question.correct_answer,
        "hint_zh": question.hint_zh.strip(),
        "topic": question.topic,
        "topic_label": TOPIC_LABELS.get(question.topic, question.topic),
        "note": TOPIC_NOTES.get(question.topic, ""),
    }


def _public(question: Question, debt: int) -> dict:
    # 不含正解與提示；選項順序每次打亂
    labels = [c["label"] for c in question.choices]
    random.shuffle(labels)
    return {
        "id": question.id,
        "topic": question.topic,
        "topic_label": TOPIC_LABELS.get(question.topic, question.topic),
        "context": question.context,
        "prompt": question.prompt,
        "context_ruby": annotate(question.context),
        "prompt_ruby": annotate(question.prompt),
        "choices": labels,
        "debt": debt,
    }


def _exp_today(user) -> int:
    rows = ExperienceTransaction.objects.filter(
        user=user, reason=ExperienceTransaction.Reason.REVIEW, created_at__date=timezone.localdate()
    ).values_list("amount", flat=True)
    return sum(rows)


def summary(user) -> dict:
    debt = debts(user)
    topics: dict[str, dict] = {}
    for question in Question.objects.filter(game__is_active=True).order_by("number"):
        row = topics.setdefault(question.topic, {"total": 0, "pending": 0})
        row["total"] += 1
        row["pending"] += question.id in debt
    return {
        "pending": len(debt),
        "exp_today": _exp_today(user),
        "exp_daily_cap": REVIEW_EXP_DAILY_CAP,
        "topics": [{"topic": topic, "label": TOPIC_LABELS.get(topic, topic), **row} for topic, row in topics.items()],
    }


def next_batch(user, mode: str, topic: str | None) -> list[dict]:
    """抽一輪題目。mistakes：只出待複習的題；mixed：全部題目，但錯過的題出現機率較高。"""
    questions = Question.objects.filter(game__is_active=True)
    if topic:
        questions = questions.filter(topic=topic)
    debt = debts(user)
    pool = [(q, debt.get(q.id, 0)) for q in questions]
    if mode == "mistakes":
        pool = [(q, d) for q, d in pool if d > 0]
    picked = []
    while pool and len(picked) < BATCH_SIZE:
        index = random.choices(range(len(pool)), weights=[1 + 4 * d for _, d in pool])[0]
        picked.append(pool.pop(index))
    return [_public(q, d) for q, d in picked]


def answer(user, question_id: int, choice: str) -> dict:
    question = Question.objects.filter(pk=question_id, game__is_active=True).first()
    if question is None:
        raise NotFound("找不到這一題")
    if choice not in [c["label"] for c in question.choices]:
        raise ValidationError({"choice": "這一題沒有這個選項"})

    is_correct = choice == question.correct_answer
    ReviewAttempt.objects.create(user=user, question=question, choice=choice, is_correct=is_correct)
    exp = 0
    if is_correct and _exp_today(user) < REVIEW_EXP_DAILY_CAP:
        exp = gamification.grant(user, REVIEW_EXP, ExperienceTransaction.Reason.REVIEW)
    return {
        "is_correct": is_correct,
        "exp_awarded": exp,
        "debt": debts(user).get(question.id, 0),
        "feedback": feedback(question, choice),
    }
