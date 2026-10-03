from __future__ import annotations

from backend.app.latex import normalize_latex


def exact_match(prediction: str, ground_truth: str) -> bool:
    return prediction == ground_truth


def normalized_match(prediction: str, ground_truth: str) -> bool:
    return normalize_latex(prediction) == normalize_latex(ground_truth)
