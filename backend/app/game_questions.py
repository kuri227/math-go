from __future__ import annotations

from dataclasses import dataclass

from backend.app.latex import normalize_latex


@dataclass(frozen=True)
class GameQuestion:
    id: str
    instruction: str
    display: str
    category: str
    difficulty: str
    answer_latex: str
    accepted_latex: tuple[str, ...]

    def public_dict(self) -> dict[str, str]:
        return {
            "id": self.id,
            "instruction": self.instruction,
            "display": self.display,
            "category": self.category,
            "difficulty": self.difficulty,
        }


QUESTIONS: tuple[GameQuestion, ...] = (
    GameQuestion(
        id="differentiate-quadratic",
        instruction="次の式を微分しなさい",
        display="f(x) = x² + 3x",
        category="微分",
        difficulty="基礎",
        answer_latex="2x+3",
        accepted_latex=("2x+3", "3+2x"),
    ),
    GameQuestion(
        id="expand-binomial",
        instruction="次の式を展開しなさい",
        display="(x + 2)²",
        category="展開",
        difficulty="基礎",
        answer_latex="x^2+4x+4",
        accepted_latex=("x^2+4x+4", "4+4x+x^2"),
    ),
    GameQuestion(
        id="solve-linear",
        instruction="方程式を解きなさい",
        display="2x + 6 = 0",
        category="方程式",
        difficulty="基礎",
        answer_latex="x=-3",
        accepted_latex=("x=-3", "-3=x"),
    ),
    GameQuestion(
        id="evaluate-power",
        instruction="計算しなさい",
        display="2⁵",
        category="指数",
        difficulty="基礎",
        answer_latex="32",
        accepted_latex=("32",),
    ),
    GameQuestion(
        id="evaluate-root",
        instruction="計算しなさい",
        display="√49",
        category="平方根",
        difficulty="基礎",
        answer_latex="7",
        accepted_latex=("7", "+7"),
    ),
    GameQuestion(
        id="differentiate-sine",
        instruction="次の式を微分しなさい",
        display="f(x) = sin x",
        category="微分",
        difficulty="標準",
        answer_latex=r"\cos x",
        accepted_latex=(r"\cos x", r"\cos(x)"),
    ),
    GameQuestion(
        id="simplify-fraction",
        instruction="式を簡単にしなさい",
        display="6x ÷ 3",
        category="式の計算",
        difficulty="基礎",
        answer_latex="2x",
        accepted_latex=("2x", "x\\cdot2", "2\\cdot x"),
    ),
)

QUESTION_BY_ID = {question.id: question for question in QUESTIONS}


def judge_answer(question_id: str, recognized_latex: str) -> dict[str, object]:
    """Judge one sample-game answer using conservative normalized aliases.

    This deliberately does not claim general mathematical equivalence. The full
    game can replace this function with a symbolic judge behind the same API.
    """
    question = QUESTION_BY_ID.get(question_id)
    if question is None:
        raise KeyError(question_id)
    recognized_normalized = normalize_latex(recognized_latex)
    accepted = {normalize_latex(value) for value in question.accepted_latex}
    correct = recognized_normalized in accepted
    return {
        "question_id": question.id,
        "correct": correct,
        "recognized_latex": recognized_latex,
        "recognized_normalized": recognized_normalized,
        "expected_latex": question.answer_latex,
        "judge_method": "normalized_alias",
        "message": "正解です" if correct else "認識結果は正答候補と一致しませんでした",
    }
