"""Reject images that become empty after the recognizer's background trim."""
from collections import Counter
from pathlib import Path

from PIL import Image, ImageChops


def require_visible_content(path: Path) -> None:
    with Image.open(path) as source:
        rgba = source.convert("RGBA")
        paper = Image.new("RGBA", rgba.size, "white")
        paper.alpha_composite(rgba)
        image = paper.convert("RGB")
    w, h = image.size
    corners = [image.getpixel(p) for p in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
    background = Counter(corners).most_common(1)[0][0]
    difference = ImageChops.difference(image, Image.new("RGB", image.size, background)).convert("L")
    if difference.point(lambda value: 255 if value > 15 else 0).getbbox() is None:
        raise ValueError("書いた線を読み取れませんでした。回答欄に式を書いて、もう一度読み取ってください。")
