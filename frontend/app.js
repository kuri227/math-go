"use strict";

const canvas = document.querySelector("#canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const emptyHint = document.querySelector("#emptyHint");
const pointerIndicator = document.querySelector("#pointerIndicator");
const statusEl = document.querySelector("#status");
const recognizeButton = document.querySelector("#recognize");
const strokes = [];
let activeStroke = null;
let lastCapture = null;
let modelsReady = false;
let recognitionInProgress = false;
let modelPollTimer = null;

function resetSurface() {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
    t: performance.now(),
    pressure: Number.isFinite(event.pressure) ? event.pressure : 0,
    pointerType: event.pointerType || "mouse",
  };
}

function updatePointerIndicator(event) {
  const frame = canvas.parentElement.getBoundingClientRect();
  pointerIndicator.style.left = `${event.clientX - frame.left}px`;
  pointerIndicator.style.top = `${event.clientY - frame.top}px`;
  pointerIndicator.hidden = false;
}

function drawSegment(from, to) {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function redraw() {
  resetSurface();
  for (const stroke of strokes) {
    if (stroke.points.length === 1) {
      const point = stroke.points[0];
      drawSegment(point, { x: point.x + 0.01, y: point.y + 0.01 });
    }
    for (let index = 1; index < stroke.points.length; index += 1) {
      drawSegment(stroke.points[index - 1], stroke.points[index]);
    }
  }
  emptyHint.hidden = strokes.length > 0;
}

canvas.addEventListener("pointerdown", (event) => {
  updatePointerIndicator(event);
  lastCapture = null;
  canvas.setPointerCapture(event.pointerId);
  activeStroke = { pointerType: event.pointerType || "mouse", points: [canvasPoint(event)] };
  strokes.push(activeStroke);
  emptyHint.hidden = true;
});

canvas.addEventListener("pointermove", (event) => {
  updatePointerIndicator(event);
  if (!activeStroke) return;
  const point = canvasPoint(event);
  const previous = activeStroke.points.at(-1);
  activeStroke.points.push(point);
  drawSegment(previous, point);
});

function finishStroke(event) {
  if (!activeStroke) return;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  activeStroke = null;
  if (event.pointerType === "touch") pointerIndicator.hidden = true;
}

canvas.addEventListener("pointerenter", updatePointerIndicator);
canvas.addEventListener("pointerleave", () => {
  if (!activeStroke) pointerIndicator.hidden = true;
});
canvas.addEventListener("pointerup", finishStroke);
canvas.addEventListener("pointercancel", finishStroke);

document.querySelector("#undo").addEventListener("click", () => {
  lastCapture = null;
  strokes.pop();
  redraw();
});

document.querySelector("#clear").addEventListener("click", () => {
  lastCapture = null;
  strokes.length = 0;
  activeStroke = null;
  redraw();
});

function cropCanvas(padding = 18) {
  if (strokes.length === 0) throw new Error("数式を入力してください");
  const points = strokes.flatMap((stroke) => stroke.points);
  const minX = Math.max(0, Math.floor(Math.min(...points.map((p) => p.x)) - padding));
  const minY = Math.max(0, Math.floor(Math.min(...points.map((p) => p.y)) - padding));
  const maxX = Math.min(canvas.width, Math.ceil(Math.max(...points.map((p) => p.x)) + padding));
  const maxY = Math.min(canvas.height, Math.ceil(Math.max(...points.map((p) => p.y)) + padding));
  const output = document.createElement("canvas");
  output.width = Math.max(1, maxX - minX);
  output.height = Math.max(1, maxY - minY);
  const outputContext = output.getContext("2d", { alpha: false });
  outputContext.fillStyle = "#ffffff";
  outputContext.fillRect(0, 0, output.width, output.height);
  outputContext.drawImage(canvas, minX, minY, output.width, output.height, 0, 0, output.width, output.height);
  return { output, crop: { x: minX, y: minY, width: output.width, height: output.height } };
}

function samplePayload(crop) {
  const pointerTypes = [...new Set(strokes.map((stroke) => stroke.pointerType))];
  return {
    sample_id: `canvas-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`,
    created_at: new Date().toISOString(),
    canvas: { width: canvas.width, height: canvas.height },
    crop,
    stroke_count: strokes.length,
    pointer_types: pointerTypes,
    strokes: strokes.map((stroke) => ({
      pointerType: stroke.pointerType,
      points: stroke.points.map(({ x, y, t, pressure, pointerType }) => ({ x, y, t, pressure, pointerType })),
    })),
  };
}

function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

document.querySelector("#download").addEventListener("click", () => {
  try {
    const { output, crop } = cropCanvas();
    const payload = samplePayload(crop);
    output.toBlob((blob) => downloadBlob(blob, `${payload.sample_id}.png`), "image/png");
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `${payload.sample_id}.strokes.json`);
    setStatus("PNGとstroke JSONを保存しました");
  } catch (error) {
    setStatus(error.message, true);
  }
});

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function setModelPending(elementId) {
  const root = document.querySelector(`#${elementId}`);
  root.querySelector('[data-field="error"]').textContent = "";
  root.querySelector('[data-field="latex"]').textContent = "認識中…";
  root.querySelector('[data-field="rendered"]').textContent = "認識中…";
  root.querySelector('[data-field="latency"]').textContent = "Latency: 計測中…";
}

