from __future__ import annotations

import logging
import json
import tempfile
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError

from backend.app.config import REPO_ROOT, load_paths
from backend.app.custom_samples import save_custom_sample
from backend.app.recognizers.registry import RecognizerRegistry
from backend.app.recognizers.worker import WorkerError
from backend.app.schemas import (
    ComparisonResponse,
    ModelStatus,
    RecognitionResponse,
    SavedSampleResponse,
)

LOGGER = logging.getLogger("math_go_hmer")
MAX_IMAGE_BYTES = 10 * 1024 * 1024
ALLOWED_FORMATS = {"PNG", "JPEG", "WEBP"}
registry = RecognizerRegistry()
paths = load_paths()


@asynccontextmanager
async def lifespan(_: FastAPI):
    registry.start_all()
    yield
    registry.close()


app = FastAPI(title="数学でGO HMER PoC", version="0.1.0", lifespan=lifespan)
FRONTEND_DIR = REPO_ROOT / "frontend"
app.mount("/assets", StaticFiles(directory=FRONTEND_DIR), name="assets")


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/models", response_model=list[ModelStatus])
def models() -> list[dict[str, object]]:
    return registry.statuses()


@app.post("/models/preload")
def preload_models() -> dict[str, str]:
    return {"status": registry.begin_preload()}


@app.post("/recognize", response_model=RecognitionResponse)
async def recognize(
    model: str = Form(...),
    image: UploadFile = File(...),
) -> RecognitionResponse:
    try:
        recognizer = registry.get(model.lower())
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    payload = await image.read(MAX_IMAGE_BYTES + 1)
    if not payload:
        raise HTTPException(status_code=400, detail="Image is empty")
    if len(payload) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds 10 MiB")

    suffix = Path(image.filename or "input.png").suffix.lower() or ".png"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
        handle.write(payload)
        temp_path = Path(handle.name)

    started = time.perf_counter()
    try:
        with Image.open(temp_path) as opened:
            opened.verify()
            if opened.format not in ALLOWED_FORMATS:
                raise HTTPException(status_code=415, detail="Use PNG, JPEG, or WebP")
        result = recognizer.recognize(temp_path)
        elapsed_ms = (time.perf_counter() - started) * 1000
        return RecognitionResponse(
            latex=result.latex,
            model=result.model,
            model_variant=result.model_variant,
            elapsed_ms=elapsed_ms,
            inference_ms=result.inference_ms,
            initialization_ms=result.initialization_ms,
            peak_vram_mb=result.peak_vram_mb,
            device=result.device,
            error=None,
        )
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=400, detail="Invalid or corrupt image") from exc
    except WorkerError as exc:
        LOGGER.exception("Recognition failed for %s", model)
        elapsed_ms = (time.perf_counter() - started) * 1000
        return RecognitionResponse(
            latex=None,
            model=model,
            model_variant=recognizer.variant,
            elapsed_ms=elapsed_ms,
            inference_ms=None,
            initialization_ms=recognizer.initialization_ms,
            peak_vram_mb=recognizer.peak_vram_mb,
            device=recognizer.device,
            error=str(exc),
        )
    finally:
        temp_path.unlink(missing_ok=True)


def _run_recognizer(model: str, image_path: Path) -> RecognitionResponse:
    recognizer = registry.get(model)
    started = time.perf_counter()
    try:
        result = recognizer.recognize(image_path)
        return RecognitionResponse(
            latex=result.latex,
            model=result.model,
            model_variant=result.model_variant,
            elapsed_ms=(time.perf_counter() - started) * 1000,
            inference_ms=result.inference_ms,
            initialization_ms=result.initialization_ms,
            peak_vram_mb=result.peak_vram_mb,
            device=result.device,
            error=None,
        )
    except Exception as exc:
        LOGGER.exception("Recognition failed for %s", model)
        return RecognitionResponse(
            latex=None,
            model=model,
            model_variant=recognizer.variant,
            elapsed_ms=(time.perf_counter() - started) * 1000,
            inference_ms=None,
            initialization_ms=recognizer.initialization_ms,
            peak_vram_mb=recognizer.peak_vram_mb,
            device=recognizer.device,
            error=f"{type(exc).__name__}: {exc}",
        )


async def _validated_temp_image(image: UploadFile) -> tuple[Path, int, int]:
    payload = await image.read(MAX_IMAGE_BYTES + 1)
    if not payload:
        raise HTTPException(status_code=400, detail="Image is empty")
    if len(payload) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds 10 MiB")
    suffix = Path(image.filename or "input.png").suffix.lower() or ".png"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
        handle.write(payload)
        temp_path = Path(handle.name)
    try:
        with Image.open(temp_path) as opened:
            opened.verify()
        with Image.open(temp_path) as opened:
            if opened.format not in ALLOWED_FORMATS:
                raise HTTPException(status_code=415, detail="Use PNG, JPEG, or WebP")
            width, height = opened.size
        return temp_path, width, height
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise


@app.post("/recognize/compare", response_model=ComparisonResponse)
async def recognize_both(image: UploadFile = File(...)) -> ComparisonResponse:
    try:
        temp_path, width, height = await _validated_temp_image(image)
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=400, detail="Invalid or corrupt image") from exc
    try:
        results = {name: _run_recognizer(name, temp_path) for name in ("texteller", "unimernet")}
        return ComparisonResponse(results=results, image_width=width, image_height=height)
    finally:
        temp_path.unlink(missing_ok=True)


@app.post("/samples", response_model=SavedSampleResponse)
async def save_sample(
    image: UploadFile = File(...),
    strokes_json: str = Form(...),
    ground_truth_latex: str = Form(...),
    category: str = Form("unclassified"),
    difficulty: str = Form("unclassified"),
    writer_id: str = Form("anonymous"),
) -> SavedSampleResponse:
    try:
        temp_path, _, _ = await _validated_temp_image(image)
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=400, detail="Invalid or corrupt image") from exc
    try:
        saved = save_custom_sample(
            paths=paths,
            image_path=temp_path,
            strokes_json=strokes_json,
            ground_truth_latex=ground_truth_latex,
            category=category,
            difficulty=difficulty,
            writer_id=writer_id,
        )
        return SavedSampleResponse(
            sample_id=saved["sample_id"],
            image_path=saved["image_path"],
            stroke_path=saved["stroke_path"],
            manifest_path=saved["manifest_path"],
        )
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        temp_path.unlink(missing_ok=True)
