from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.serializers import ProfileSerializer

from . import quests, stats
from .models import ExperienceTransaction
from .services import progress_for


class ExperienceSerializer(serializers.ModelSerializer):
    reason_label = serializers.CharField(source="get_reason_display", read_only=True)
    level_title = serializers.CharField(source="learning_record.level.title", read_only=True, default=None)
    game_title = serializers.CharField(source="learning_record.level.game.title", read_only=True, default=None)
    is_first_clear = serializers.BooleanField(source="learning_record.is_first_clear", read_only=True, default=None)

    class Meta:
        model = ExperienceTransaction
        fields = ["id", "amount", "reason", "reason_label", "game_title", "level_title", "is_first_clear", "created_at"]


class PlayerProfileView(APIView):
    @extend_schema(responses={200: ProfileSerializer})
    def get(self, request):
        return Response(ProfileSerializer(request.user.profile).data)


class ExperienceHistoryView(generics.ListAPIView):
    serializer_class = ExperienceSerializer

    def get_queryset(self):
        return ExperienceTransaction.objects.filter(user=self.request.user).select_related(
            "learning_record__level__game"
        )


class DashboardView(APIView):
    @extend_schema(responses={200: dict})
    def get(self, request):
        return Response(stats.dashboard(request.user))


class QuestOverviewView(APIView):
    """連續學習天數、今日任務與成就。"""

    @extend_schema(responses={200: dict})
    def get(self, request):
        return Response(quests.overview(request.user))


class QuestClaimView(APIView):
    throttle_scope = "game_events"

    @extend_schema(request=None, responses={200: dict})
    def post(self, request, key):
        awarded = quests.claim_quest(request.user, key)
        return Response({"exp_awarded": awarded, "progress": progress_for(request.user)})


class LeaderboardView(APIView):
    @extend_schema(
        parameters=[
            OpenApiParameter("board", str, enum=["exp", "levels", "score"], description="exp=累積 EXP、levels=通過關卡數、score=最高總評價"),
            OpenApiParameter("game", str, description="score 排行榜可指定遊戲 slug"),
        ],
        responses={200: dict},
    )
    def get(self, request):
        if request.query_params.get("board") == "levels":
            return Response(stats.levels_leaderboard(request.user))
        if request.query_params.get("board") == "score":
            return Response(stats.score_leaderboard(request.user, request.query_params.get("game")))
        return Response(stats.exp_leaderboard(request.user))