recognizeButton.addEventListener("click", async () => {
  if (!modelsReady || recognitionInProgress) return;
  try {
    const { output, crop } = cropCanvas();
    const blob = await new Promise((resolve) => output.toBlob(resolve, "image/png"));
    const payload = samplePayload(crop);
    lastCapture = { blob, payload, crop };
    const preview = document.querySelector("#preview");
    if (preview.dataset.url) URL.revokeObjectURL(preview.dataset.url);
    preview.dataset.url = URL.createObjectURL(blob);
    preview.src = preview.dataset.url;
    preview.hidden = false;
    const form = new FormData();
    form.append("image", blob, "canvas.png");
    recognitionInProgress = true;
    recognizeButton.disabled = true;
    recognizeButton.textContent = "認識中…";
    setModelPending("textellerResult");
    setModelPending("unimernetResult");
    setStatus("認識中です");
    const response = await fetch("/recognize/compare", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "認識リクエストに失敗しました");
    document.querySelector("#inputMeta").textContent = `${crop.width}×${crop.height}px / ${strokes.length} strokes`;
    displayModelResult("textellerResult", data.results.texteller);
    displayModelResult("unimernetResult", data.results.unimernet);
    const succeeded = Object.values(data.results).filter((result) => !result.error).length;
    setStatus(`両モデルの処理が完了しました（成功 ${succeeded}/2）`, succeeded === 0);
  } catch (error) {
    setStatus(`認識できませんでした: ${error.message}`, true);
  } finally {
    recognitionInProgress = false;
    recognizeButton.disabled = !modelsReady;
    recognizeButton.textContent = modelsReady ? "両モデルで認識する" : "モデルを読み込み中…";
  }
});

function displayModelResult(elementId, result) {
  const root = document.querySelector(`#${elementId}`);
  root.querySelector('[data-field="error"]').textContent = result.error || "";
  root.querySelector('[data-field="latex"]').textContent = result.latex || "認識失敗";
  const rendered = root.querySelector('[data-field="rendered"]');
  rendered.textContent = "";
  const renderableLatex = result.latex
    ?.trim()
    .replace(/^\\\[([\s\S]*)\\\]$/, "$1")
    .replace(/^\\\(([\s\S]*)\\\)$/, "$1")
    .replace(/^\$\$([\s\S]*)\$\$$/, "$1");
  if (renderableLatex && window.katex) window.katex.render(renderableLatex, rendered, { throwOnError: false, displayMode: true });
  else rendered.textContent = result.latex || "-";
  const inference = result.inference_ms == null ? "-" : `${result.inference_ms.toFixed(1)} ms`;
  const initialization = result.initialization_ms == null ? "-" : `${result.initialization_ms.toFixed(0)} ms`;
  const peak = result.peak_vram_mb == null ? "n/a" : `${result.peak_vram_mb.toFixed(0)} MiB`;
  root.querySelector('[data-field="latency"]').textContent = `Latency: ${inference} / init ${initialization} / peak VRAM ${peak} / ${result.device}`;
}

