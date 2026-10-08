from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.games.models import Game

from . import services
from .models import LearningRecord
from .serializers import (
    EventResultSerializer,
    EventSerializer,
    LearningRecordSerializer,
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
