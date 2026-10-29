from __future__ import annotations

import json
import os
import sys
import time
import traceback
from contextlib import redirect_stdout

PROCESS_STARTED_AT = time.perf_counter()

import torch
from settings import cpu_thread_count

PROTOCOL_OUT = sys.stdout
PROTOCOL_PREFIX = "@@HMER_JSON@@"


def emit(payload: dict[str, object]) -> None:
    print(PROTOCOL_PREFIX + json.dumps(payload, ensure_ascii=False), file=PROTOCOL_OUT, flush=True)


def log_startup(label: str, phase_started_at: float) -> float:
    now = time.perf_counter()
    print(
        f"[startup] {label}: {(now - phase_started_at) * 1000:.1f} ms "
        f"(total {(now - PROCESS_STARTED_AT) * 1000:.1f} ms)",
        file=sys.stderr,
        flush=True,
    )
    return now


def choose_device() -> torch.device:
    requested = os.getenv("HMER_DEVICE", "auto")
    if requested == "auto":
        requested = "cuda" if torch.cuda.is_available() else "cpu"
    return torch.device(requested)


def main() -> None:
    try:
        phase_started_at = PROCESS_STARTED_AT
        phase_started_at = log_startup("python and torch imports", phase_started_at)
        device = choose_device()
        cpu_threads = cpu_thread_count(os.getenv("TEXTELLER_CPU_THREADS", "")) if device.type == "cpu" else None
        if cpu_threads is not None:
            torch.set_num_threads(cpu_threads)
        if device.type == "cuda":
            torch.cuda.reset_peak_memory_stats(device)
        use_onnx = os.getenv("TEXTELLER_USE_ONNX", "0") == "1"
        model_dir = os.getenv("TEXTELLER_MODEL_DIR") or None
        with redirect_stdout(sys.stderr):
            from texteller import img2latex, load_model, load_tokenizer

            phase_started_at = log_startup("texteller imports", phase_started_at)
            model = load_model(model_dir=model_dir, use_onnx=use_onnx)
            phase_started_at = log_startup("model weights", phase_started_at)
            if not use_onnx and hasattr(model, "to"):
                model = model.to(device)
                model.eval()
            phase_started_at = log_startup(f"model transfer to {device}", phase_started_at)
            tokenizer = load_tokenizer(tokenizer_dir=model_dir)
            log_startup("tokenizer", phase_started_at)
        emit(
            {
                "status": "ready",
                "device": str(device),
                "variant": os.getenv("HMER_MODEL_VARIANT", "3.0"),
                "initialization_ms": (time.perf_counter() - PROCESS_STARTED_AT) * 1000,
                "peak_vram_mb": torch.cuda.max_memory_allocated(device) / 1024**2 if device.type == "cuda" else None,
            }
        )
    except Exception as exc:
        emit({"status": "error", "error": f"{type(exc).__name__}: {exc}"})
        traceback.print_exc(file=sys.stderr)
        return

    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line)
            if request.get("command") == "shutdown":
                return
            if device.type == "cuda":
                torch.cuda.synchronize()
            started = time.perf_counter()
            with redirect_stdout(sys.stderr), torch.inference_mode():
                latex = img2latex(
                    model,
                    tokenizer,
                    [request["image_path"]],
                    device=device,
                    out_format="latex",
                )[0]
            if device.type == "cuda":
                torch.cuda.synchronize()
            emit(
                {
                    "request_id": request.get("request_id"),
                    "latex": latex,
                    "inference_ms": (time.perf_counter() - started) * 1000,
                    "peak_vram_mb": torch.cuda.max_memory_allocated(device) / 1024**2 if device.type == "cuda" else None,
                }
            )
        except Exception as exc:
            emit({"request_id": request.get("request_id"), "error": f"{type(exc).__name__}: {exc}"})
            traceback.print_exc(file=sys.stderr)


if __name__ == "__main__":
    main()
