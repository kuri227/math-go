from __future__ import annotations

import json
import os
import platform
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from backend.app.config import load_paths


def command_output(command: list[str]) -> str | None:
    try:
        return subprocess.run(command, capture_output=True, text=True, timeout=15, check=False).stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return None


def main() -> None:
    paths = load_paths()
    paths.results.mkdir(parents=True, exist_ok=True)
    texteller_python = paths.repo_root / ".venv-texteller" / "Scripts" / "python.exe"
    unimernet_python = paths.repo_root / ".venv-unimernet" / "Scripts" / "python.exe"
    payload = {
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "os": platform.platform(),
        "machine": platform.machine(),
        "processor": platform.processor(),
        "python": sys.version,
        "logical_cpu_count": os.cpu_count(),
        "nvidia_smi": command_output(["nvidia-smi"]),
        "texteller_python": str(texteller_python),
        "unimernet_python": str(unimernet_python),
        "texteller_variant": os.getenv("TEXTELLER_VARIANT", "3.0"),
        "unimernet_variant": os.getenv("UNIMERNET_VARIANT", "tiny"),
        "runtime_versions": {
            "texteller": command_output(
                [str(texteller_python), "-c", "import torch,transformers; from importlib.metadata import version; print(f'torch={torch.__version__}; transformers={transformers.__version__}; texteller={version(\"texteller\")}; cuda={torch.version.cuda}')"]
            ),
            "unimernet": command_output(
                [str(unimernet_python), "-c", "import torch,transformers; from importlib.metadata import version; print(f'torch={torch.__version__}; transformers={transformers.__version__}; unimernet={version(\"unimernet\")}; cuda={torch.version.cuda}')"]
            ),
        },
        "source_revisions": {
            "unimernet_git": "5a2c80d96b1d2dba447ff18d873e5fb73ba03c35",
            "unimernet_tiny_hf_revision": "3f09ac4b1cd583be47ea20a7d7daef839473028a",
            "unimer_test_sha256": "9bf370b8cac868fee84835f40dec26c477430611253e3feb681356a8149a3a90",
        },
    }
    output = paths.results / "environment.json"
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()
