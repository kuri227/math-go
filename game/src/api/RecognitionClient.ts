import type { JudgementResponse, Question, RecognitionResponse, SolutionResponse } from "../domain/types";
import { requestJson } from "./http";

interface ReadyResponse {
  status: "ready" | "loading" | "unavailable";
  model: string;
  detail?: string | null;
}

export class RecognitionClient {
  constructor(private readonly baseUrl = "/api/v1", private readonly model = "texteller") {}
  async beginPreload(): Promise<void> {
    await requestJson(`${this.baseUrl}/models/${this.model}/preload`, { method: "POST" });
  }
  async waitUntilReady(onStatus: (status: ReadyResponse) => void, timeoutMs = 180_000): Promise<void> {
    const started = performance.now();
    while (performance.now() - started < timeoutMs) {
      const status = await requestJson<ReadyResponse>(`${this.baseUrl}/health/ready?model=${encodeURIComponent(this.model)}`, { cache: "no-store" }, Math.min(10_000, Math.max(1, timeoutMs - (performance.now() - started))));
      onStatus(status);
      if (status.status === "ready") return;
      if (status.status === "unavailable" && status.detail) throw new Error(status.detail);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error("モデルの準備が3分以内に完了しませんでした");
  }
  async recognize(image: Blob, requestId: string = crypto.randomUUID()): Promise<RecognitionResponse> {
    const form = new FormData();
    form.append("image", image, "answer.png"); form.append("model", this.model); form.append("request_id", requestId);
    return requestJson(`${this.baseUrl}/recognitions`, { method: "POST", body: form }, 30_000,
      "認識が30秒以内に完了しませんでした。もう一度お試しください。");
  }
  fetchQuestions(): Promise<Question[]> {
    return requestJson(`${this.baseUrl}/questions`, { cache: "no-store" });
  }
  judge(questionId: string, recognizedLatex: string): Promise<JudgementResponse> {
    return requestJson(`${this.baseUrl}/judgements`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question_id: questionId, recognized_latex: recognizedLatex }) });
  }
  fetchSolution(questionId: string): Promise<SolutionResponse> {
    return requestJson(`${this.baseUrl}/solutions/${encodeURIComponent(questionId)}`, { cache: "no-store" });
  }
  saveSample(form: FormData): Promise<{ sample_id: string }> {
    return requestJson(`${this.baseUrl}/test-samples`, { method: "POST", body: form }, 15_000,
      "保存の応答を確認できませんでした。同じデータでもう一度保存を押してください。重複保存は防止されます。");
  }
  reviewQuestion(questionId: string, status: string, enabled: boolean): Promise<Question> {
    return requestJson(`${this.baseUrl}/admin/questions/${encodeURIComponent(questionId)}/review`, { method: "PATCH",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ review_status: status, exhibition_enabled: enabled }) });
  }
}
