from __future__ import annotations

import asyncio
import logging
import json
import mimetypes
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import UnidentifiedImageError

from backend.app.config import REPO_ROOT, load_paths
from backend.app.custom_samples import save_custom_sample
from backend.app.uploads import validated_temp_image as _validated_temp_image
from backend.app.sample_validation import validate_strokes
from backend.app.local_admin import LocalAdminMiddleware
from backend.app.pairing import router as pairing_router
from backend.app.build_assets import entry_styles
from backend.app.game_questions import add_question, get_questions, get_solution, judge_answer, update_question_review
from backend.app.latex import normalize_latex
from backend.app.recognizers.registry import RecognizerRegistry
from backend.app.recognizers.worker import WorkerError
from backend.app.schemas import (
    ComparisonResponse,
    GameQuestionCreateRequest,
    GameQuestionCreateResponse,
    GameQuestionResponse,
    GameRecognitionResponse,
    JudgementRequest,
    JudgementResponse,
    ModelStatus,
    RecognitionImage,
    RecognitionResponse,
    RecognitionTiming,
    SavedSampleResponse,
    SolutionResponse,
    QuestionReviewRequest,
)

LOGGER = logging.getLogger("math_go_hmer")

# Windows can inherit a registry mapping that labels JavaScript as text/plain.
# Browsers reject ES modules served with that MIME type, so keep the static
# asset contract deterministic across development and exhibition machines.
mimetypes.add_type("text/javascript", ".js", strict=True)
mimetypes.add_type("text/javascript", ".mjs", strict=True)
mimetypes.add_type("application/json", ".map", strict=True)
mimetypes.add_type("application/wasm", ".wasm", strict=True)

registry = RecognizerRegistry()
paths = load_paths()
inference_locks = {"texteller": asyncio.Lock(), "unimernet": asyncio.Lock()}


@asynccontextmanager
async def lifespan(_: FastAPI):
    registry.start_all()
    yield
    registry.close()


app = FastAPI(title="数学でGO Recognition Service", version="0.1.0a1", lifespan=lifespan)
app.add_middleware(LocalAdminMiddleware)
app.include_router(pairing_router)
FRONTEND_DIR = REPO_ROOT / "frontend"
GAME_DIST_DIR = REPO_ROOT / "game" / "dist"
app.mount("/assets", StaticFiles(directory=FRONTEND_DIR), name="assets")
if (GAME_DIST_DIR / "game-assets").is_dir():
    app.mount(
        "/game-assets",
        StaticFiles(directory=GAME_DIST_DIR / "game-assets"),
        name="game-assets",
    )
if (GAME_DIST_DIR / "audio").is_dir():
    app.mount(
        "/audio",
        StaticFiles(directory=GAME_DIST_DIR / "audio"),
        name="game-audio",
    )


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    game_index = GAME_DIST_DIR / "index.html"
    return FileResponse(
        game_index if game_index.is_file() else FRONTEND_DIR / "index.html",
        headers={"Cache-Control": "no-store"},
    )


@app.get("/display", include_in_schema=False)
def display_game() -> FileResponse:
    display_index = GAME_DIST_DIR / "display.html"
    if not display_index.is_file():
        raise HTTPException(status_code=503, detail="Build the game before opening the display")
    return FileResponse(display_index, headers={"Cache-Control": "no-store"})


@app.get("/controller", include_in_schema=False)
def controller_game() -> FileResponse:
    controller_index = GAME_DIST_DIR / "controller.html"
    if not controller_index.is_file():
        raise HTTPException(status_code=503, detail="Build the game before opening the controller")
    return FileResponse(controller_index, headers={"Cache-Control": "no-store"})


@app.get("/evaluation", include_in_schema=False)
def evaluation() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/support.css", include_in_schema=False)
def support_styles():
    manifest_path = GAME_DIST_DIR / ".vite" / "manifest.json"
    if not manifest_path.is_file():
        raise HTTPException(status_code=503, detail="Build the game to prepare local evaluation assets")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    styles = entry_styles(manifest, "src/support.ts")
    if not styles:
        raise HTTPException(status_code=503, detail="Local math stylesheet is missing; rebuild the game")
    if len(styles) == 1:
        return RedirectResponse("/" + styles[0])
    return Response("\n".join(f'@import url("/{path}");' for path in styles), media_type="text/css")


