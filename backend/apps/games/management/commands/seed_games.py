import json
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.games.models import Game, GameLevel, Question

SEED_DIR = Path(__file__).resolve().parents[2] / "seed"


def _load(name: str) -> list[dict]:
    return json.loads((SEED_DIR / name).read_text(encoding="utf-8"))


class Command(BaseCommand):
    help = "建立／更新遊戲、關卡與題庫（可重複執行，不會產生重複資料）"

    @transaction.atomic
    def handle(self, *args, **options):
        for path in sorted(SEED_DIR.glob("*.json")):
            data = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(data, dict) or "slug" not in data:
                continue  # 題庫檔由遊戲定義檔引用
            levels = data.pop("levels")
            questions = _load(data.pop("questions_file"))
            # 只在網頁複習模式出現的補充題（原 Scratch 專案裡沒有）
            extra_file = data.pop("extra_questions_file", None)
            extras = _load(extra_file) if extra_file else []
            game, _ = Game.objects.update_or_create(slug=data.pop("slug"), defaults=data)
            for order, level in enumerate(levels, start=1):
                GameLevel.objects.update_or_create(game=game, key=level.pop("key"), defaults={**level, "order": order})
            for in_game, batch in ((True, questions), (False, extras)):
                for q in batch:
                    Question.objects.update_or_create(game=game, key=q.pop("key"), defaults={**q, "in_game": in_game})
            self.stdout.write(
                self.style.SUCCESS(f"{game.title}: {len(levels)} 關卡、{len(questions)} 題、補充 {len(extras)} 題")
            )