document.querySelector("#saveSample").addEventListener("click", async () => {
  const button = document.querySelector("#saveSample");
  try {
    if (!lastCapture) {
      const { output, crop } = cropCanvas();
      const blob = await new Promise((resolve) => output.toBlob(resolve, "image/png"));
      lastCapture = { blob, payload: samplePayload(crop), crop };
    }
    const groundTruth = document.querySelector("#groundTruth").value.trim();
    if (!groundTruth) throw new Error("正解LaTeXを入力してください");
    const form = new FormData();
    form.append("image", lastCapture.blob, "canvas.png");
    form.append("strokes_json", JSON.stringify(lastCapture.payload));
    form.append("ground_truth_latex", groundTruth);
    form.append("category", document.querySelector("#category").value);
    form.append("difficulty", document.querySelector("#difficulty").value);
    form.append("writer_id", document.querySelector("#writerId").value || "anonymous");
    button.disabled = true;
    setStatus("評価データを保存中です");
    const response = await fetch("/samples", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "保存に失敗しました");
    setStatus(`評価データ ${data.sample_id} を保存しました`);
  } catch (error) {
    setStatus(`保存できませんでした: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
});

function modelDisplayName(name) {
  return name === "texteller" ? "TexTeller" : name === "unimernet" ? "UniMERNet" : name;
}

async function pollModelStatus() {
  try {
    const response = await fetch("/models");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const models = await response.json();
    const ready = models.filter((model) => model.available);
    const loading = models.filter((model) => model.loading);
    const failed = models.filter((model) => !model.available && !model.loading && model.detail);

    if (ready.length === models.length && models.length > 0) {
      modelsReady = true;
      recognizeButton.disabled = recognitionInProgress;
      recognizeButton.textContent = recognitionInProgress ? "認識中…" : "両モデルで認識する";
      setStatus(`モデル準備完了: ${ready.map((model) => modelDisplayName(model.name)).join(", ")}`);
      return;
    }

    modelsReady = false;
    recognizeButton.disabled = true;
    if (failed.length > 0) {
      recognizeButton.textContent = "モデルを読み込めません";
      const detail = failed.map((model) => `${modelDisplayName(model.name)}: ${model.detail}`).join(" / ");
      setStatus(`モデルの読み込みに失敗しました — ${detail}`, true);
      return;
    }

    const loadingName = loading.length > 0
      ? `${modelDisplayName(loading[0].name)}を読み込み中`
      : "モデルの読み込みを開始中";
    recognizeButton.textContent = `モデルを読み込み中… (${ready.length}/${models.length})`;
    setStatus(`${loadingName}です（準備完了 ${ready.length}/${models.length}）`);
    modelPollTimer = window.setTimeout(pollModelStatus, 1000);
  } catch (error) {
    modelsReady = false;
    recognizeButton.disabled = true;
    recognizeButton.textContent = "APIに接続できません";
    setStatus("APIへ接続できません", true);
  }
}

async function preloadModels() {
  recognizeButton.disabled = true;
  recognizeButton.textContent = "モデルを読み込み中… (0/2)";
  try {
    const response = await fetch("/models/preload", { method: "POST" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await pollModelStatus();
  } catch (error) {
    if (modelPollTimer !== null) window.clearTimeout(modelPollTimer);
    modelsReady = false;
    recognizeButton.disabled = true;
    recognizeButton.textContent = "モデルを読み込めません";
    setStatus(`モデルの読み込みを開始できませんでした: ${error.message}`, true);
  }
}

resetSurface();
preloadModels();
