from rest_framework import serializers

from apps.gamification.leveling import level_progress

from .models import GameSession, LearningRecord


class SessionCreateSerializer(serializers.Serializer):
    game = serializers.SlugField()


class EventSerializer(serializers.Serializer):
    seq = serializers.IntegerField(min_value=1, max_value=1_000_000)
    type = serializers.ChoiceField(["LEVEL_STARTED", "QUESTION_ANSWERED", "LEVEL_COMPLETED"])
    level_key = serializers.CharField(max_length=20)
    question_key = serializers.CharField(max_length=20, required=False)
    choice = serializers.CharField(max_length=40, required=False, allow_blank=True)
    is_correct = serializers.BooleanField(required=False)

    def validate(self, attrs):
        if attrs["type"] == "QUESTION_ANSWERED":
            missing = [f for f in ("question_key", "is_correct") if f not in attrs]
            if missing:
                raise serializers.ValidationError({f: "QUESTION_ANSWERED 需要此欄位" for f in missing})
        return attrs


class SessionCompleteSerializer(serializers.Serializer):
    outcome = serializers.ChoiceField(["cleared", "failed"])
    battle_score = serializers.IntegerField(required=False, min_value=-10_000, max_value=10_000)


class SessionSerializer(serializers.ModelSerializer):
    game = serializers.SlugRelatedField(slug_field="slug", read_only=True)
    total_score = serializers.IntegerField(read_only=True)

    class Meta:
        model = GameSession
        fields = ["id", "game", "status", "started_at", "ended_at", "answer_score", "battle_score", "total_score"]


class RewardSerializer(serializers.Serializer):
    exp_awarded = serializers.IntegerField()
    is_first_clear = serializers.BooleanField()
    leveled_up = serializers.BooleanField()
    level_before = serializers.IntegerField()
    progress = serializers.SerializerMethodField()

    def get_progress(self, obj) -> dict:
        return level_progress(obj.total_exp)


class EventResultSerializer(serializers.Serializer):
    duplicate = serializers.BooleanField()
    is_correct = serializers.BooleanField(allow_null=True)
    reward = RewardSerializer(allow_null=True)


class LearningRecordSerializer(serializers.ModelSerializer):
    session_id = serializers.UUIDField(read_only=True)
    game = serializers.CharField(source="level.game.slug", read_only=True)
    game_title = serializers.CharField(source="level.game.title", read_only=True)
    level_key = serializers.CharField(source="level.key", read_only=True)
    level_title = serializers.CharField(source="level.title", read_only=True)
    completed = serializers.BooleanField(source="is_completed", read_only=True)
    exp_awarded = serializers.SerializerMethodField()

    class Meta:
        model = LearningRecord
        fields = [
            "id", "session_id", "game", "game_title", "level_key", "level_title", "started_at", "completed_at",
            "completed", "correct_count", "wrong_count", "is_first_clear", "exp_awarded",
        ]

    def get_exp_awarded(self, obj) -> int:
        tx = getattr(obj, "experience", None)
        return tx.amount if tx else 0
