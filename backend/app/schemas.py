from __future__ import annotations

from pydantic import BaseModel, Field


class RecognitionResponse(BaseModel):
    latex: str | None
    model: str
    model_variant: str
    elapsed_ms: float
    inference_ms: float | None
    initialization_ms: float | None = None
    peak_vram_mb: float | None = None
    device: str
    error: str | None


class ComparisonResponse(BaseModel):
    results: dict[str, RecognitionResponse]
    image_width: int
    image_height: int


class SavedSampleResponse(BaseModel):
    sample_id: str
    image_path: str
    stroke_path: str
    manifest_path: str


class ModelStatus(BaseModel):
    name: str
    variant: str
    device: str
    available: bool
    loading: bool = False
    detail: str | None = None
    initialization_ms: float | None = None
    peak_vram_mb: float | None = None


class RecognitionTiming(BaseModel):
    preprocessing_ms: float
    queue_ms: float
    inference_ms: float
    total_ms: float


class RecognitionImage(BaseModel):
    width: int
    height: int
    bytes: int


class GameRecognitionResponse(BaseModel):
    request_id: str
    model: str
    model_variant: str
    device: str
    raw_latex: str
    normalized_latex: str
    timing: RecognitionTiming
    image: RecognitionImage
    initialization_ms: float | None = None
    peak_vram_mb: float | None = None


class GameQuestionResponse(BaseModel):
    id: str
    instruction: str
    display: str
    display_latex: str
    category: str
    difficulty: int
    difficulty_label: str


class GameQuestionCreateRequest(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*$")
    question: str = Field(min_length=1)
    question_latex: str = Field(min_length=1)
    instruction: str = Field(min_length=1)
    answer: list[str] = Field(min_length=1)
    description: str = Field(min_length=1)
    difficulty: int = Field(ge=1, le=7)
    category: str = Field(min_length=1)


class GameQuestionCreateResponse(BaseModel):
    id: str
    total: int
    message: str


class JudgementRequest(BaseModel):
    question_id: str
    recognized_latex: str


class JudgementResponse(BaseModel):
    question_id: str
    correct: bool
    recognized_latex: str
    recognized_normalized: str
    expected_latex: str
    explanation: str
    judge_method: str
    message: str


class SolutionResponse(BaseModel):
    question_id: str
    expected_latex: str
    explanation: str
