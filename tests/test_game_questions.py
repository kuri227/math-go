import json

import pytest

from backend.app.game_questions import DEFAULT_QUESTION_PATH, add_question, load_questions


def valid_question(**overrides):
    question = {
        "id": "sample-question",
        "question": "1 + 1",
        "question_latex": "1+1",
        "instruction": "計算しなさい",
        "answer": ["2"],
        "description": "1に1を足すと2です。",
        "difficulty": 1,
        "category": "たし算",
    }
    question.update(overrides)
    return question


def write_bank(tmp_path, questions):
    path = tmp_path / "questions.json"
    path.write_text(json.dumps({"questions": questions}, ensure_ascii=False), encoding="utf-8")
    return path


def test_current_question_bank_is_valid():
    questions = load_questions(DEFAULT_QUESTION_PATH)
    assert len(questions) >= 50
    assert len({question.id for question in questions}) == len(questions)


def test_duplicate_question_id_is_rejected(tmp_path):
    path = write_bank(tmp_path, [valid_question(), valid_question()])
    with pytest.raises(ValueError, match="duplicate id"):
        load_questions(path)


@pytest.mark.parametrize("difficulty", [0, 8, "4"])
def test_invalid_difficulty_is_rejected(tmp_path, difficulty):
    path = write_bank(tmp_path, [valid_question(difficulty=difficulty)])
    with pytest.raises(ValueError, match="integer from 1 to 7"):
        load_questions(path)


def test_empty_answer_list_is_rejected(tmp_path):
    path = write_bank(tmp_path, [valid_question(answer=[])])
    with pytest.raises(ValueError, match="answer string array"):
        load_questions(path)


def test_question_can_be_appended_and_reloaded(tmp_path):
    path = write_bank(tmp_path, [valid_question()])
    added = add_question(valid_question(id="second-question", answer=["3"]), path)
    reloaded = load_questions(path)
    assert added.id == "second-question"
    assert [question.id for question in reloaded] == ["sample-question", "second-question"]
