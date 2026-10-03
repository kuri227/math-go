interface Point {
  x: number;
  y: number;
  pressure: number;
  time: number;
  pointerType: string;
}

type Stroke = Point[];

export interface CroppedImage {
  blob: Blob;
  width: number;
  height: number;
}

const LINE_WIDTH = 5;
const CROP_PADDING = 24;

export class HandwritingPad {
  private readonly context: CanvasRenderingContext2D;
  private strokes: Stroke[] = [];
  private activeStroke: Stroke | null = null;
  private resizeObserver: ResizeObserver;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hint: HTMLElement,
    private readonly pointerPreview: HTMLElement,
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
    this.redraw();
  }

  undo(): void {
    this.strokes.pop();
    this.redraw();
  }

  setDisabled(disabled: boolean): void {
    this.canvas.toggleAttribute("data-disabled", disabled);
    this.canvas.style.pointerEvents = disabled ? "none" : "auto";
  }

  async toCroppedPng(): Promise<CroppedImage> {
    if (!this.hasInk) throw new Error("回答を入力してから提出してください");
    const points = this.strokes.flat();
    const minX = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x)) - CROP_PADDING));
    const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y)) - CROP_PADDING));
    const maxX = Math.min(this.cssWidth, Math.ceil(Math.max(...points.map((point) => point.x)) + CROP_PADDING));
    const maxY = Math.min(this.cssHeight, Math.ceil(Math.max(...points.map((point) => point.y)) + CROP_PADDING));
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
    return { blob, width, height };
  }

  private get cssWidth(): number {
    return this.canvas.clientWidth;
  }

  private get cssHeight(): number {
    return this.canvas.clientHeight;
  }

  private bindEvents(): void {
    this.canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      this.canvas.setPointerCapture(event.pointerId);
      this.activeStroke = [this.pointFromEvent(event)];
      this.hint.hidden = true;
      this.movePointerPreview(event);
    });
    this.canvas.addEventListener("pointermove", (event) => {
      this.movePointerPreview(event);
      if (!this.activeStroke) return;
      const point = this.pointFromEvent(event);
      const previous = this.activeStroke.at(-1)!;
      this.activeStroke.push(point);
      this.drawSegment(previous, point);
    });
    const finish = (event: PointerEvent) => {
      if (!this.activeStroke) return;
      if (this.activeStroke.length === 1) {
        this.activeStroke.push(this.pointFromEvent(event));
      }
      this.strokes.push(this.activeStroke);
      this.activeStroke = null;
      this.updateHint();
    };
    this.canvas.addEventListener("pointerup", finish);
    this.canvas.addEventListener("pointercancel", finish);
    this.canvas.addEventListener("pointerenter", (event) => {
      this.pointerPreview.hidden = false;
      this.movePointerPreview(event);
    });
    this.canvas.addEventListener("pointerleave", () => {
      this.pointerPreview.hidden = true;
    });
  }

  private pointFromEvent(event: PointerEvent): Point {
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

  private drawSegment(from: Point, to: Point): void {
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
      context.beginPath();
      context.moveTo(stroke[0]!.x + offsetX, stroke[0]!.y + offsetY);
      for (const point of stroke.slice(1)) {
        context.lineTo(point.x + offsetX, point.y + offsetY);
      }
      if (stroke.length === 1) {
        context.lineTo(stroke[0]!.x + offsetX + 0.01, stroke[0]!.y + offsetY + 0.01);
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
}

