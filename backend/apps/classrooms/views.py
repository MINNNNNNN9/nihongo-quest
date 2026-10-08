from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services


class ClassroomCreateSerializer(serializers.Serializer):
    name = serializers.CharField(min_length=2, max_length=40)


class ClassroomJoinSerializer(serializers.Serializer):
    code = serializers.CharField(min_length=6, max_length=6)


class ClassroomListView(APIView):
    """我教的班級與我加入的班級。"""

    @extend_schema(responses={200: dict})
    def get(self, request):
        return Response([services.summary(c, request.user) for c in services.classrooms_for(request.user)])

    @extend_schema(request=ClassroomCreateSerializer, responses={201: dict})
    def post(self, request):
        serializer = ClassroomCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        classroom = services.create(request.user, serializer.validated_data["name"])
        return Response(services.summary(classroom, request.user), status=status.HTTP_201_CREATED)


class ClassroomJoinView(APIView):
    throttle_scope = "auth"  # 代碼只有 6 碼，限流避免被暴力嘗試

    @extend_schema(request=ClassroomJoinSerializer, responses={200: dict})
    def post(self, request):
        serializer = ClassroomJoinSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        classroom = services.join(request.user, serializer.validated_data["code"])
        return Response(services.summary(classroom, request.user))


class ClassroomDetailView(APIView):
    @extend_schema(responses={200: dict})
    def get(self, request, code):
        return Response(services.detail(services.get_visible(request.user, code), request.user))

    @extend_schema(responses={204: None})
    def delete(self, request, code):
        classroom = services.get_visible(request.user, code)
        if classroom.teacher_id != request.user.id:
            raise PermissionDenied("只有老師可以刪除班級")
        classroom.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ClassroomLeaveView(APIView):
    @extend_schema(request=None, responses={204: None})
    def post(self, request, code):
        services.leave(request.user, services.get_visible(request.user, code))
        return Response(status=status.HTTP_204_NO_CONTENT)
