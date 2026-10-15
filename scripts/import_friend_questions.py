"""Mechanically import the seven supplied question sources; never modify originals.

Run once with the source directory. Subsequent runs default to the archived sources.
The old exhibition bank is archived before the first replacement.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

from backend.app.latex import normalize_latex

ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = {
    1: ["たし算", "たし算", "ひき算", "くり上がり", "くり下がり", "たし算", "くり上がり", "ひき算・おつり", "九九・時間", "空欄補充"],
    2: ["かけ算", "わり算", "整数の計算", "小数", "分数", "かけ算", "割合・計算", "文章題", "規則・場合の数", "文章題"],
    3: ["正負の数", "乗除", "累乗", "式の値", "方程式", "方程式", "数量・図形", "文章題", "応用", "発展"],
    4: ["方程式", "二次関数", "無理方程式", "三角比", "場合の数", "確率", "分散", "整数", "合同式", "最小値"],
    5: ["行列式", "固有値", "線形写像", "偏微分", "ヘッセ行列", "二重積分", "面積", "広義積分", "テイラー展開", "級数"],
    6: ["積分と極限", "関数空間", "作用素", "作用素", "分布", "収束半径", "留数", "広義積分", "確率収束", "スペクトル"],
    7: ["ゼータ関数", "ベルヌーイ数", "トレース", "シャッテンノルム", "ラプラシアン", "熱核", "フレドホルム指数", "調和振動子", "モーメント", "ソボレフ指数"],
}
OTHER = {
    (3, 2): ["式の値", "式の計算", "連立方程式", "連立方程式", "一次関数", "一次関数", "角度", "確率", "文章題", "発展"],
    (3, 3): ["平方根", "平方根", "展開", "因数分解", "二次方程式", "二次方程式", "二次関数", "図形", "円", "発展"],
    (4, 2): ["対数", "三角関数", "等差数列", "等比数列", "ベクトル", "複素数", "微分", "積分", "面積", "確率分布"],
    (4, 3): ["極限", "微分", "微分", "積分", "置換積分", "部分積分", "体積", "級数", "漸化式", "最大値"],
    (5, 2): ["微分方程式", "微分方程式", "微分方程式", "期待値", "指数分布", "ポアソン分布", "分散", "発散", "回転", "流束"],
    (5, 3): ["留数", "複素積分", "フーリエ解析", "ラプラス変換", "グラフ", "木", "全射", "漸化式", "二次形式", "フーリエ変換"],
    (6, 2): ["群の位数", "部分群", "有限体", "既約多項式", "体拡大", "ガロア群", "商環", "表現", "クルル次元", "対称群"],
    (6, 3): ["オイラー標数", "ベッチ数", "射影空間", "曲率", "ガウス・ボンネ", "固有値", "熱方程式", "ラプラシアン", "微分形式", "リーマン面"],
    (7, 2): ["大域次元", "Tor", "Ext", "Tor", "Ext", "斉次成分", "加群", "円分体", "有限体上の点", "ゼータ関数"],
    (7, 3): ["曲線の種数", "直線束", "正則切断", "リーマン・ロッホ", "標準束", "ベズー", "チャーン数", "最高次チャーン類", "グラスマン多様体", "ポントリャーギン数"],
}


def convert(raw: dict, variant: int) -> dict:
    d, s, r = raw["difficulty"], raw["sublevel"], raw["rank"]
    prompt = raw["question"]
    if d == 5 and ((s == 1 and r == 9) or (s == 2 and r == 2)):
        prompt += "（log は自然対数です。）"
    if d == 7 and s == 1 and r in (3, 4):
        prompt += "（添字 k は1から始めます。）"
    if d == 6 and s == 1 and r == 4:
        prompt += "（添字 k は1から始めます。）"
    if d == 7 and s == 1 and r == 4:
        prompt = prompt.replace("同じ対角作用素", r"ヒルベルト空間 $\ell^2$ 上の対角作用素")
    if d == 7 and s == 3 and r == 8:
        prompt = prompt.replace("c_n", f"c_{variant + 1}")
    # The source accepts decimals: make the instruction agree with that policy.
    if "約分した分数で答える" in prompt and any(re.fullmatch(r"-?\d+\.\d+", a) for a in raw["answer"]):
        prompt = prompt.replace("約分した分数で答える", "約分した分数または小数で答える")
    answers = list(dict((normalize_latex(a), a.strip()) for a in raw["answer"]).values())
    for answer in list(answers):
        # Safe lexical alternate for a single fraction, not an algebraic equivalence engine.
        match = re.fullmatch(r"(-?)\\frac\{(\d+)\}\{(\d+)\}", answer)
        if match:
            answers.append(f"{match[1]}{match[2]}/{match[3]}")
    if d == 4 and s == 1 and r == 3 and variant in (2, 3):
        n = 13 if variant == 2 else 17
        answers += [rf"\frac{{1+\sqrt{{{n}}}}}{{2}}", rf"\frac{{\sqrt{{{n}}}+1}}{{2}}"]
    if d == 4 and s == 3 and r == 5:
        answers += {1: ["e-1"], 2: [r"\frac{3(e-1)}{2}", r"\frac{3}{2}(e-1)"], 3: ["2e-2", "2(e-1)"]}[variant]
    # Conservative initial exhibition pool: seven short, manually inspected
    # examples per level, different ranks. Everything else is available in test.
    enabled = s == 1 and r <= 7 and variant == 1
    return {
        "id": f"d{d}-s{s}-r{r:02}-v{variant:02}",
        "question": re.sub(r"\$([^$]+)\$", r"\1", prompt),
        "question_latex": next(iter(re.findall(r"\$([^$]+)\$", prompt)), r"\text{問題文を読んで答えてください}"),
        "prompt": prompt,
        "instruction": "問題文を読んで、求められた答えを書いてください",
        "answer": list(dict.fromkeys(answers)),
        "description": raw["description"],
        "difficulty": d, "sublevel": s, "rank": r,
        "category": OTHER.get((d, s), CATEGORIES[d])[r - 1],
        "review_status": "approved" if enabled else "pending",
        "exhibition_enabled": enabled,
        "source": f"friend-2026-10-d{d}",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", nargs="?", type=Path, default=ROOT / "config/question_sources")
    parser.add_argument("--replace-bank", action="store_true", help="Explicitly reset an already imported bank, including operator reviews")
    args = parser.parse_args()
    archive = ROOT / "config/question_sources"
    files = sorted(args.source.glob("questions_d[1-7]_*.json"))
    if len(files) != 7:
        raise SystemExit("Exactly seven source files are required")
    payloads = [(p, json.loads(p.read_text(encoding="utf-8"))) for p in files]
    bank = ROOT / "config/game_questions.json"
    if not args.replace_bank and any(q.get("source", "").startswith("friend-") for q in json.loads(bank.read_text(encoding="utf-8"))["questions"]):
        raise SystemExit("Bank already imported. Preserve operator reviews; --replace-bank is required to reset it.")
    legacy = archive / "legacy_50_questions.json"
    archive.mkdir(exist_ok=True)
    if not legacy.exists():
        legacy.write_bytes(bank.read_bytes())
    questions = []
    for path, payload in payloads:
        if path.resolve().parent != archive.resolve():
            (archive / path.name).write_bytes(path.read_bytes())
        counts: Counter = Counter()
        for raw in payload["questions"]:
            key = (raw["difficulty"], raw["sublevel"], raw["rank"])
            counts[key] += 1
            questions.append(convert(raw, counts[key]))
    bank.write_text(json.dumps({"questions": questions}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(questions)} questions; {sum(q['exhibition_enabled'] for q in questions)} initial exhibition questions")


if __name__ == "__main__":
    main()
