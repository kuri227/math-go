import type { SetupView } from "../dual-screen/messages";
import { DIFFICULTY_LABELS } from "./catalog";
import { questionSeconds } from "./Session";

export type DisplaySetupPresentation = {
  title: string;
  lead: string;
  difficulty: number;
  difficultyName: string;
  showRules: boolean;
  showDifficulty: boolean;
  showActions: boolean;
};

/** Converts controller setup state into stable, monitor-friendly copy. */
export function displaySetupPresentation(
  connected: boolean,
  setup: { view: SetupView; difficulty: number },
): DisplaySetupPresentation {
  const difficulty = Math.min(7, Math.max(1, Math.trunc(setup.difficulty)));
  const shared = {
    difficulty,
    difficultyName: DIFFICULTY_LABELS[difficulty - 1] ?? "",
    showRules: setup.view === "rules",
    showDifficulty: setup.view === "difficulty",
    showActions: !connected,
  };

  if (!connected) return {
    ...shared,
    title: "モニター画面の準備完了",
    lead: "次に液タブ用の操作画面を開き、液タブへ移動してください。",
    showRules: false,
    showDifficulty: false,
  };

  const copy: Record<SetupView, Pick<DisplaySetupPresentation, "title" | "lead">> = {
    home: {
      title: "数学でGO",
      lead: "液タブでゲームを始める準備をしています。",
    },
    rules: {
      title: "あそびかた",
      lead: "液タブと一緒に、ゲームの流れを確認しています。",
    },
    difficulty: {
      title: "難易度を選択中",
      lead: `LEVEL ${difficulty}は1問${questionSeconds({ difficulty })}秒。液タブで挑戦するレベルを選んでいます。`,
    },
    staff: {
      title: "問題を選択中",
      lead: "スタッフがテストする問題を液タブで選んでいます。",
    },
  };
  return { ...shared, ...copy[setup.view] };
}
