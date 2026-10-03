from __future__ import annotations

import json
import os
import sys
import time
import traceback
from contextlib import redirect_stdout

import torch

PROTOCOL_OUT = sys.stdout
PROTOCOL_PREFIX = "@@HMER_JSON@@"


def emit(payload: dict[str, object]) -> None:
    print(PROTOCOL_PREFIX + json.dumps(payload, ensure_ascii=False), file=PROTOCOL_OUT, flush=True)


def choose_device() -> torch.device:
    requested = os.getenv("HMER_DEVICE", "auto")
    if requested == "auto":
        requested = "cuda" if torch.cuda.is_available() else "cpu"
    return torch.device(requested)


def main() -> None:
    try:
        initialized_at = time.perf_counter()
        device = choose_device()
        if device.type == "cuda":
            torch.cuda.reset_peak_memory_stats(device)
        use_onnx = os.getenv("TEXTELLER_USE_ONNX", "0") == "1"
        model_dir = os.getenv("TEXTELLER_MODEL_DIR") or None
        with redirect_stdout(sys.stderr):
            from texteller import img2latex, load_model, load_tokenizer

            model = load_model(model_dir=model_dir, use_onnx=use_onnx)
            if not use_onnx and hasattr(model, "to"):
                model = model.to(device)
                model.eval()
            tokenizer = load_tokenizer(tokenizer_dir=model_dir)
        emit(
            {
                "status": "ready",
                "device": str(device),
                "variant": os.getenv("HMER_MODEL_VARIANT", "3.0"),
                "initialization_ms": (time.perf_counter() - initialized_at) * 1000,
                "peak_vram_mb": torch.cuda.max_memory_allocated(device) / 1024**2 if device.type == "cuda" else None,
            }
        )
    except Exception as exc:
        emit({"status": "error", "error": f"{type(exc).__name__}: {exc}"})
        traceback.print_exc(file=sys.stderr)
        return

    for line in sys.stdin:
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
                    "latex": latex,
                    "inference_ms": (time.perf_counter() - started) * 1000,
                    "peak_vram_mb": torch.cuda.max_memory_allocated(device) / 1024**2 if device.type == "cuda" else None,
                }
            )
        except Exception as exc:
            emit({"error": f"{type(exc).__name__}: {exc}"})
            traceback.print_exc(file=sys.stderr)


if __name__ == "__main__":
    main()
