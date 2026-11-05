const TECHNICAL_ERROR = /\b(?:http|json|fetch|network|status|error|failed|timeout|websocket|latex)\b|TexTeller|認識モデル/i;
const RECOGNITION_ERROR = /TexTeller|認識モデル|recognition|inference|model/i;
const CONNECTION_ERROR = /\b(?:fetch|network|websocket|http)\b|通信|接続/i;

/** Keeps implementation details out of the visitor UI while preserving useful Japanese guidance. */
export function visitorErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (RECOGNITION_ERROR.test(message)) {
    return "手書きの読み取りを準備できませんでした。スタッフへお知らせください。";
  }
  if (CONNECTION_ERROR.test(message)) {
    return "ゲームとの通信に失敗しました。もう一度お試しください。続く場合はスタッフへお知らせください。";
  }
  if (message && !TECHNICAL_ERROR.test(message)) return message;
  return "処理を完了できませんでした。もう一度お試しください。続く場合はスタッフへお知らせください。";
}
