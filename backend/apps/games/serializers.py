from rest_framework import serializers

from .models import Game, GameLevel
from .topics import TOPIC_LABELS


class GameSerializer(serializers.ModelSerializer):
    levels_total = serializers.IntegerField(read_only=True)
    levels_cleared = serializers.IntegerField(read_only=True)
    last_played_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Game
        fields = [
            "slug", "title", "subtitle", "description", "controls", "bundle_path", "adapter_path",
            "scratch_project_id", "levels_total", "levels_cleared", "last_played_at",
        ]


class GameDetailSerializer(GameSerializer):
    question_count = serializers.IntegerField(read_only=True)
    topics = serializers.SerializerMethodField()

    class Meta(GameSerializer.Meta):
        fields = GameSerializer.Meta.fields + ["question_count", "topics"]

    def get_topics(self, obj) -> list[dict]:
        counts = {}
        for topic in obj.questions.values_list("topic", flat=True):
            counts[topic] = counts.get(topic, 0) + 1
        return [{"topic": t, "label": TOPIC_LABELS.get(t, t), "questions": n} for t, n in counts.items()]


class GameLevelSerializer(serializers.ModelSerializer):
    cleared = serializers.BooleanField(read_only=True)
    clear_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = GameLevel
        fields = [
            "key", "order", "chapter", "title", "kind", "questions_required", "exp_reward", "cleared", "clear_count",
        ]
