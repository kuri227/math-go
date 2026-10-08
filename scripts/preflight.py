"""Read-only preflight: no model loading, downloads or OS changes."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def venv_python(name: str, device: str = "auto") -> Path:
    override = os.getenv(f"{name.upper()}_PYTHON") if name != "base" else None
    folder = ".venv" if name == "base" else ".venv-texteller-cpu" if name == "texteller" and device == "cpu" else f".venv-{name}"
    return Path(override) if override else ROOT / folder / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def inspect(require_ready: bool, device: str, port: int | None = None) -> list[dict]:
    checks = []

    def add(name: str, ok: bool, detail: str, required: bool = True) -> None:
        checks.append({"check": name, "status": "OK" if ok else "FAIL" if required else "WARN", "detail": detail})

    add("Python", (3, 10) <= sys.version_info[:2] < (3, 13) and sys.maxsize > 2**32, sys.version.split()[0] + "; 64-bit Python 3.10-3.12 required")
    add("OS", os.name in {"nt", "posix"}, sys.platform + "; Windows 11 validated, Linux procedure provided, macOS/WSL unverified")
    add("NVIDIA driver", bool(shutil.which("nvidia-smi")), "Required only for --device cuda", device == "cuda")
    free_gib = shutil.disk_usage(ROOT).free / 1024**3
    add("Disk space", free_gib >= 20, f"{free_gib:.1f} GiB free; 20 GiB recommended for initial installation", False)
    for name in ("base", "texteller"):
        executable = venv_python(name, device)
        add(name + " environment", executable.is_file(), str(executable), require_ready)
    model = Path(os.getenv("TEXTELLER_MODEL_DIR", ROOT / ".model-cache/texteller"))
    for file in ("model.safetensors", "config.json", "tokenizer.json", "tokenizer_config.json"):
        add("Model: " + file, (model / file).is_file(), str(model / file), require_ready)
    for file in ("index.html", "display.html", "controller.html"):
        add("Build: " + file, (ROOT / "game/dist" / file).is_file(), "game/dist/" + file, require_ready)
    add("Build assets", any((ROOT / "game/dist/game-assets").glob("*.js")), "game/dist/game-assets/*.js", require_ready)
    if require_ready:
        try:
            from backend.app.game_questions import get_questions
            add("Question bank", bool(get_questions()), f"{len(get_questions())} validated questions")
        except Exception as exc:
            add("Question bank", False, str(exc))
        model_python = venv_python("texteller", device)
        if model_python.is_file():
            code = "import json, torch, texteller; print(json.dumps({'cuda':torch.cuda.is_available(),'torch':torch.__version__}))"
            try:
                result = subprocess.run([str(model_python), "-c", code], capture_output=True, text=True, timeout=60, check=True)
                body = json.loads(result.stdout.strip().splitlines()[-1])
                add("Model dependencies/device", device != "cuda" or body["cuda"], json.dumps(body))
            except (OSError, ValueError, subprocess.SubprocessError) as exc:
                add("Model dependencies/device", False, str(exc))
    if port is not None:
        with socket.socket() as client:
            client.settimeout(1)
            used = client.connect_ex(("127.0.0.1", port)) == 0
        add("Port", not used, f"127.0.0.1:{port} {'in use; choose another port' if used else 'free'}")
    return checks


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-ready", action="store_true")
    parser.add_argument("--device", choices=["auto", "cuda", "cpu"], default="auto")
    parser.add_argument("--port", type=int)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    sys.path.insert(0, str(ROOT))
    checks = inspect(args.require_ready, args.device, args.port)
    if args.json:
        print(json.dumps(checks, ensure_ascii=True, indent=2))
    else:
        for entry in checks:
            print(f"[{entry['status']}] {entry['check']}: {entry['detail']}")
    sys.exit(1 if any(entry["status"] == "FAIL" for entry in checks) else 0)


if __name__ == "__main__":
    main()
