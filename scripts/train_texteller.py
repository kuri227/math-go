"""Reviewed, non-replaying local training. Does not change the active server model."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.training.registry import Registry


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    scan = sub.add_parser("scan", help="Import consenting, human-verified candidates without training")
    scan.add_argument("--source", type=Path)
    sub.add_parser("status", help="List images, review status, near-duplicate warnings and runs")
    review = sub.add_parser("review", help="Approve one manually inspected sample, never all implicitly")
    review.add_argument("--sample-id", required=True)
    review.add_argument("--split", choices=("train", "validation", "test"), required=True)
    review.add_argument("--reviewer", required=True)
    review.add_argument("--checked-near-duplicates", action="store_true")
    sub.add_parser("plan", help="Show only unused approved training images; no GPU/model loading")
    train = sub.add_parser("run", help="One pass, no replay/resume; failed batches remain unavailable")
    train.add_argument("--device", choices=("cpu", "cuda"), required=True)
    train.add_argument("--learning-rate", type=float, default=1e-5)
    train.add_argument("--confirm-single-use", action="store_true", help="Acknowledge permanent reservation even on failure")
    args = parser.parse_args()
    registry = Registry(ROOT / "data/training")
    try:
        if args.command == "scan":
            from backend.app.config import load_paths
            result = registry.scan(args.source or load_paths().custom_eval, ROOT)
        elif args.command == "status":
            result = registry.status()
        elif args.command == "review":
            registry.review(args.sample_id, args.split, args.reviewer, args.checked_near_duplicates)
            result = {"reviewed": args.sample_id, "split": args.split}
        elif args.command == "plan":
            result = registry.plan()
        else:
            if not args.confirm_single_use:
                parser.error("run requires --confirm-single-use; a reserved batch is NEVER retried, even after failure")
            from backend.training.texteller import run
            result = run(registry, ROOT / ".model-cache/texteller", args.device, args.learning_rate)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 2 if args.command == "scan" and result["rejected"] else 0
    finally:
        registry.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError) as error:
        print(f"Training refused: {error}", file=sys.stderr)
        raise SystemExit(1)
