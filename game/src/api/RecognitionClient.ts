import type { JudgementResponse, Question, RecognitionResponse } from "../domain/types";

interface ReadyResponse {
  status: "ready" | "loading" | "unavailable";
  model: string;
  detail?: string | null;
}

export class RecognitionClient {
  constructor(
    private readonly baseUrl = "/api/v1",
    private readonly model = "texteller",
  ) {}

  async beginPreload(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/models/${this.model}/preload`, {
      method: "POST",
    });
    if (!response.ok) throw new Error(await this.readError(response));
  }

  async waitUntilReady(
    onStatus: (status: ReadyResponse) => void,
    timeoutMs = 180_000,
  ): Promise<void> {
    const started = performance.now();
    while (performance.now() - started < timeoutMs) {
      const response = await fetch(
        `${this.baseUrl}/health/ready?model=${encodeURIComponent(this.model)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(await this.readError(response));
      const status = (await response.json()) as ReadyResponse;
      onStatus(status);
      if (status.status === "ready") return;
      if (status.status === "unavailable" && status.detail) {
        throw new Error(status.detail);
      }
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }
    throw new Error("モデルの準備が3分以内に完了しませんでした");
  }

  async recognize(image: Blob): Promise<RecognitionResponse> {
    const form = new FormData();
    form.append("image", image, "answer.png");
    form.append("model", this.model);
    form.append("request_id", crypto.randomUUID());

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(`${this.baseUrl}/recognitions`, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await this.readError(response));
      return (await response.json()) as RecognitionResponse;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("認識が30秒以内に完了しませんでした。もう一度お試しください。");
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async fetchQuestions(): Promise<Question[]> {
    const response = await fetch(`${this.baseUrl}/questions`, { cache: "no-store" });
    if (!response.ok) throw new Error(await this.readError(response));
    return (await response.json()) as Question[];
  }

  async judge(questionId: string, recognizedLatex: string): Promise<JudgementResponse> {
    const response = await fetch(`${this.baseUrl}/judgements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question_id: questionId,
        recognized_latex: recognizedLatex,
      }),
    });
    if (!response.ok) throw new Error(await this.readError(response));
    return (await response.json()) as JudgementResponse;
  }

  private async readError(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as { detail?: string };
      return body.detail ?? `HTTP ${response.status}`;
    } catch {
      return `HTTP ${response.status}`;
    }
  }
}

