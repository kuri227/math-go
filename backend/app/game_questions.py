from __future__ import annotations

import json
import threading
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from backend.app.config import REPO_ROOT
from backend.app.latex import normalize_latex


DIFFICULTY_LABELS: dict[int, str] = {
    1: "小学校低学年",
    2: "小学校高学年",
    3: "中学校",
    4: "高校",
    5: "高専",
    6: "大学",
    7: "大学院",
}
DEFAULT_QUESTION_PATH = REPO_ROOT / "config" / "game_questions.json"
REQUIRED_TEXT_FIELDS = ("question", "question_latex", "instruction", "description", "category")
QUESTION_WRITE_LOCK = threading.Lock()


@dataclass(frozen=True)
class GameQuestion:
    id: str
    instruction: str
    display: str
    display_latex: str
    category: str
    difficulty: int
    description: str
    answer_latex: str
    accepted_latex: tuple[str, ...]

    @property
    def difficulty_label(self) -> str:
        return DIFFICULTY_LABELS[self.difficulty]

    def public_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "instruction": self.instruction,
            "display": self.display,
            "display_latex": self.display_latex,
            "category": self.category,
            "difficulty": self.difficulty,
            "difficulty_label": self.difficulty_label,
        }


def _read_question_list(path: Path) -> list[object]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Question file must contain a JSON object: {path}")
    raw_questions = payload.get("questions")
    if not isinstance(raw_questions, list) or not raw_questions:
        raise ValueError(f"Question file must contain a non-empty questions array: {path}")
    return raw_questions


def _require_text(raw: Mapping[str, Any], field: str, question_id: str) -> str:
    value = raw.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Question {question_id!r} field {field!r} must be a non-empty string")
    return value.strip()


def _parse_answers(raw: Mapping[str, Any], question_id: str) -> tuple[str, ...]:
    answers = raw.get("answer")
    if not isinstance(answers, list) or not answers:
        raise ValueError(f"Question {question_id!r} must have a non-empty answer string array")
    if not all(isinstance(answer, str) and answer.strip() for answer in answers):
        raise ValueError(f"Question {question_id!r} must have a non-empty answer string array")
    return tuple(answer.strip() for answer in answers)


def _parse_question(raw: object, index: int, seen_ids: set[str]) -> GameQuestion:
    if not isinstance(raw, dict):
        raise ValueError(f"Question #{index} must be an object")

    question_id = str(raw.get("id", "")).strip()
    if not question_id or question_id in seen_ids:
        raise ValueError(f"Question #{index} has a missing or duplicate id: {question_id!r}")
    seen_ids.add(question_id)

    difficulty = raw.get("difficulty")
    if not isinstance(difficulty, int) or difficulty not in DIFFICULTY_LABELS:
        raise ValueError(f"Question {question_id!r} difficulty must be an integer from 1 to 7")

    text = {field: _require_text(raw, field, question_id) for field in REQUIRED_TEXT_FIELDS}
    answers = _parse_answers(raw, question_id)
    return GameQuestion(
        id=question_id,
        instruction=text["instruction"],
        display=text["question"],
        display_latex=text["question_latex"],
        category=text["category"],
        difficulty=difficulty,
        description=text["description"],
        answer_latex=answers[0],
        accepted_latex=answers,
    )


def load_questions(path: Path = DEFAULT_QUESTION_PATH) -> tuple[GameQuestion, ...]:
    """Load and validate the locally managed exhibition question bank."""
    raw_questions = _read_question_list(path)

    questions: list[GameQuestion] = []
    seen_ids: set[str] = set()
    for index, raw in enumerate(raw_questions, start=1):
        questions.append(_parse_question(raw, index, seen_ids))
    return tuple(questions)


def get_questions(path: Path = DEFAULT_QUESTION_PATH) -> tuple[GameQuestion, ...]:
    """Return the current validated bank so newly registered questions appear immediately."""
    return load_questions(path)


def add_question(raw_question: Mapping[str, Any], path: Path = DEFAULT_QUESTION_PATH) -> GameQuestion:
    """Validate and atomically append one locally authored exhibition question."""
    with QUESTION_WRITE_LOCK:
        raw_questions = _read_question_list(path)
        updated_questions = [*raw_questions, dict(raw_question)]
        temporary_path = path.with_suffix(f"{path.suffix}.tmp")
        temporary_path.write_text(
            json.dumps({"questions": updated_questions}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        try:
            validated = load_questions(temporary_path)
            try:
                temporary_path.replace(path)
            except PermissionError:
                # Some managed Windows folders reject rename-overwrite even
                # though both files are writable. Validation has completed,
                # so a direct replacement is the safe compatibility fallback.
                path.write_text(temporary_path.read_text(encoding="utf-8"), encoding="utf-8")
        finally:
            temporary_path.unlink(missing_ok=True)
    return validated[-1]


def _get_question(question_id: str) -> GameQuestion:
    question = next((item for item in get_questions() if item.id == question_id), None)
    if question is None:
        raise KeyError(question_id)
    return question


def get_solution(question_id: str) -> dict[str, str]:
    question = _get_question(question_id)
    return {
        "question_id": question.id,
        "expected_latex": question.answer_latex,
        "explanation": question.description,
    }


def judge_answer(question_id: str, recognized_latex: str) -> dict[str, object]:
    """Judge one answer using conservative normalized aliases."""
    question = _get_question(question_id)
    recognized_normalized = normalize_latex(recognized_latex)
    accepted = {normalize_latex(value) for value in question.accepted_latex}
    correct = recognized_normalized in accepted
    return {
        "question_id": question.id,
        "correct": correct,
        "recognized_latex": recognized_latex,
        "recognized_normalized": recognized_normalized,
        "expected_latex": question.answer_latex,
        "explanation": question.description,
        "judge_method": "normalized_alias",
        "message": "正解です" if correct else "認識結果は正答候補と一致しませんでした",
    }
