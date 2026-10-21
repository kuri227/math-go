function errorDetail(detail: unknown): string | null {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) return detail.map(item => typeof item?.msg === "string" ? item.msg : "入力内容を確認してください。").join(" / ");
  return null;
}

/** Every game API request is bounded, including response-body reads. */
export async function requestJson<T>(url: string, init: RequestInit = {}, timeoutMs = 10_000, timeoutMessage = "通信が時間内に完了しませんでした。接続を確認してもう一度お試しください。"): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, timeoutMs);
  init.signal?.addEventListener("abort", abort, { once: true });
  if (init.signal?.aborted) abort();
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body: unknown = await response.json().catch(error => {
      if (controller.signal.aborted) throw error;
      if (response.ok) throw new Error("サーバーから正しい応答を受け取れませんでした。");
      return null;
    });
    if (!response.ok) throw new Error(errorDetail((body as { detail?: unknown } | null)?.detail) ?? `HTTP ${response.status}`);
    return body as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(timeoutMessage);
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
  }
}
