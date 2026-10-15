from __future__ import annotations

import copy
import json
import math
from importlib.metadata import version
from pathlib import Path

from backend.training.registry import Registry, digest, stamp


def model_fingerprint(path: Path) -> dict:
    required = ("config.json", "model.safetensors", "tokenizer.json", "tokenizer_config.json")
    return {name: digest(path / name) for name in required}


def prepare_head(model):
    """Untie the LM output projection: keep the large feature extractor frozen."""
    for parameter in model.parameters():
        parameter.requires_grad_(False)
    head = copy.deepcopy(model.decoder.get_output_embeddings())
    model.decoder.set_output_embeddings(head)
    # Prevent save_pretrained/reload from retying the trained projection to frozen input embeddings.
    model.config.decoder.tie_word_embeddings = False
    model.decoder.config.tie_word_embeddings = False
    for parameter in head.parameters():
        parameter.requires_grad_(True)
    model.eval()  # Frozen feature extractor; no stochastic augmentation/dropout/replay.
    return list(head.parameters())


def single_pass(model, optimizer, train_samples, validation_samples, batch, progress):
    import torch

    def evaluate():
        with torch.no_grad():
            losses = [float(model(**batch(sample)).loss) for sample in validation_samples]
        if not losses or not all(math.isfinite(value) for value in losses):
            raise ValueError("Non-finite or missing validation loss")
        return sum(losses) / len(losses)

    before = evaluate()
    seen = set()
    losses = []
    for index, sample in enumerate(train_samples, 1):
        if sample["hash"] in seen:
            raise ValueError("Duplicate train sample in execution plan")
        seen.add(sample["hash"])
        optimizer.zero_grad(set_to_none=True)
        loss = model(**batch(sample)).loss
        if not torch.isfinite(loss):
            raise ValueError("Non-finite training loss")
        loss.backward()
        torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], 1.0, error_if_nonfinite=True)
        optimizer.step()
        value = float(loss.detach())
        losses.append(value)
        progress({"step": index, "sample_hash": sample["hash"], "loss": value})
    return {"train_samples": len(seen), "optimizer_steps": len(losses), "epochs": 1,
            "train_loss": sum(losses) / len(losses), "validation_loss_before": before,
            "validation_loss_after": evaluate()}


def run(registry: Registry, base: Path, device: str, learning_rate: float) -> dict:
    """Preflight before reservation; any post-reservation failure permanently burns the batch."""
    import torch
    from PIL import Image
    from texteller import load_model, load_tokenizer
    from texteller.utils import transform

    if device not in ("cpu", "cuda") or not math.isfinite(learning_rate) or not 0 < learning_rate <= 0.001:
        raise ValueError("Explicit cpu/cuda device and learning rate in (0, 0.001] required")
    if device == "cuda" and not torch.cuda.is_available():
        raise ValueError("CUDA is unavailable; no silent CPU fallback")
    if torch.distributed.is_initialized():
        raise ValueError("Distributed training is prohibited: no padded/repeated sampler")
    plan = registry.plan()
    if not plan["train"] or not plan["validation"]:
        raise ValueError("No unused reviewed train data or no separate reviewed validation writer")
    previous = registry.db.execute("SELECT id FROM runs WHERE status='completed' ORDER BY created_at DESC LIMIT 1").fetchone()
    model_dir = registry.root / "runs" / previous[0] / "model" if previous else base.resolve()
    fingerprint = model_fingerprint(model_dir)
    if previous:
        previous_detail = registry.db.execute("SELECT detail FROM runs WHERE id=?", (previous[0],)).fetchone()[0]
        if fingerprint != json.loads(previous_detail)["model_sha256"]:
            raise ValueError("Previously trained model changed after completion")
    registry.verify_objects(plan)
    tokenizer = load_tokenizer(tokenizer_dir=str(model_dir))
    model = load_model(model_dir=str(model_dir), use_onnx=False).to(device)
    trainable = prepare_head(model)
    # Check every label for unknown/oversized tokens BEFORE claiming any image.
    tokens = {}
    maximum = min(1024, getattr(model.config.decoder, "max_position_embeddings", 1024))
    for split in ("train", "validation", "test"):
        for sample in plan[split]:
            encoded = tokenizer(sample["label"], return_tensors="pt", truncation=False).input_ids
            if encoded.shape[1] > maximum or (tokenizer.unk_token_id is not None and (encoded == tokenizer.unk_token_id).any()):
                raise ValueError(f"Unknown token or excessive length in {sample['sample_id']}; no truncation allowed")
            tokens[sample["hash"]] = encoded.to(device)

    def batch(sample):
        path = registry.root / "objects" / f"{sample['hash']}.png"
        # Revalidate immediately before every use, not just at preflight.
        if digest(path) != sample["image_sha256"]:
            raise ValueError("Image changed during execution")
        if digest(Path(sample["source_metadata"])) != sample["source_sha256"]:
            raise ValueError("Source consent/label changed during execution")
        with Image.open(path) as image:
            # Same deterministic preprocessing as the installed TexTeller inference API.
            pixels = torch.stack(transform([image.convert("RGB")])).to(device)
        return {"pixel_values": pixels, "labels": tokens[sample["hash"]]}

    optimizer = torch.optim.AdamW(trainable, lr=learning_rate)
    if model_fingerprint(model_dir) != fingerprint:
        raise ValueError("Base model changed during preflight")
    config = {"device": device, "learning_rate": learning_rate, "strategy": "lm-head-only",
              "epochs": 1, "batch_size": 1, "resume": False, "base_model": str(model_dir),
              "base_sha256": fingerprint, "torch": torch.__version__, "started_at": stamp()}
    config["packages"] = {name: version(name) for name in ("texteller", "transformers", "pillow", "safetensors")}
    run_id, manifest = registry.reserve(plan, config)
    output = registry.root / "runs" / run_id
    try:
        with (output / "steps.jsonl").open("x", encoding="utf-8") as log:
            def progress(row):
                log.write(json.dumps(row) + "\n"); log.flush()
                print(json.dumps(row), flush=True)
            metrics = single_pass(model, optimizer, manifest["train"], manifest["validation"], batch, progress)
        export = output / "model"
        model.save_pretrained(export, safe_serialization=True)
        tokenizer.save_pretrained(export)
        metrics.update({"run_id": run_id, "strategy": "lm-head-only", "model_sha256": model_fingerprint(export),
                        "promoted": False, "warning": "Validation loss is not recognition accuracy; evaluate on held-out test images before adoption."})
        with (output / "metrics.json").open("x", encoding="utf-8") as handle:
            json.dump(metrics, handle, ensure_ascii=False, indent=2)
        registry.finish(run_id, "completed", json.dumps(metrics))
        return metrics
    except BaseException as error:
        registry.finish(run_id, "failed", f"{type(error).__name__}: {error}")
        raise
