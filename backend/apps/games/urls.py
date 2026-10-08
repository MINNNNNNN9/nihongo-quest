from django.urls import path

from . import views

urlpatterns = [
    path("games/", views.GameListView.as_view()),
    path("games/<slug:slug>/", views.GameDetailView.as_view()),
    path("games/<slug:slug>/levels/", views.GameLevelListView.as_view()),
]
