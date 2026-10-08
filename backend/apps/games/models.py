from django.db import models
from django.db.models import Q


class Game(models.Model):
    slug = models.SlugField(unique=True)
    title = models.CharField(max_length=80)
    subtitle = models.CharField(max_length=120, blank=True)
    description = models.TextField(blank=True)
    controls = models.TextField("操作說明", blank=True)
    # 播放器要載入的 .sb3 與事件轉接設定（相對於前端靜態根目錄）
    bundle_path = models.CharField(max_length=200)
    adapter_path = models.CharField(max_length=200)
    scratch_project_id = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class GameLevel(models.Model):
    class Kind(models.TextChoices):
        STAGE = "stage", "一般關卡"
        BOSS = "boss", "魔王戰"

    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="levels")
    key = models.CharField(max_length=20)  # 遊戲內的關卡代號，例如 1-1、1-X
    order = models.PositiveSmallIntegerField()
    chapter = models.PositiveSmallIntegerField(default=1)
    title = models.CharField(max_length=80)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.STAGE)
    questions_required = models.PositiveSmallIntegerField("過關所需答對題數")
    exp_reward = models.PositiveIntegerField("首次通關 EXP")
    min_seconds = models.PositiveSmallIntegerField("合理的最短通關秒數", default=5)

    class Meta:
        ordering = ["game", "order"]
        constraints = [
            models.UniqueConstraint(fields=["game", "key"], name="level_unique_key_per_game"),
            models.UniqueConstraint(fields=["game", "order"], name="level_unique_order_per_game"),
            models.CheckConstraint(condition=Q(questions_required__gte=1), name="level_requires_question"),
        ]

    def __str__(self):
        return f"{self.game.slug} {self.key}"


class Question(models.Model):
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="questions")
    key = models.CharField(max_length=20)  # 例如 Q01，對應遊戲內的題號
    number = models.PositiveSmallIntegerField()
    topic = models.CharField("文法主題", max_length=20, db_index=True)
    context = models.CharField("前導句", max_length=200, blank=True)
    prompt = models.CharField("題幹", max_length=200)
    hint_zh = models.CharField("中文提示", max_length=200, blank=True)
    correct_answer = models.CharField(max_length=40)
    # [{"sprite": 遊戲內選項角色名, "label": 顯示文字}]，伺服器用它由「玩家點的選項」判定對錯
    choices = models.JSONField(default=list)
    # False：只出現在網頁的複習模式，原本的 Scratch 遊戲裡沒有這一題
    in_game = models.BooleanField("遊戲內題目", default=True)

    class Meta:
        ordering = ["game", "number"]
        constraints = [
            models.UniqueConstraint(fields=["game", "key"], name="question_unique_key_per_game"),
        ]

    def __str__(self):
        return f"{self.key} {self.prompt}"

    def label_for(self, sprite: str) -> str | None:
        return next((c["label"] for c in self.choices if c["sprite"] == sprite), None)
