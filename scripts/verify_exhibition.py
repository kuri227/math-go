"""Build first, then run the exhibition regression suite. Does not load a model."""
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    env = dict(os.environ, HMER_EAGER_MODELS="")
    pnpm = shutil.which("pnpm")
    if not pnpm:
        raise SystemExit("Install pnpm 11.25.0 first")
    for command, cwd in [
        ([pnpm, "install", "--frozen-lockfile"], ROOT / "game"),
        ([pnpm, "build"], ROOT / "game"),
        ([pnpm, "test"], ROOT / "game"),
        ([sys.executable, "scripts/validate_game_questions.py"], ROOT),
        ([sys.executable, "-m", "pytest"], ROOT),
        ([sys.executable, "-m", "pip", "check"], ROOT),
    ]:
        subprocess.run(command, cwd=cwd, env=env, check=True)


if __name__ == "__main__":
    main()
