from django.urls import path

from . import views

urlpatterns = [
    path("game-sessions/", views.SessionCreateView.as_view()),
    path("game-sessions/<uuid:session_id>/events/", views.SessionEventView.as_view()),
    path("game-sessions/<uuid:session_id>/complete/", views.SessionCompleteView.as_view()),
    path("learning-records/", views.LearningRecordListView.as_view()),
]
