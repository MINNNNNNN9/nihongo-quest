import json
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.games.models import Game, GameLevel, Question

SEED_DIR = Path(__file__).resolve().parents[2] / "seed"


def _load(name: str) -> list[dict]:
    return json.loads((SEED_DIR / name).read_text(encoding="utf-8"))


def _sync(model, game: Game, rows: list[dict]) -> int:
    """讓資料表和種子資料一致；只寫入有差異的列，回傳寫入的筆數。

    每次啟動都會執行，所以沒有變動時只做一次查詢——資料庫在遠端時，逐筆 update_or_create 會拖慢啟動。
    """
    existing = {obj.key: obj for obj in model.objects.filter(game=game)}
    written = 0
    for row in rows:
        fields = {name: value for name, value in row.items() if name != "key"}
        obj = existing.get(row["key"])
        if obj is None:
            model.objects.create(game=game, key=row["key"], **fields)
        elif any(getattr(obj, name) != value for name, value in fields.items()):
            for name, value in fields.items():
                setattr(obj, name, value)
            obj.save(update_fields=list(fields))
        else:
            continue
        written += 1
    return written


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

            slug = data.pop("slug")
            game = Game.objects.filter(slug=slug).first()
            if game is None:
                game = Game.objects.create(slug=slug, **data)
            elif any(getattr(game, name) != value for name, value in data.items()):
                Game.objects.filter(pk=game.pk).update(**data)

            written = _sync(GameLevel, game, [{**level, "order": order} for order, level in enumerate(levels, start=1)])
            written += _sync(
                Question,
                game,
                [{**q, "in_game": True} for q in questions] + [{**q, "in_game": False} for q in extras],
            )
            self.stdout.write(
                self.style.SUCCESS(
                    f"{game.title}: {len(levels)} 關卡、{len(questions)} 題、補充 {len(extras)} 題（更新 {written} 筆）"
                )
            )
