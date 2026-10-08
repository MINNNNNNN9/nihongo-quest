"""等級規則：等級不存資料庫，一律由累積 EXP 推算，避免兩者不一致。

升到 L+1 級需要在 L 級累積 100×L EXP，所以到達 L 級的累積門檻是 50×L×(L−1)：
Lv1=0、Lv2=100、Lv3=300、Lv4=600、Lv5=1000 …
"""

TITLES = [(1, "見習騎士"), (3, "助詞學徒"), (5, "文法劍士"), (8, "言靈騎士"), (12, "元智ナイト"), (16, "助詞の達人")]


def threshold(level: int) -> int:
    return 50 * level * (level - 1)


def level_for(total_exp: int) -> int:
    level = 1
    while threshold(level + 1) <= total_exp:
        level += 1
    return level


def title_for(level: int) -> str:
    return next(name for minimum, name in reversed(TITLES) if level >= minimum)


def level_progress(total_exp: int) -> dict:
    level = level_for(total_exp)
    floor, ceiling = threshold(level), threshold(level + 1)
    return {
        "level": level,
        "title": title_for(level),
        "total_exp": total_exp,
        "exp_into_level": total_exp - floor,
        "exp_for_next_level": ceiling - floor,
    }
