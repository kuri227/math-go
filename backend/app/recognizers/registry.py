from __future__ import annotations

import os
import sys
import threading
from pathlib import Path

from backend.app.config import REPO_ROOT

from .worker import WorkerRecognizer


def _venv_python(name: str) -> Path:
    configured = os.getenv(f"{name.upper()}_PYTHON")
    if configured:
        return Path(configured).expanduser().resolve()
    if sys.platform == "win32":
        return REPO_ROOT / f".venv-{name}" / "Scripts" / "python.exe"
    return REPO_ROOT / f".venv-{name}" / "bin" / "python"


class RecognizerRegistry:
    def __init__(self) -> None:
        worker_dir = REPO_ROOT / "backend" / "model_workers"
        model_cache = REPO_ROOT / ".model-cache"
        model_cache.mkdir(parents=True, exist_ok=True)
        unimernet_repo = Path(
            os.getenv("UNIMERNET_REPO", str(REPO_ROOT / "third_party" / "UniMERNet"))
        ).resolve()
        self._recognizers = {
            "texteller": WorkerRecognizer(
                name="texteller",
                variant=os.getenv("TEXTELLER_VARIANT", "3.0"),
                device=os.getenv("TEXTELLER_DEVICE", "auto"),
                python_executable=_venv_python("texteller"),
                worker_script=worker_dir / "texteller_worker.py",
                cwd=REPO_ROOT,
                log_path=REPO_ROOT / "results" / "logs" / "texteller.log",
                extra_env={
                    "TEXTELLER_USE_ONNX": os.getenv("TEXTELLER_USE_ONNX", "0"),
                    "TEXTELLER_MODEL_DIR": os.getenv(
                        "TEXTELLER_MODEL_DIR", str(model_cache / "texteller")
                    ),
                    "HF_HOME": str(model_cache / "huggingface"),
                    "TRANSFORMERS_CACHE": str(model_cache / "huggingface" / "transformers"),
                },
            ),
            "unimernet": WorkerRecognizer(
                name="unimernet",
                variant=os.getenv("UNIMERNET_VARIANT", "tiny"),
                device=os.getenv("UNIMERNET_DEVICE", "auto"),
                python_executable=_venv_python("unimernet"),
                worker_script=worker_dir / "unimernet_worker.py",
                cwd=unimernet_repo,
                log_path=REPO_ROOT / "results" / "logs" / "unimernet.log",
                extra_env={
                    "UNIMERNET_REPO": str(unimernet_repo),
                    "HF_HOME": str(model_cache / "huggingface"),
                    "TRANSFORMERS_CACHE": str(model_cache / "huggingface" / "transformers"),
                },
            ),
        }
        self._preload_lock = threading.Lock()
        self._preload_thread: threading.Thread | None = None

    def start_all(self) -> None:
        eager = {
            item.strip().lower()
            for item in os.getenv("HMER_EAGER_MODELS", "").split(",")
            if item.strip()
        }
        for name in eager:
            if name in self._recognizers:
                self._recognizers[name].start()

    def begin_preload(self, names: tuple[str, ...] | None = None) -> str:
        """Start loading selected models without delaying the HTTP response."""
        selected_names = names or tuple(self._recognizers)
        unknown = set(selected_names) - set(self._recognizers)
        if unknown:
            allowed = ", ".join(sorted(self._recognizers))
            raise KeyError(f"Unknown model '{sorted(unknown)[0]}'. Expected one of: {allowed}")
        selected = tuple(self._recognizers[name] for name in selected_names)
        with self._preload_lock:
            if all(recognizer.available for recognizer in selected):
                return "ready"
            if self._preload_thread is not None and self._preload_thread.is_alive():
                return "loading"
            self._preload_thread = threading.Thread(
                target=self._preload_selected,
                args=(selected_names,),
                name="hmer-model-preload",
                daemon=True,
            )
            self._preload_thread.start()
            return "loading"

    def _preload_selected(self, names: tuple[str, ...]) -> None:
        # Load sequentially to avoid a temporary GPU-memory spike.
        for name in names:
            self._recognizers[name].start()

    def get(self, name: str) -> WorkerRecognizer:
        try:
            return self._recognizers[name]
        except KeyError as exc:
            allowed = ", ".join(sorted(self._recognizers))
            raise KeyError(f"Unknown model '{name}'. Expected one of: {allowed}") from exc

    def statuses(self) -> list[dict[str, object]]:
        return [
            {
                "name": rec.name,
                "variant": rec.variant,
                "device": rec.device,
                "available": rec.available,
                "loading": rec.loading,
                "detail": rec.detail,
                "initialization_ms": rec.initialization_ms,
                "peak_vram_mb": rec.peak_vram_mb,
            }
            for rec in self._recognizers.values()
        ]

    def close(self) -> None:
        for recognizer in self._recognizers.values():
            recognizer.close()