@app.get("/questions/editor", include_in_schema=False)
def question_editor() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "question-editor.html")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/models", response_model=list[ModelStatus])
def models() -> list[dict[str, object]]:
    return registry.statuses()


@app.post("/models/preload")
def preload_models() -> dict[str, str]:
    return {"status": registry.begin_preload()}


@app.get("/api/v1/health/live")
def api_liveness() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/questions", response_model=list[GameQuestionResponse])
def api_game_questions() -> list[dict[str, object]]:
    """Return exhibition-game prompts without exposing accepted answers."""
    return [question.public_dict() for question in get_questions()]


@app.patch("/api/v1/admin/questions/{question_id}/review", response_model=GameQuestionResponse)
def api_review_question(question_id: str, request: QuestionReviewRequest) -> dict[str, object]:
    try:
        return update_question_review(question_id, request.review_status, request.exhibition_enabled).public_dict()
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Unknown question_id") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/admin/questions", response_model=GameQuestionCreateResponse, status_code=201)
def api_add_game_question(request: GameQuestionCreateRequest) -> dict[str, object]:
    """Append one validated question from the local authoring screen."""
    try:
        question = add_question(request.model_dump())
    except ValueError as exc:
        status_code = 409 if "duplicate id" in str(exc) else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    return {
        "id": question.id,
        "total": len(get_questions()),
        "message": "問題を登録しました。テストプレイで確認してから、本番候補へ追加してください。",
    }


@app.post("/api/v1/judgements", response_model=JudgementResponse)
def api_judge_answer(request: JudgementRequest) -> dict[str, object]:
    try:
        return judge_answer(request.question_id, request.recognized_latex)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Unknown question_id") from exc


@app.get("/api/v1/solutions/{question_id}", response_model=SolutionResponse)
def api_game_solution(question_id: str) -> dict[str, str]:
    """Reveal one solution after a timeout or player-requested skip."""
    try:
        return get_solution(question_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Unknown question_id") from exc


@app.get("/api/v1/health/ready")
def api_readiness(model: str = "texteller") -> dict[str, object]:
    try:
        recognizer = registry.get(model.lower())
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    status = "ready" if recognizer.available else "loading" if recognizer.loading else "unavailable"
    return {
        "status": status,
        "model": recognizer.name,
        "variant": recognizer.variant,
        "device": recognizer.device,
        "detail": recognizer.detail,
        "initialization_ms": recognizer.initialization_ms,
    }


@app.post("/api/v1/models/{model}/preload")
def api_preload_model(model: str) -> dict[str, str]:
    name = model.lower()
    try:
        status = registry.begin_preload((name,))
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": status, "model": name}


@app.post("/api/v1/recognitions", response_model=GameRecognitionResponse)
async def api_recognize(
    image: UploadFile = File(...),
    model: str = Form("texteller"),
    request_id: str | None = Form(None),
) -> GameRecognitionResponse:
    """Recognize one cropped handwriting image and return end-to-end timing."""
    total_started = time.perf_counter()
    name = model.lower()
    try:
        recognizer = registry.get(name)
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        temp_path, width, height = await _validated_temp_image(image)
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=400, detail="Invalid or corrupt image") from exc
    preprocessing_ms = (time.perf_counter() - total_started) * 1000
    image_bytes = temp_path.stat().st_size

    queue_started = time.perf_counter()
    try:
        async with inference_locks[name]:
            queue_ms = (time.perf_counter() - queue_started) * 1000
            result = await run_in_threadpool(recognizer.recognize, temp_path)
        total_ms = (time.perf_counter() - total_started) * 1000
        return GameRecognitionResponse(
            request_id=request_id or str(uuid.uuid4()),
            model=result.model,
            model_variant=result.model_variant,
            device=result.device,
            raw_latex=result.latex,
            normalized_latex=normalize_latex(result.latex),
            timing=RecognitionTiming(
                preprocessing_ms=preprocessing_ms,
                queue_ms=queue_ms,
                inference_ms=result.inference_ms,
                total_ms=total_ms,
            ),
            image=RecognitionImage(width=width, height=height, bytes=image_bytes),
            initialization_ms=result.initialization_ms,
            peak_vram_mb=result.peak_vram_mb,
        )
    except WorkerError as exc:
        LOGGER.exception("Game recognition failed for %s", name)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    finally:
        temp_path.unlink(missing_ok=True)


