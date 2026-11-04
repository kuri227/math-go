import type { Mode } from "./Session";
import type { Role } from "./view";

export type ResourceState = "pending" | "ready" | "error" | "skipped";

export type SetupAvailability = { ready: boolean; message: string };

export const requiresRecognitionModel = (role: Role): boolean => role !== "display";

export function setupAvailability(input: {
  questions: ResourceState;
  recognition: ResourceState;
  connected: boolean;
  mode: Mode;
  selectedCount: number;
  eligibleCount: number;
  requiredQuestions: number;
}): SetupAvailability {
  if (input.questions === "error") return { ready: false, message: "問題を取得できませんでした。ページを更新してください。" };
  if (input.questions !== "ready") return { ready: false, message: "問題を準備しています。少しお待ちください。" };
  if (input.recognition === "error") return { ready: false, message: "認識モデルを準備できませんでした。スタッフへお知らせください。" };
  if (input.recognition === "pending") return { ready: false, message: "認識モデルを準備しています。少しお待ちください。" };
  if (!input.connected) return { ready: false, message: "モニター画面との接続を待っています。" };
  if (input.mode === "test" && input.selectedCount === 0) return { ready: false, message: "テストする問題にチェックを入れてください。" };
  if (input.mode === "exhibition" && input.eligibleCount < input.requiredQuestions) {
    return { ready: false, message: `この難易度の本番用問題を${input.requiredQuestions}問準備してください。` };
  }
  return { ready: true, message: "準備OK！" };
}

export function resourceStatusCopy(input: {
  role: Role;
  questions: ResourceState;
  recognition: ResourceState;
  connected: boolean;
  remoteRecognitionReady: boolean;
}): string {
  if (input.questions === "error") return "問題を取得できません";
  if (input.questions !== "ready") return "問題を準備中";
  if (input.role === "display") {
    if (!input.connected) return "表示準備OK";
    return input.remoteRecognitionReady ? "準備OK" : "液タブで認識準備中";
  }
  if (input.recognition === "error") return "認識準備に失敗";
  if (input.recognition !== "ready") return "認識モデルを準備中";
  return "準備OK";
}
