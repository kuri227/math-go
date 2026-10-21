from __future__ import annotations

import json
import math
import os
import subprocess
import threading
import time
import uuid
from pathlib import Path

from .base import Recognition
from .protocol import ProtocolReader
from .input_image import require_visible_content
from .process_cleanup import terminate_owned_process


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
        startup_timeout: float = 180,
        inference_timeout: float = 25,
    ) -> None:
        self.name = name
        self.variant = variant
        self.device = device
        self.python_executable = python_executable
        self.worker_script = worker_script
        self.cwd = cwd
        self.log_path = log_path
        self.extra_env = extra_env or {}
        if startup_timeout <= 0 or inference_timeout <= 0:
            raise ValueError("Worker deadlines must be positive")
        self.startup_timeout = startup_timeout
        self.inference_timeout = inference_timeout
        self._reader: ProtocolReader | None = None
        self._process: subprocess.Popen[str] | None = None
        self._log_handle = None
        self._lock = threading.RLock()
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
        with self._lock:
            if self.available:
                return
            self._starting = True
            try:
                self.close()
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
        assert self._process.stdout is not None
        self._reader = ProtocolReader(self._process.stdout)
        ready: dict[str, object] | None = None
        deadline = time.monotonic() + self.startup_timeout
        while self._process.stdout:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("Recognition worker startup deadline exceeded")
            candidate = self._read_protocol_message(remaining)
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
        # Serialize startup, requests and disposal as one lifecycle operation.
        with self._lock:
            return self._recognize(image_path)

    def _recognize(self, image_path: Path) -> Recognition:
        try:
            require_visible_content(image_path)
        except ValueError as error:
            raise WorkerError(str(error)) from error
        if not self.available:
            self.start()
        if not self.available or self._process is None:
            raise WorkerError(self._detail or f"{self.name} is unavailable")

        request_id = uuid.uuid4().hex
        request = json.dumps({"request_id": request_id, "image_path": str(image_path.resolve())}, ensure_ascii=False)
        try:
            assert self._process.stdin is not None
            assert self._process.stdout is not None
            self._process.stdin.write(request + "\n")
            self._process.stdin.flush()
            response = self._read_protocol_message(self.inference_timeout)
            if response is not None and response.get("request_id") != request_id:
                raise WorkerError("Recognition worker returned an unexpected request ID")
            if response is not None and not response.get("error"):
                duration = response.get("inference_ms")
                if not isinstance(response.get("latex"), str) or not isinstance(duration, (int, float)) or not math.isfinite(duration) or duration < 0:
                    raise WorkerError("Recognition worker returned an invalid result")
        except (TimeoutError, OSError, WorkerError) as error:
            self._detail = str(error)
            self.close(force=True)
            raise WorkerError(
                "認識モデルの応答が途切れました。書いた内容は残っています。"
                "もう一度読み取るとモデルを再起動します。"
            ) from error

        if response is None:
            self._detail = self._read_log_tail() or "Worker stopped during inference"
            self.close(force=True)
            raise WorkerError(self._detail)
        if response.get("error"):
            detail = str(response["error"])
            if "CUDA" in detail or "AcceleratorError" in detail:
                # A process with a failed CUDA context must not remain ready.
                # The next submission starts a fresh worker before inference.
                self._detail = detail
                self.close()
                raise WorkerError(
                    "GPU認識処理が停止しました。回答を残したまま、もう一度提出してください。"
                    "次の提出で認識モデルを再起動します。"
                ) from WorkerError(detail)
            raise WorkerError(detail)
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

    def _read_protocol_message(self, timeout: float) -> dict[str, object] | None:
        return self._reader.read(timeout) if self._reader is not None else None

    def close(self, *, force: bool = False) -> None:
        with self._lock:
            self._close_process(force=force)

    def _close_process(self, *, force: bool) -> None:
        process, reader = self._process, self._reader
        self._process, self._reader = None, None
        if process is not None and process.poll() is None:
            try:
                if force:
                    terminate_owned_process(process)
                elif process.stdin:
                    process.stdin.write('{"command":"shutdown"}\n')
                    process.stdin.flush()
                process.wait(timeout=1)
            except (OSError, subprocess.TimeoutExpired):
                terminate_owned_process(process)
                process.kill()
                process.wait(timeout=2)
        if reader is not None:
            reader.thread.join(timeout=1)
        if process is not None:
            for pipe in (process.stdin, process.stdout):
                if pipe is not None:
                    pipe.close()
        if self._log_handle is not None:
            self._log_handle.close()
            self._log_handle = None

    def _read_log_tail(self, limit: int = 8_000) -> str:
        try:
            text = self.log_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return ""
        return text[-limit:].strip()
