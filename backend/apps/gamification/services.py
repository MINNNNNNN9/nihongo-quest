from dataclasses import dataclass

from django.db import transaction

from apps.accounts.models import PlayerProfile

from .leveling import level_for, level_progress
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


@transaction.atomic
def grant(user, amount: int, reason: str, ref: str = "") -> int:
    """發放通關以外的 EXP（複習、每日任務）。帶 ref 的獎勵只會發一次；回傳實際發放的數量。"""
    profile = PlayerProfile.objects.select_for_update().get(user=user)  # 鎖住 profile，同一玩家的發獎因此依序進行
    if ref and ExperienceTransaction.objects.filter(user=user, reason=reason, ref=ref).exists():
        return 0
    ExperienceTransaction.objects.create(user=user, amount=amount, reason=reason, ref=ref)
    profile.total_exp += amount
    profile.save(update_fields=["total_exp", "updated_at"])
    return amount


def progress_for(user) -> dict:
    return level_progress(PlayerProfile.objects.get(user=user).total_exp)
