export interface DifficultyConfig {
  id: number;
  label: string;
  audience: string;
  description: string;
}

export const difficulties: readonly DifficultyConfig[] = [
  { id: 1, label: "小学校低学年", audience: "LEVEL 1", description: "たし算・ひき算・九九からスタート" },
  { id: 2, label: "小学校高学年", audience: "LEVEL 2", description: "分数・小数・割合を正確に" },
  { id: 3, label: "中学校", audience: "LEVEL 3", description: "方程式・展開・平方根に挑戦" },
  { id: 4, label: "高校", audience: "LEVEL 4", description: "微分・積分・三角関数へ" },
  { id: 5, label: "高専", audience: "LEVEL 5", description: "複素数・行列・ベクトル" },
  { id: 6, label: "大学", audience: "LEVEL 6", description: "偏微分・定積分・極限" },
  { id: 7, label: "大学院", audience: "LEVEL 7", description: "解析と変換の発展問題" },
] as const;

export function difficultyById(id: number): DifficultyConfig {
  return difficulties.find((difficulty) => difficulty.id === id) ?? difficulties[0]!;
}
