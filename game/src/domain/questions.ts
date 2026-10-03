import type { Question } from "./types";

export const questions: Question[] = [
  {
    id: "differentiate-quadratic",
    instruction: "次の式を微分しなさい",
    display: "f(x) = x² + 3x",
    category: "微分",
    difficulty: "基礎",
  },
  {
    id: "expand-binomial",
    instruction: "次の式を展開しなさい",
    display: "(x + 2)²",
    category: "展開",
    difficulty: "基礎",
  },
  {
    id: "solve-linear",
    instruction: "方程式を解きなさい",
    display: "2x + 6 = 0",
    category: "方程式",
    difficulty: "基礎",
  },
  {
    id: "evaluate-power",
    instruction: "計算しなさい",
    display: "2⁵",
    category: "指数",
    difficulty: "基礎",
  },
  {
    id: "evaluate-root",
    instruction: "計算しなさい",
    display: "√49",
    category: "平方根",
    difficulty: "基礎",
  },
  {
    id: "differentiate-sine",
    instruction: "次の式を微分しなさい",
    display: "f(x) = sin x",
    category: "微分",
    difficulty: "標準",
  },
  {
    id: "simplify-fraction",
    instruction: "式を簡単にしなさい",
    display: "6x ÷ 3",
    category: "式の計算",
    difficulty: "基礎",
  },
];

