from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from pathlib import Path

from .base import Recognition

PROTOCOL_PREFIX = "@@HMER_JSON@@"


class WorkerError(RuntimeError):
    pass


class WorkerRecognizer:
    def __init__(
        self,
        *,
        name: str,
        variant: str,
        device: str,
        python_executable: Path,
        worker_script: Path,
        cwd: Path,
        log_path: Path,
        extra_env: dict[str, str] | None = None,
    ) -> None:
        self.name = name
        self.variant = variant
        self.device = device
        self.python_executable = python_executable
        self.worker_script = worker_script
        self.cwd = cwd
        self.log_path = log_path
        self.extra_env = extra_env or {}
        self._process: subprocess.Popen[str] | None = None
        self._log_handle = None
        self._lock = threading.Lock()
        self._start_lock = threading.Lock()
        self._starting = False
        self._detail: str | None = None
        self.initialization_ms: float | None = None
        self.peak_vram_mb: float | None = None

    @property
    def available(self) -> bool:
        return (
            not self._starting
            and self._process is not None
            and self._process.poll() is None
            and self._detail is None
        )

    @property
    def loading(self) -> bool:
        return self._starting

    @property
    def detail(self) -> str | None:
        return self._detail

    def start(self) -> None:
        with self._start_lock:
            if self.available:
                return
            self._starting = True
            try:
                self._start_process()
            except Exception as exc:
                self._detail = f"{type(exc).__name__}: {exc}"
                self.close()
            finally:
                self._starting = False

    def _start_process(self) -> None:
        if not self.python_executable.exists():
            self._detail = f"Python environment not found: {self.python_executable}"
            return
        if not self.worker_script.exists():
            self._detail = f"Worker script not found: {self.worker_script}"
            return

        env = os.environ.copy()
        env.update(self.extra_env)
        env["HMER_MODEL_NAME"] = self.name
        env["HMER_MODEL_VARIANT"] = self.variant
        env["HMER_DEVICE"] = self.device
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self._log_handle = self.log_path.open("a", encoding="utf-8")
        started = time.perf_counter()
        self._process = subprocess.Popen(
            [str(self.python_executable), "-u", str(self.worker_script)],
            cwd=self.cwd,
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=self._log_handle,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
        ready: dict[str, object] | None = None
        while self._process.stdout:
            candidate = self._read_protocol_message()
            if candidate is None:
                break
            if candidate.get("status") in {"ready", "error"}:
                ready = candidate
                break
        if ready is None:
            self._detail = self._read_log_tail() or "Worker exited before readiness response"
            self.close()
            return
        if ready.get("status") != "ready":
            self._detail = ready.get("error") or "Worker failed to initialize"
            self.close()
            return
        self.device = str(ready.get("device", self.device))
        self.variant = str(ready.get("variant", self.variant))
        self.initialization_ms = float(ready.get("initialization_ms", (time.perf_counter() - started) * 1000))
        peak = ready.get("peak_vram_mb")
        self.peak_vram_mb = float(peak) if peak is not None else None
        self._detail = None

    def recognize(self, image_path: Path) -> Recognition:
        if not self.available:
            self.start()
        if not self.available or self._process is None:
            raise WorkerError(self._detail or f"{self.name} is unavailable")

        request = json.dumps({"image_path": str(image_path.resolve())}, ensure_ascii=False)
        with self._lock:
            assert self._process.stdin is not None
            assert self._process.stdout is not None
            self._process.stdin.write(request + "\n")
            self._process.stdin.flush()
            response = self._read_protocol_message()

        if response is None:
            self._detail = self._read_log_tail() or "Worker stopped during inference"
            raise WorkerError(self._detail)
        if response.get("error"):
            raise WorkerError(str(response["error"]))
        if response.get("peak_vram_mb") is not None:
            self.peak_vram_mb = float(response["peak_vram_mb"])
        return Recognition(
            latex=str(response["latex"]),
            inference_ms=float(response["inference_ms"]),
            model=self.name,
            model_variant=self.variant,
            device=self.device,
            initialization_ms=self.initialization_ms,
            peak_vram_mb=self.peak_vram_mb,
        )

    def _read_protocol_message(self) -> dict[str, object] | None:
        if self._process is None or self._process.stdout is None:
            return None
        decoder = json.JSONDecoder()
        for line in self._process.stdout:
            offset = line.find(PROTOCOL_PREFIX)
            if offset < 0:
                continue
            payload = line[offset + len(PROTOCOL_PREFIX) :]
            try:
                message, _ = decoder.raw_decode(payload)
            except json.JSONDecodeError:
                continue
            if isinstance(message, dict):
                return message
        return None

    def close(self) -> None:
        if self._process is None:
            return
        if self._process.poll() is None:
            try:
                if self._process.stdin:
                    self._process.stdin.write('{"command":"shutdown"}\n')
                    self._process.stdin.flush()
                self._process.wait(timeout=5)
            except (BrokenPipeError, subprocess.TimeoutExpired):
                self._process.terminate()
        self._process = None
        if self._log_handle is not None:
            self._log_handle.close()
            self._log_handle = None

    def _read_log_tail(self, limit: int = 8_000) -> str:
        try:
            text = self.log_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return ""
        return text[-limit:].strip()
