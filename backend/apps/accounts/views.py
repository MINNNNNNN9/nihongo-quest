from django.contrib.auth import login, logout, update_session_auth_hash
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import ChangePasswordSerializer, LoginSerializer, ProfileSerializer, RegisterSerializer


class AuthThrottledView(APIView):
    """註冊／登入等未登入端點：嚴格限流，並強制 CSRF（SessionAuthentication 只保護已登入請求）。"""

    permission_classes = [AllowAny]
    throttle_scope = "auth"


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    """SPA 啟動時呼叫一次以取得 csrftoken cookie。"""

    permission_classes = [AllowAny]

    @extend_schema(responses={200: None})
    def get(self, request):
        return Response({"detail": "ok"})


@method_decorator(csrf_protect, name="dispatch")
class RegisterView(AuthThrottledView):
    @extend_schema(request=RegisterSerializer, responses={201: ProfileSerializer})
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        login(request, user)
        return Response(ProfileSerializer(user.profile).data, status=status.HTTP_201_CREATED)


@method_decorator(csrf_protect, name="dispatch")
class LoginView(AuthThrottledView):
    @extend_schema(request=LoginSerializer, responses={200: ProfileSerializer})
    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        login(request, serializer.validated_data["user"])  # 會輪替 session key，防 session fixation
        return Response(ProfileSerializer(serializer.validated_data["user"].profile).data)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """只會回傳／修改 request.user 自己的資料，沒有可被竄改的使用者 ID 參數（防 IDOR）。"""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: ProfileSerializer})
    def get(self, request):
        return Response(ProfileSerializer(request.user.profile).data)

    @extend_schema(request=ProfileSerializer, responses={200: ProfileSerializer})
    def patch(self, request):
        serializer = ProfileSerializer(request.user.profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_scope = "auth"

    @extend_schema(request=ChangePasswordSerializer, responses={204: None})
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        update_session_auth_hash(request, request.user)  # 目前裝置保持登入，其他裝置的 session 失效
        return Response(status=status.HTTP_204_NO_CONTENT)
