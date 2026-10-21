"""Shared bounded upload validation for game, comparison and collection routes."""
from pathlib import Path
import tempfile

from fastapi import HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from PIL import Image

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 16_000_000
ALLOWED_FORMATS = {"PNG", "JPEG", "WEBP"}


def _validate_payload(payload: bytes, filename: str) -> tuple[Path, int, int]:
    suffix = Path(filename).suffix.lower() or ".png"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
        handle.write(payload)
        path = Path(handle.name)
    try:
        with Image.open(path) as opened:
            if opened.format not in ALLOWED_FORMATS:
                raise HTTPException(status_code=415, detail="Use PNG, JPEG, or WebP")
            width, height = opened.size
            if width * height > MAX_IMAGE_PIXELS:
                raise HTTPException(status_code=413, detail="Image exceeds 16 million pixels")
            opened.verify()
        return path, width, height
    except Image.DecompressionBombError as error:
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=413, detail="Image dimensions are too large") from error
    except BaseException:
        path.unlink(missing_ok=True)
        raise


async def validated_temp_image(image: UploadFile) -> tuple[Path, int, int]:
    payload = await image.read(MAX_IMAGE_BYTES + 1)
    if not payload:
        raise HTTPException(status_code=400, detail="Image is empty")
    if len(payload) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds 10 MiB")
    return await run_in_threadpool(_validate_payload, payload, image.filename or "input.png")
