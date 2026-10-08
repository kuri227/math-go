from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from backend.app.game_questions import DEFAULT_QUESTION_PATH, load_questions  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="数学でGOの問題JSONを検証します。")
    parser.add_argument("path", nargs="?", type=Path, default=DEFAULT_QUESTION_PATH)
    args = parser.parse_args()

    try:
        questions = load_questions(args.path)
    except (OSError, ValueError) as error:
        print(f"問題データの検証に失敗しました: {error}", file=sys.stderr)
        return 1

    difficulties = Counter(question.difficulty_label for question in questions)
    categories = Counter(question.category for question in questions)
    print(f"OK: {args.path} ({len(questions)}問)")
    print("難易度別: " + ", ".join(f"{name}={count}" for name, count in difficulties.items()))
    print("カテゴリ別: " + ", ".join(f"{name}={count}" for name, count in categories.items()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
