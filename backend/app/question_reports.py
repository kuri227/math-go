from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from backend.app.game_questions import GameQuestion


_REPORT_LOCK = threading.Lock()


def save_question_report(
    *,
    directory: Path,
    question: GameQuestion,
    issue_type: str,
    description: str,
    run_id: str | None = None,
    round_number: int | None = None,
    recognized_latex: str | None = None,
) -> dict[str, object]:
    """Save one immutable, human-authored problem report as local JSON."""
    description = description.strip()
    if not description:
        raise ValueError("問題点の説明を入力してください。")
    if len(description) > 2000:
        raise ValueError("問題点の説明は2000文字以内で入力してください。")
    if issue_type not in {"question", "answer", "explanation", "display", "difficulty_time", "other"}:
        raise ValueError("問題点の種類を選び直してください。")

    created_at = datetime.now(timezone.utc)
    report_id = f"report_{created_at:%Y%m%d_%H%M%S}_{uuid.uuid4().hex[:8]}"
    payload: dict[str, object] = {
        "report_id": report_id,
        "created_at": created_at.isoformat(),
        "status": "open",
        "issue_type": issue_type,
        "description": description,
        "question": {
            "id": question.id,
            "difficulty": question.difficulty,
            "difficulty_label": question.difficulty_label,
            "category": question.category,
            "instruction": question.instruction,
            "display": question.display,
            "display_latex": question.display_latex,
            "prompt": question.prompt,
        },
        "context": {
            "run_id": run_id,
            "round": round_number,
            "recognized_latex": recognized_latex,
        },
    }
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"{report_id}.json"
    temporary = target.with_suffix(".json.tmp")
    with _REPORT_LOCK:
        temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        try:
            temporary.replace(target)
        except PermissionError:
            # Managed Windows folders can reject same-directory rename even
            # when both paths are writable. The report is immutable, so a
            # validated direct write is a safe compatibility fallback.
            target.write_text(temporary.read_text(encoding="utf-8"), encoding="utf-8")
            temporary.unlink(missing_ok=True)
    return payload
