"""班級：班內排行榜（成員都看得到）與學習報告（只有老師看得到）。"""
from django.db.models import Count, Max, Q
from rest_framework.exceptions import NotFound, PermissionDenied

from apps.accounts.models import PlayerProfile
from apps.common.api import Conflict
from apps.gamification import stats
from apps.gamification.leveling import level_for
from apps.learning.models import LearningRecord, QuestionAttempt, ReviewAttempt

from .models import Classroom, Membership

MAX_CLASSES_PER_TEACHER = 10
MAX_MEMBERS = 200


def classrooms_for(user) -> list[Classroom]:
    return list(
        Classroom.objects.filter(Q(teacher=user) | Q(memberships__user=user))
        .distinct()
        .select_related("teacher__profile")
        .annotate(member_count=Count("memberships", distinct=True))
        .order_by("-created_at")
    )


def create(user, name: str) -> Classroom:
    if not (user.profile.is_teacher or user.is_staff):
        raise PermissionDenied("只有老師帳號可以建立班級，請聯絡管理員開通")
    if Classroom.objects.filter(teacher=user).count() >= MAX_CLASSES_PER_TEACHER:
        raise Conflict(f"每個帳號最多建立 {MAX_CLASSES_PER_TEACHER} 個班級")
    return Classroom.objects.create(teacher=user, name=name)


def get_visible(user, code: str) -> Classroom:
    """只有老師和成員查得到班級；其他人一律 404，不洩漏代碼是否存在。"""
    classroom = (
        Classroom.objects.filter(code=code.upper())
        .filter(Q(teacher=user) | Q(memberships__user=user))
        .select_related("teacher__profile")
        .distinct()
        .first()
    )
    if classroom is None:
        raise NotFound("找不到這個班級")
    return classroom


def join(user, code: str) -> Classroom:
    classroom = Classroom.objects.filter(code=code.strip().upper()).first()
    if classroom is None:
        raise NotFound("找不到這個加入代碼，請確認有沒有打錯")
    if classroom.teacher_id == user.id:
        raise Conflict("你是這個班級的老師，不需要加入")
    if classroom.memberships.count() >= MAX_MEMBERS:
        raise Conflict("這個班級人數已滿")
    Membership.objects.get_or_create(classroom=classroom, user=user)
    return classroom


def leave(user, classroom: Classroom) -> None:
    Membership.objects.filter(classroom=classroom, user=user).delete()


def summary(classroom: Classroom, user) -> dict:
    count = getattr(classroom, "member_count", None)
    return {
        "code": classroom.code,
        "name": classroom.name,
        "teacher_name": classroom.teacher.profile.display_name,
        "is_teacher": classroom.teacher_id == user.id,
        "member_count": classroom.memberships.count() if count is None else count,
        "created_at": classroom.created_at,
    }


def detail(classroom: Classroom, user) -> dict:
    profiles = list(PlayerProfile.objects.filter(user__memberships__classroom=classroom).order_by("-total_exp", "id"))
    return {
        **summary(classroom, user),
        "member_count": len(profiles),
        # 班內排行榜：只有暱稱、等級與 EXP
        "leaderboard": [
            {
                "rank": rank,
                "display_name": p.display_name,
                "level": level_for(p.total_exp),
                "value": p.total_exp,
                "is_me": p.user_id == user.id,
            }
            for rank, p in enumerate(profiles, start=1)
        ],
        "report": _report(profiles) if classroom.teacher_id == user.id else None,
    }


def _report(profiles: list[PlayerProfile]) -> dict:
    user_ids = [p.user_id for p in profiles]
    answered: dict[int, list] = {uid: [0, 0, None] for uid in user_ids}  # [作答, 答對, 最後作答時間]
    for model, field in ((QuestionAttempt, "record__session__user_id"), (ReviewAttempt, "user_id")):
        rows = (
            model.objects.filter(**{f"{field}__in": user_ids})
            .values(field)
            .annotate(total=Count("id"), correct=Count("id", filter=Q(is_correct=True)), last=Max("created_at"))
        )
        for row in rows:
            entry = answered[row[field]]
            entry[0] += row["total"]
            entry[1] += row["correct"]
            entry[2] = max(filter(None, [entry[2], row["last"]]))
    cleared = dict(
        LearningRecord.objects.filter(session__user_id__in=user_ids, completed_at__isnull=False)
        .values_list("session__user_id")
        .annotate(n=Count("level_id", distinct=True))
    )
    return {
        "students": [
            {
                "display_name": p.display_name,
                "level": level_for(p.total_exp),
                "total_exp": p.total_exp,
                "answered": answered[p.user_id][0],
                "accuracy": stats._rate(answered[p.user_id][1], answered[p.user_id][0]),
                "levels_cleared": cleared.get(p.user_id, 0),
                "last_active": answered[p.user_id][2],
            }
            for p in profiles
        ],
        **stats.answer_report(user_ids, missed_limit=8),
    }
