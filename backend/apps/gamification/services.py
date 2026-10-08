from dataclasses import dataclass

from django.db import transaction

from apps.accounts.models import PlayerProfile

from .leveling import level_for
from .models import ExperienceTransaction

REPLAY_RATE = 0.3  # 重玩已通關過的關卡只給三成，避免反覆刷第一關


@dataclass
class Reward:
    exp_awarded: int
    is_first_clear: bool
    level_before: int
    total_exp: int

    @property
    def leveled_up(self) -> bool:
        return level_for(self.total_exp) > self.level_before


def exp_for(record) -> int:
    reward = record.level.exp_reward
    return reward if record.is_first_clear else max(1, round(reward * REPLAY_RATE))


@transaction.atomic
def award_level_clear(user, record) -> Reward:
    """發放通關 EXP。金額只看伺服器上的關卡設定；帳本與 total_exp 在同一筆交易內更新。"""
    profile = PlayerProfile.objects.select_for_update().get(user=user)
    level_before = level_for(profile.total_exp)
    tx, created = ExperienceTransaction.objects.get_or_create(
        learning_record=record,
        defaults={"user": user, "amount": exp_for(record), "reason": ExperienceTransaction.Reason.LEVEL_CLEAR},
    )
    if created:
        profile.total_exp += tx.amount
        profile.save(update_fields=["total_exp", "updated_at"])
    return Reward(
        exp_awarded=tx.amount if created else 0,
        is_first_clear=record.is_first_clear,
        level_before=level_before,
        total_exp=profile.total_exp,
    )
