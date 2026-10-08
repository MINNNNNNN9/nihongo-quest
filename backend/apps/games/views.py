from django.db.models import BooleanField, Count, ExpressionWrapper, Max, Q
from rest_framework import generics

from .models import Game, GameLevel
from .serializers import GameDetailSerializer, GameLevelSerializer, GameSerializer


def games_for(user):
    cleared = Q(levels__records__session__user=user, levels__records__completed_at__isnull=False)
    return Game.objects.filter(is_active=True).annotate(
        levels_total=Count("levels", distinct=True),
        levels_cleared=Count("levels", filter=cleared, distinct=True),
        last_played_at=Max("sessions__started_at", filter=Q(sessions__user=user)),
    )


class GameListView(generics.ListAPIView):
    serializer_class = GameSerializer
    pagination_class = None

    def get_queryset(self):
        return games_for(self.request.user).order_by("id")


class GameDetailView(generics.RetrieveAPIView):
    serializer_class = GameDetailSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return games_for(self.request.user).annotate(question_count=Count("questions", distinct=True))


class GameLevelListView(generics.ListAPIView):
    serializer_class = GameLevelSerializer
    pagination_class = None

    def get_queryset(self):
        mine = Q(records__session__user=self.request.user, records__completed_at__isnull=False)
        return (
            GameLevel.objects.filter(game__slug=self.kwargs["slug"], game__is_active=True)
            .annotate(clear_count=Count("records", filter=mine))
            .annotate(cleared=ExpressionWrapper(Q(clear_count__gt=0), output_field=BooleanField()))
            .order_by("order")
        )
