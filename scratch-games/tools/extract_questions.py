#!/usr/bin/env python3
"""從《元智騎士》的 .sb3 抽出題庫，產生 Django 的種子資料。

用法：python3 extract_questions.py <game.sb3> <output.json>

題目文字、中文提示都寫在原專案的積木裡（Tree / 提示按鈕 角色），
正解則由「題號 → 出題群組 → 群組內名稱帶 (正解) 的選項角色」推得。
本腳本只讀取、不修改原專案。
"""
import json
import re
import sys
import zipfile

KANJI = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
# 選項角色名稱 → 畫面上的助詞
LABELS = {
    "mo": "も", "ga": "が", "wa": "は", "wo": "を", "ni": "に", "de": "で",
    "kara": "から", "made": "まで", "karamade": "から／まで", "gani": "が／に",
    "X": "✕（不需要助詞）",
}
# 正解 → 文法主題（對應遊戲內教材的章節）
TOPICS = {
    "も": "mo", "から／まで": "karamade", "から": "kara", "まで": "made",
    "に": "ni", "✕（不需要助詞）": "none", "で": "de", "は": "wa", "が": "ga",
}


def kanji_to_int(text: str) -> int:
    """第七十五題 → 75"""
    text = text.removeprefix("第").removesuffix("題")
    if "十" in text:
        tens, _, ones = text.partition("十")
        return KANJI.get(tens, 1) * 10 + KANJI.get(ones, 0)
    return KANJI[text]


def label(sprite: str) -> str:
    base = re.sub(r"\d+$", "", sprite.replace("(正解)", ""))
    return LABELS[base]


def literal(inp):
    return inp[1][1] if isinstance(inp[1], list) else None


def chain(blocks, bid):
    while bid:
        yield blocks[bid]
        bid = blocks[bid]["next"]


def bounds(blocks, bid, lo=1, hi=75):
    """把 題目[1] 的比較條件還原成題號集合。"""
    b = blocks[bid]
    op, i = b["opcode"], b["inputs"]
    if op in ("operator_and", "operator_or"):
        a, c = bounds(blocks, i["OPERAND1"][1]), bounds(blocks, i["OPERAND2"][1])
        return a & c if op == "operator_and" else a | c
    n = int(literal(i["OPERAND2"]))
    full = set(range(lo, hi + 1))
    return {
        "operator_lt": {q for q in full if q < n},
        "operator_gt": {q for q in full if q > n},
        "operator_equals": {n},
    }[op]


def main() -> None:
    src, out = sys.argv[1], sys.argv[2]
    with zipfile.ZipFile(src) as z:
        project = json.loads(z.read("project.json"))
    targets = {t["name"]: t for t in project["targets"]}

    # 1) 題目文字：Tree 收到「第N題」後 say 出來的句子（最後一句是含（？）的題幹）
    prompts = {}
    tree = targets["Tree"]["blocks"]
    for bid, b in tree.items():
        if b["opcode"] == "event_whenbroadcastreceived" and b["topLevel"]:
            name = b["fields"]["BROADCAST_OPTION"][0]
            if re.fullmatch(r"第.+題", name):
                says = [literal(x["inputs"]["MESSAGE"]) for x in chain(tree, b["next"])]
                prompts[kanji_to_int(name)] = says

    # 2) 中文提示：提示按鈕 被點擊時依 題目[1] 說出的句子
    hints = {}
    tip = targets["提示按鈕"]["blocks"]
    for b in tip.values():
        if b["opcode"] == "control_if" and "SUBSTACK" in b["inputs"]:
            cond = tip[b["inputs"]["CONDITION"][1]]
            if cond["opcode"] == "operator_equals":
                n = literal(cond["inputs"]["OPERAND2"])
                says = [
                    literal(x["inputs"]["MESSAGE"])
                    for x in chain(tip, b["inputs"]["SUBSTACK"][1])
                    if x["opcode"] == "looks_sayforsecs"
                ]
                if n and n.isdigit() and says:
                    hints[int(n)] = says

    # 3) 題號 → 出題群組
    group_of = {}
    for b in tree.values():
        if b["opcode"] == "control_if" and "SUBSTACK" in b["inputs"]:
            body = tree[b["inputs"]["SUBSTACK"][1]]
            if body["opcode"] == "event_broadcast":
                g = body["inputs"]["BROADCAST_INPUT"][1][1]
                if g.startswith("出題"):
                    for q in bounds(tree, b["inputs"]["CONDITION"][1]):
                        group_of.setdefault(q, g)

    # 4) 出題群組 → 會出現的選項角色
    sprites_of = {}
    for name, t in targets.items():
        for b in t["blocks"].values():
            if b["opcode"] == "event_whenbroadcastreceived":
                g = b["fields"]["BROADCAST_OPTION"][0]
                if g.startswith("出題") and name not in ("Tree", "BOSS"):
                    sprites_of.setdefault(g, set()).add(name)

    questions = []
    for n in range(1, 76):
        sprites = sorted(sprites_of[group_of[n]])
        correct = [s for s in sprites if s.startswith("(正解)")]
        assert len(correct) == 1, (n, sprites)
        answer = label(correct[0])
        says = prompts[n]
        questions.append({
            "key": f"Q{n:02d}",
            "number": n,
            "context": says[0] if len(says) > 1 else "",
            "prompt": says[-1].replace("?", "？"),
            "hint_zh": " ".join(hints.get(n, [])),
            "topic": TOPICS[answer],
            "correct_answer": answer,
            "choices": [{"sprite": s, "label": label(s)} for s in sprites],
        })

    json.dump(questions, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(questions)} questions → {out}")


if __name__ == "__main__":
    main()
