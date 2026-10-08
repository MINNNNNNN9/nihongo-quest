from django.urls import path

from . import views

urlpatterns = [
    path("classes/", views.ClassroomListView.as_view()),
    path("classes/join/", views.ClassroomJoinView.as_view()),
    path("classes/<str:code>/", views.ClassroomDetailView.as_view()),
    path("classes/<str:code>/leave/", views.ClassroomLeaveView.as_view()),
]
