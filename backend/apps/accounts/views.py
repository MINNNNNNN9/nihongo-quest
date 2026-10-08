from django.conf import settings
from django.contrib.auth import login, logout, update_session_auth_hash
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import User
from .serializers import (
    ChangePasswordSerializer,
    ForgotPasswordSerializer,
    LoginSerializer,
    ProfileSerializer,
    RegisterSerializer,
    ResetPasswordSerializer,
)


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


@method_decorator(csrf_protect, name="dispatch")
class ForgotPasswordView(AuthThrottledView):
    """忘記密碼：寄出重設連結。不論信箱是否存在都回 204，避免被用來探測誰有註冊。"""

    @extend_schema(responses={200: dict})
    def get(self, request):
        # 前端用來決定要顯示表單，還是請使用者聯絡管理員
        return Response({"enabled": settings.EMAIL_ENABLED})

    @extend_schema(request=ForgotPasswordSerializer, responses={204: None})
    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(email__iexact=serializer.validated_data["email"], is_active=True).first()
        if user and settings.EMAIL_ENABLED and user.has_usable_password():
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            scheme = "https" if request.is_secure() else "http"
            link = f"{scheme}://{request.get_host()}/reset-password?uid={uid}&token={token}"
            hours = settings.PASSWORD_RESET_TIMEOUT // 3600
            send_mail(
                "Nihongo Quest 重設密碼",
                f"{user.profile.display_name} 你好：\n\n"
                f"你的登入帳號是 {user.username}。請在 {hours} 小時內打開下面的連結設定新密碼：\n\n{link}\n\n"
                "如果你沒有申請重設密碼，請忽略這封信，密碼不會被更改。\n",
                None,
                [user.email],
                fail_silently=True,  # 寄信失敗不能讓回應不同，否則一樣會洩漏信箱是否存在
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(csrf_protect, name="dispatch")
class ResetPasswordView(AuthThrottledView):
    @extend_schema(request=ResetPasswordSerializer, responses={204: None})
    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        user.set_password(serializer.validated_data["new_password"])  # 密碼一改，同一個連結就失效
        user.save(update_fields=["password"])
        return Response(status=status.HTTP_204_NO_CONTENT)
