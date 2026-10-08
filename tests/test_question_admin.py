from pathlib import Path

from backend.app.game_questions import GameQuestion
from backend.app.schemas import GameQuestionCreateRequest


def request() -> GameQuestionCreateRequest:
    return GameQuestionCreateRequest(
        id="custom-sample",
        question="1 + 2",
        question_latex="1+2",
        instruction="計算しなさい",
        answer=["3"],
        description="1に2を足すと3です。",
        difficulty=1,
        category="たし算",
    )


def test_question_editor_page_exists():
    import backend.app.main as main_module

    response = main_module.question_editor()
    assert Path(response.path).name == "question-editor.html"
    assert Path(response.path).is_file()


def test_admin_endpoint_returns_new_total(monkeypatch):
    import backend.app.main as main_module

    added = GameQuestion(
        id="custom-sample",
        instruction="計算しなさい",
        display="1 + 2",
        display_latex="1+2",
        category="たし算",
        difficulty=1,
        description="1に2を足すと3です。",
        answer_latex="3",
        accepted_latex=("3",),
    )
    monkeypatch.setattr(main_module, "add_question", lambda _payload: added)
    monkeypatch.setattr(main_module, "get_questions", lambda: (added, added))
    response = main_module.api_add_game_question(request())
    assert response == {
        "id": "custom-sample",
        "total": 2,
        "message": "問題を登録しました。次のゲーム開始時から出題されます。",
    }
