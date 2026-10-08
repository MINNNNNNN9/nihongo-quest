from django.contrib.auth import authenticate, password_validation
from django.contrib.auth.tokens import default_token_generator
from django.db import transaction
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from apps.gamification.leveling import level_progress

from .models import PlayerProfile, User


class ProfileSerializer(serializers.ModelSerializer):
    """目前登入者自己的資料（含 email，僅本人可見）。"""

    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.EmailField(
        source="user.email",
        validators=[UniqueValidator(User.objects.all(), message="這個電子郵件已被使用")],
    )
    display_name = serializers.CharField(
        min_length=2,
        max_length=20,
        validators=[UniqueValidator(PlayerProfile.objects.all(), message="這個暱稱已被使用")],
    )
    progress = serializers.SerializerMethodField()
    is_staff = serializers.BooleanField(source="user.is_staff", read_only=True)

    class Meta:
        model = PlayerProfile
        fields = [
            "username", "email", "display_name", "show_on_leaderboard", "total_exp", "progress", "created_at",
            "is_teacher", "is_staff",
        ]
        read_only_fields = ["total_exp", "created_at", "is_teacher"]

    def get_progress(self, obj) -> dict:
        return level_progress(obj.total_exp)

    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})
        with transaction.atomic():
            if "email" in user_data:
                instance.user.email = user_data["email"]
                instance.user.save(update_fields=["email"])
            return super().update(instance, validated_data)


class RegisterSerializer(serializers.Serializer):
    username = serializers.RegexField(
        r"^[A-Za-z0-9_]{3,30}$",
        error_messages={"invalid": "帳號需為 3–30 個英數字或底線"},
        validators=[UniqueValidator(User.objects.all(), lookup="iexact", message="這個帳號已被使用")],
    )
    email = serializers.EmailField(
        validators=[UniqueValidator(User.objects.all(), lookup="iexact", message="這個電子郵件已被使用")]
    )
    display_name = serializers.CharField(
        min_length=2,
        max_length=20,
        validators=[UniqueValidator(PlayerProfile.objects.all(), message="這個暱稱已被使用")],
    )
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        candidate = User(username=attrs["username"], email=attrs["email"])
        password_validation.validate_password(attrs["password"], candidate)
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        user = User(username=validated_data["username"], email=validated_data["email"].lower())
        user.set_password(validated_data["password"])
        user._profile_display_name = validated_data["display_name"]  # 告知 signal 由這裡建立 profile
        user.save()
        PlayerProfile.objects.create(user=user, display_name=validated_data["display_name"])
        return user


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        user = authenticate(self.context["request"], username=attrs["username"], password=attrs["password"])
        if user is None:
            # 不區分「帳號不存在」與「密碼錯誤」，避免帳號列舉
            raise serializers.ValidationError("帳號或密碼錯誤")
        attrs["user"] = user
        return attrs


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("目前密碼不正確")
        return value

    def validate_new_password(self, value):
        password_validation.validate_password(value, self.context["request"].user)
        return value


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        invalid = serializers.ValidationError("這個重設連結無效或已經過期，請重新申請")
        try:
            user = User.objects.get(pk=force_str(urlsafe_base64_decode(attrs["uid"])), is_active=True)
        except (User.DoesNotExist, ValueError, OverflowError):
            raise invalid
        if not default_token_generator.check_token(user, attrs["token"]):
            raise invalid
        password_validation.validate_password(attrs["new_password"], user)
        attrs["user"] = user
        return attrs
