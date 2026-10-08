from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.games.models import Game

from apps.gamification.services import progress_for

from . import review, services
from .models import LearningRecord
from .serializers import (
    EventResultSerializer,
    EventSerializer,
    LearningRecordSerializer,
    ReviewAnswerSerializer,
    SessionCompleteSerializer,
    SessionCreateSerializer,
    SessionSerializer,
)


class GameEventView(APIView):
    throttle_scope = "game_events"


class SessionCreateView(GameEventView):
    @extend_schema(request=SessionCreateSerializer, responses={201: SessionSerializer})
    def post(self, request):
        serializer = SessionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        game = get_object_or_404(Game, slug=serializer.validated_data["game"], is_active=True)
        session = services.start_session(request.user, game)
        return Response(SessionSerializer(session).data, status=status.HTTP_201_CREATED)


class SessionEventView(GameEventView):
    @extend_schema(request=EventSerializer, responses={200: EventResultSerializer})
    def post(self, request, session_id):
        serializer = EventSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = services.handle_event(request.user, session_id, serializer.validated_data)
        return Response(EventResultSerializer(result).data)


class SessionCompleteView(GameEventView):
    @extend_schema(request=SessionCompleteSerializer, responses={200: SessionSerializer})
    def post(self, request, session_id):
        serializer = SessionCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session = services.complete_session(
            request.user,
            session_id,
            serializer.validated_data["outcome"],
            serializer.validated_data.get("battle_score"),
        )
        return Response(SessionSerializer(session).data)


class LearningRecordListView(generics.ListAPIView):
    """只列出自己的學習紀錄。"""

    serializer_class = LearningRecordSerializer

    def get_queryset(self):
        qs = (
            LearningRecord.objects.filter(session__user=self.request.user)
            .select_related("level__game", "experience")
            .order_by("-started_at")
        )
        game = self.request.query_params.get("game")
        return qs.filter(level__game__slug=game) if game else qs


class ReviewSummaryView(APIView):
    @extend_schema(responses={200: dict})
    def get(self, request):
        return Response(review.summary(request.user))


class ReviewNextView(APIView):
    @extend_schema(responses={200: dict})
    def get(self, request):
        mode = "mistakes" if request.query_params.get("mode") == "mistakes" else "mixed"
        return Response(review.next_batch(request.user, mode, request.query_params.get("topic") or None))


class ReviewAnswerView(GameEventView):
    @extend_schema(request=ReviewAnswerSerializer, responses={200: dict})
    def post(self, request):
        serializer = ReviewAnswerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = review.answer(request.user, **serializer.validated_data)
        return Response({**result, "progress": progress_for(request.user)})
