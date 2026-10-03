from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
import traceback
from contextlib import redirect_stdout
from pathlib import Path

import torch
import yaml
from PIL import Image

PROTOCOL_OUT = sys.stdout
PROTOCOL_PREFIX = "@@HMER_JSON@@"


def emit(payload: dict[str, object]) -> None:
    print(PROTOCOL_PREFIX + json.dumps(payload, ensure_ascii=False), file=PROTOCOL_OUT, flush=True)


def choose_device() -> torch.device:
    requested = os.getenv("HMER_DEVICE", "auto")
    if requested == "auto":
        requested = "cuda" if torch.cuda.is_available() else "cpu"
    return torch.device(requested)


def make_config(repo: Path, variant: str, device: torch.device) -> Path:
    source = repo / "configs" / "demo.yaml"
    config = yaml.safe_load(source.read_text(encoding="utf-8"))
    model_dir = repo / "models" / f"unimernet_{variant}"
    config["model"]["model_config"]["model_name"] = str(model_dir)
    config["model"]["pretrained"] = str(model_dir / f"unimernet_{variant}.pth")
    config["model"]["tokenizer_config"]["path"] = str(model_dir)
    config["run"]["device"] = device.type
    handle = tempfile.NamedTemporaryFile("w", suffix=".yaml", encoding="utf-8", delete=False)
    with handle:
        yaml.safe_dump(config, handle, sort_keys=False)
    return Path(handle.name)


def main() -> None:
    config_path: Path | None = None
    try:
        initialized_at = time.perf_counter()
        repo = Path(os.environ["UNIMERNET_REPO"]).resolve()
        sys.path.insert(0, str(repo))
        variant = os.getenv("HMER_MODEL_VARIANT", "tiny")
        device = choose_device()
        if device.type == "cuda":
            torch.cuda.reset_peak_memory_stats(device)
        with redirect_stdout(sys.stderr):
            from unimernet.common.config import Config
            import unimernet.tasks as tasks
            from unimernet.processors import load_processor

            config_path = make_config(repo, variant, device)
            args = argparse.Namespace(cfg_path=str(config_path), options=None)
            cfg = Config(args)
            task = tasks.setup_task(cfg)
            model = task.build_model(cfg).to(device)
            model.eval()
            vis_processor = load_processor(
                "formula_image_eval", cfg.config.datasets.formula_rec_eval.vis_processor.eval
            )
        emit(
            {
                "status": "ready",
                "device": str(device),
                "variant": variant,
                "initialization_ms": (time.perf_counter() - initialized_at) * 1000,
                "peak_vram_mb": torch.cuda.max_memory_allocated(device) / 1024**2 if device.type == "cuda" else None,
            }
        )
    except Exception as exc:
        emit({"status": "error", "error": f"{type(exc).__name__}: {exc}"})
        traceback.print_exc(file=sys.stderr)
        if config_path:
            config_path.unlink(missing_ok=True)
        return

    try:
        for line in sys.stdin:
            try:
                request = json.loads(line)
                if request.get("command") == "shutdown":
                    return
                raw_image = Image.open(request["image_path"]).convert("RGB")
                image = vis_processor(raw_image).unsqueeze(0).to(device)
                if device.type == "cuda":
                    torch.cuda.synchronize()
                started = time.perf_counter()
                with redirect_stdout(sys.stderr), torch.inference_mode():
                    output = model.generate({"image": image})
                if device.type == "cuda":
                    torch.cuda.synchronize()
                emit(
                    {
                        "latex": output["pred_str"][0],
                        "inference_ms": (time.perf_counter() - started) * 1000,
                        "peak_vram_mb": torch.cuda.max_memory_allocated(device) / 1024**2 if device.type == "cuda" else None,
                    }
                )
            except Exception as exc:
                emit({"error": f"{type(exc).__name__}: {exc}"})
                traceback.print_exc(file=sys.stderr)
    finally:
        if config_path:
            config_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
