import { isPointStroke } from "./strokeGeometry";

export interface InkPoint {
  x: number;
  y: number;
  pressure: number;
  time: number;
  pointerType: string;
}

type Stroke = InkPoint[];

export interface InkSnapshot {
  version: 1;
  revision: number;
  aspectRatio: number;
  strokes: Array<Array<Pick<InkPoint, "x" | "y" | "pressure">>>;
}

export interface CroppedImage {
  blob: Blob;
  width: number;
  height: number;
  crop: { x: number; y: number; width: number; height: number };
}

const LINE_WIDTH = 5;
const CROP_PADDING = 24;

export class HandwritingPad {
  private readonly context: CanvasRenderingContext2D;
  private strokes: Stroke[] = [];
  private activeStroke: Stroke | null = null;
  private resizeObserver: ResizeObserver;
  private disabled = false;
  private pointerId: number | null = null;
  private logicalWidth = 0;
  private logicalHeight = 0;
  private revision = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hint: HTMLElement,
    private readonly pointerPreview: HTMLElement,
    private readonly onInkChange?: (snapshot: InkSnapshot) => void,
  ) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D context is unavailable");
    this.context = context;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.bindEvents();
    this.resize();
  }

  get hasInk(): boolean {
    return this.strokes.length > 0 || Boolean(this.activeStroke?.length);
  }

  clear(): void {
    this.strokes = [];
    this.activeStroke = null;
    this.pointerId = null;
    this.redraw();
    this.changed();
  }

  undo(): void {
    this.strokes.pop();
    this.redraw();
    this.changed();
  }

  exportInkSnapshot(): InkSnapshot {
    const width = Math.max(1, this.logicalWidth || this.cssWidth);
    const height = Math.max(1, this.logicalHeight || this.cssHeight);
    const strokes = [...this.strokes, ...(this.activeStroke ? [this.activeStroke] : [])];
    return {
      version: 1,
      revision: this.revision,
      aspectRatio: width / height,
      strokes: strokes.map(stroke => stroke.map(point => ({
        x: Math.min(1, Math.max(0, point.x / width)),
        y: Math.min(1, Math.max(0, point.y / height)),
        pressure: Math.min(1, Math.max(0, point.pressure)),
      }))),
    };
  }

  importInkSnapshot(snapshot: InkSnapshot): void {
    if (snapshot.version !== 1 || snapshot.revision < this.revision) return;
    const width = Math.max(1, this.cssWidth);
    const height = Math.max(1, this.cssHeight);
    const sourceWidth = Math.max(0.01, snapshot.aspectRatio);
    const scale = Math.min(width / sourceWidth, height);
    const offsetX = (width - sourceWidth * scale) / 2;
    const offsetY = (height - scale) / 2;
    this.revision = snapshot.revision;
    this.logicalWidth = width;
    this.logicalHeight = height;
    this.activeStroke = null;
    this.pointerId = null;
    this.strokes = snapshot.strokes.map(stroke => stroke.map(point => ({
      x: offsetX + point.x * sourceWidth * scale,
      y: offsetY + point.y * scale,
      pressure: point.pressure,
      time: 0,
      pointerType: "remote",
    })));
    this.redraw();
  }

  setDisabled(disabled: boolean): void {
    this.disabled = disabled;
    if (disabled && this.activeStroke) {
      this.strokes.push(this.activeStroke);
      this.activeStroke = null;
      this.pointerId = null;
      this.redraw();
      this.changed();
    }
    this.canvas.toggleAttribute("data-disabled", disabled);
    this.canvas.style.pointerEvents = disabled ? "none" : "auto";
  }

  async toCroppedPng(): Promise<CroppedImage> {
    if (!this.hasInk) throw new Error("回答を入力してから提出してください");
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const stroke of this.strokes) for (const point of stroke) {
      left = Math.min(left, point.x); top = Math.min(top, point.y);
      right = Math.max(right, point.x); bottom = Math.max(bottom, point.y);
    }
    const minX = Math.max(0, Math.floor(left - CROP_PADDING));
    const minY = Math.max(0, Math.floor(top - CROP_PADDING));
    const maxX = Math.min(this.cssWidth, Math.ceil(right + CROP_PADDING));
    const maxY = Math.min(this.cssHeight, Math.ceil(bottom + CROP_PADDING));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);

    const output = document.createElement("canvas");
    output.width = width;
    output.height = height;
    const context = output.getContext("2d");
    if (!context) throw new Error("画像を作成できませんでした");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    this.drawStrokes(context, this.strokes, -minX, -minY, 1);

    const blob = await new Promise<Blob>((resolve, reject) => {
      output.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("PNGの生成に失敗しました"));
      }, "image/png");
    });
    return { blob, width, height, crop: { x: minX, y: minY, width, height } };
  }

  exportStrokes(crop: CroppedImage["crop"]): object {
    return {
      schema_version: 1,
      canvas: { width: this.cssWidth, height: this.cssHeight },
      crop, line_width: LINE_WIDTH,
      coordinates: "canvas_css_pixels; subtract crop.x/y for saved PNG coordinates",
      pointer_types: [...new Set(this.strokes.flat().map(p => p.pointerType))],
      strokes: this.strokes.map(points => ({ pointerType: points[0]?.pointerType ?? "unknown", points: points.map(p => ({ ...p })) })),
    };
  }

  private get cssWidth(): number {
    return this.canvas.clientWidth;
  }

  private get cssHeight(): number {
    return this.canvas.clientHeight;
  }

  private bindEvents(): void {
    this.canvas.addEventListener("pointerdown", (event) => {
      if (this.disabled || event.button !== 0 || this.activeStroke) return;
      this.pointerId = event.pointerId;
      this.canvas.setPointerCapture(event.pointerId);
      this.activeStroke = [this.pointFromEvent(event)];
      this.hint.hidden = true;
      this.movePointerPreview(event);
      this.changed(false);
    });
    this.canvas.addEventListener("pointermove", (event) => {
      this.movePointerPreview(event);
      if (!this.activeStroke || event.pointerId !== this.pointerId) return;
      const point = this.pointFromEvent(event);
      const previous = this.activeStroke.at(-1)!;
      this.activeStroke.push(point);
      this.drawSegment(previous, point);
      this.changed(false);
    });
    const finish = (event: PointerEvent) => {
      if (!this.activeStroke || event.pointerId !== this.pointerId) return;
      if (this.activeStroke.length === 1) {
        this.activeStroke.push(this.pointFromEvent(event));
      }
      this.strokes.push(this.activeStroke);
      this.activeStroke = null;
      this.pointerId = null;
      this.redraw();
      this.changed();
    };
    this.canvas.addEventListener("pointerup", finish);
    this.canvas.addEventListener("pointercancel", finish);
    this.canvas.addEventListener("lostpointercapture", finish);
    this.canvas.addEventListener("pointerenter", (event) => {
      this.pointerPreview.hidden = false;
      this.movePointerPreview(event);
    });
    this.canvas.addEventListener("pointerleave", () => {
      this.pointerPreview.hidden = true;
    });
  }

  private pointFromEvent(event: PointerEvent): InkPoint {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      pressure: event.pressure || (event.pointerType === "mouse" ? 0.5 : 0),
      time: event.timeStamp,
      pointerType: event.pointerType,
    };
  }

  private movePointerPreview(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerPreview.style.transform = `translate(${event.clientX - rect.left}px, ${event.clientY - rect.top}px)`;
  }

  private resize(): void {
    const width = Math.max(1, this.cssWidth);
    const height = Math.max(1, this.cssHeight);
    if (this.logicalWidth > 1 && this.logicalHeight > 1 && width > 1 && height > 1) {
      const scale = Math.min(width / this.logicalWidth, height / this.logicalHeight);
      const offsetX = (width - this.logicalWidth * scale) / 2;
      const offsetY = (height - this.logicalHeight * scale) / 2;
      for (const stroke of [...this.strokes, ...(this.activeStroke ? [this.activeStroke] : [])]) {
        for (const point of stroke) {
          point.x = offsetX + point.x * scale;
          point.y = offsetY + point.y * scale;
        }
      }
    }
    if (width > 1 && height > 1) {
      this.logicalWidth = width;
      this.logicalHeight = height;
    }
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const nextWidth = Math.round(width * ratio);
    const nextHeight = Math.round(height * ratio);
    if (this.canvas.width === nextWidth && this.canvas.height === nextHeight) return;
    this.canvas.width = nextWidth;
    this.canvas.height = nextHeight;
    this.redraw();
  }

  private redraw(): void {
    const ratio = this.canvas.width / Math.max(1, this.cssWidth);
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.fillStyle = "#ffffff";
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawStrokes(this.context, this.strokes, 0, 0, ratio);
    this.updateHint();
  }

  private drawSegment(from: InkPoint, to: InkPoint): void {
    const ratio = this.canvas.width / Math.max(1, this.cssWidth);
    this.context.save();
    this.context.scale(ratio, ratio);
    this.configureLine(this.context);
    this.context.beginPath();
    this.context.moveTo(from.x, from.y);
    this.context.lineTo(to.x, to.y);
    this.context.stroke();
    this.context.restore();
  }

  private drawStrokes(
    context: CanvasRenderingContext2D,
    strokes: readonly Stroke[],
    offsetX: number,
    offsetY: number,
    scale: number,
  ): void {
    context.save();
    context.scale(scale, scale);
    this.configureLine(context);
    for (const stroke of strokes) {
      if (stroke.length === 0) continue;
      if (isPointStroke(stroke)) {
        context.beginPath();
        context.fillStyle = "#10182d";
        context.arc(stroke[0]!.x + offsetX, stroke[0]!.y + offsetY, LINE_WIDTH / 2, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      context.beginPath();
      context.moveTo(stroke[0]!.x + offsetX, stroke[0]!.y + offsetY);
      for (const point of stroke.slice(1)) {
        context.lineTo(point.x + offsetX, point.y + offsetY);
      }
      context.stroke();
    }
    context.restore();
  }

  private configureLine(context: CanvasRenderingContext2D): void {
    context.strokeStyle = "#10182d";
    context.lineWidth = LINE_WIDTH;
    context.lineCap = "round";
    context.lineJoin = "round";
  }

  private updateHint(): void {
    this.hint.hidden = this.hasInk;
  }

  private changed(increment = true): void {
    if (increment) this.revision++;
    this.onInkChange?.(this.exportInkSnapshot());
  }
}

