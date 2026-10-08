from django.urls import path

from . import views

urlpatterns = [
    path("player/profile/", views.PlayerProfileView.as_view()),
    path("player/experience/", views.ExperienceHistoryView.as_view()),
    path("player/dashboard/", views.DashboardView.as_view()),
    path("player/quests/", views.QuestOverviewView.as_view()),
    path("player/quests/<slug:key>/claim/", views.QuestClaimView.as_view()),
    path("leaderboard/", views.LeaderboardView.as_view()),
]
