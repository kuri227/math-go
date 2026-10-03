from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class Recognition:
    latex: str
    inference_ms: float
    model: str
    model_variant: str
    device: str
    initialization_ms: float | None = None
    peak_vram_mb: float | None = None


class Recognizer(Protocol):
    name: str
    variant: str
    device: str

    def start(self) -> None: ...

    def recognize(self, image_path: Path) -> Recognition: ...

    def close(self) -> None: ...

    @property
    def available(self) -> bool: ...

    @property
    def detail(self) -> str | None: ...
