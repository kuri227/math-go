"""Shared bounded upload validation for game, comparison and collection routes."""
from pathlib import Path
import struct
import tempfile
import zlib

from fastapi import HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from PIL import Image

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 16_000_000
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
ALLOWED_FORMATS = {"PNG"}
ALLOWED_PIL_FORMATS = tuple(sorted(ALLOWED_FORMATS))
# Browser canvas output only needs the core chunks plus small colour/display hints.
# Palette, text, profile, EXIF and animation chunks deliberately stay unsupported.
SAFE_PNG_CHUNKS = {b"IHDR", b"IDAT", b"IEND", b"sRGB", b"gAMA", b"cHRM", b"pHYs"}
FIXED_PNG_CHUNK_LENGTHS = {b"sRGB": 1, b"gAMA": 4, b"cHRM": 32, b"pHYs": 9}


def open_allowed_image(path: Path):
    """Open only exhibition-supported decoders, regardless of filename."""
    return Image.open(path, formats=ALLOWED_PIL_FORMATS)


def _validate_png_container(payload: bytes) -> tuple[int, int]:
    """Reject active/complex PNG features before Pillow sees the input."""
    if not payload.startswith(PNG_SIGNATURE):
        raise HTTPException(status_code=415, detail="Use a standard PNG image")
    offset = len(PNG_SIGNATURE)
    chunks: list[bytes] = []
    width = height = 0
    while offset < len(payload):
        if len(payload) - offset < 12:
            raise HTTPException(status_code=400, detail="Invalid PNG chunk")
        length = struct.unpack(">I", payload[offset : offset + 4])[0]
        chunk_type = payload[offset + 4 : offset + 8]
        end = offset + 12 + length
        if length > MAX_IMAGE_BYTES or end > len(payload):
            raise HTTPException(status_code=400, detail="Invalid PNG chunk length")
        data = payload[offset + 8 : offset + 8 + length]
        expected_crc = struct.unpack(">I", payload[offset + 8 + length : end])[0]
        if zlib.crc32(chunk_type + data) & 0xFFFFFFFF != expected_crc:
            raise HTTPException(status_code=400, detail="Invalid PNG checksum")
        if chunk_type not in SAFE_PNG_CHUNKS:
            raise HTTPException(status_code=415, detail="PNG contains an unsupported metadata or animation chunk")
        expected_length = FIXED_PNG_CHUNK_LENGTHS.get(chunk_type)
        if expected_length is not None and length != expected_length:
            raise HTTPException(status_code=400, detail="PNG contains an invalid display chunk")
        if chunk_type == b"IHDR" and chunks:
            raise HTTPException(status_code=400, detail="PNG contains more than one IHDR")
        if chunk_type == b"IDAT" and b"IEND" in chunks:
            raise HTTPException(status_code=400, detail="PNG image data appears after IEND")
        chunks.append(chunk_type)
        if len(chunks) == 1:
            if chunk_type != b"IHDR" or length != 13:
                raise HTTPException(status_code=400, detail="PNG must start with IHDR")
            width, height, bit_depth, color_type, compression, filtering, interlace = struct.unpack(">IIBBBBB", data)
            if bit_depth != 8 or color_type not in {0, 2, 4, 6} or compression or filtering or interlace:
                raise HTTPException(status_code=415, detail="Use a non-interlaced 8-bit PNG")
            if width < 1 or height < 1 or width * height > MAX_IMAGE_PIXELS:
                raise HTTPException(status_code=413, detail="Image exceeds 16 million pixels")
        if chunk_type == b"IEND":
            if length or end != len(payload):
                raise HTTPException(status_code=400, detail="Invalid PNG ending")
            break
        offset = end
    if not chunks or chunks[-1] != b"IEND" or b"IDAT" not in chunks:
        raise HTTPException(status_code=400, detail="Incomplete PNG image")
    return width, height


def _validate_payload(payload: bytes, filename: str) -> tuple[Path, int, int]:
    del filename  # The untrusted filename never chooses a decoder or suffix.
    width, height = _validate_png_container(payload)
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as handle:
        handle.write(payload)
        path = Path(handle.name)
    try:
        with open_allowed_image(path) as opened:
            if opened.format != "PNG" or opened.size != (width, height):
                raise HTTPException(status_code=400, detail="PNG header mismatch")
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