@app.post("/recognize", response_model=RecognitionResponse)
async def recognize(
    model: str = Form(...),
    image: UploadFile = File(...),
) -> RecognitionResponse:
    try:
        recognizer = registry.get(model.lower())
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        temp_path, _, _ = await _validated_temp_image(image)
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=400, detail="Invalid or corrupt image") from exc

    started = time.perf_counter()
    try:
        async with inference_locks[model.lower()]:
            result = await run_in_threadpool(recognizer.recognize, temp_path)
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


@app.post("/recognize/compare", response_model=ComparisonResponse)
async def recognize_both(image: UploadFile = File(...)) -> ComparisonResponse:
    try:
        temp_path, width, height = await _validated_temp_image(image)
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=400, detail="Invalid or corrupt image") from exc
    try:
        results = {}
        # Keep model execution sequential for VRAM, but never block the event loop.
        for name in ("texteller", "unimernet"):
            async with inference_locks[name]:
                results[name] = await run_in_threadpool(_run_recognizer, name, temp_path)
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
        saved = await run_in_threadpool(
            save_custom_sample,
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


@app.post("/api/v1/test-samples", response_model=SavedSampleResponse, status_code=201)
async def api_save_test_sample(
    image: UploadFile = File(...),
    strokes_json: str = Form(...),
    question_id: str = Form(...),
    ground_truth_latex: str = Form(...),
    recognized_latex: str = Form(...),
    recognition_request_id: str = Form(...),
    consent: bool = Form(False),
    label_confirmed: bool = Form(False),
    writer_id: str = Form("anonymous"),
) -> SavedSampleResponse:
    """Save opt-in handwriting with a human transcription, never the solution as label."""
    if not consent or not label_confirmed:
        raise HTTPException(status_code=400, detail="保存への同意と、書いた内容の確認が必要です。")
    if not ground_truth_latex.strip() or len(ground_truth_latex) > 4000 or len(recognized_latex) > 4000:
        raise HTTPException(status_code=400, detail="書いた内容を4000文字以内のLaTeXで入力してください。")
    if len(strokes_json) > 2_000_000:
        raise HTTPException(status_code=413, detail="Stroke data exceeds 2 MB")
    try:
        uuid.UUID(recognition_request_id)
        validate_strokes(strokes_json)
        question = next((q for q in get_questions() if q.id == question_id), None)
        if question is None:
            raise KeyError(question_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Unknown question_id") from exc
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid request ID or stroke JSON") from exc
    try:
        temp_path, _, _ = await _validated_temp_image(image)
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=400, detail="Invalid or corrupt image") from exc
    try:
        saved = await run_in_threadpool(
            save_custom_sample,
            paths=paths, image_path=temp_path, strokes_json=strokes_json,
            ground_truth_latex=ground_truth_latex, category=question.category,
            difficulty=str(question.difficulty), writer_id=writer_id,
            sample_key=recognition_request_id,
            annotations={
                "schema_version": 1, "purpose": "test_play_training_candidate",
                "question_id": question_id, "question_prompt": question.prompt or question.display,
                "reference_answer_latex": question.answer_latex,
                "recognized_latex": recognized_latex,
                "recognition_request_id": recognition_request_id,
                "human_verified": True, "consent": True,
                "label_source": "human_transcription_of_handwriting",
                "training_status": "candidate_requires_dataset_review",
                "model": "texteller",
            },
        )
        return SavedSampleResponse(**{key: saved[key] for key in ("sample_id", "image_path", "stroke_path", "manifest_path")})
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        temp_path.unlink(missing_ok=True)
