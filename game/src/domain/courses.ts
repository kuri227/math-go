import { CHALLENGE_SECONDS } from "./timing";

export type CourseId = "practice" | "challenge" | "marathon";

export interface CourseConfig {
  id: CourseId;
  name: string;
  intro: string;
  questionCount: number;
  timeLimitSeconds: number | null;
  initialLives: number;
}

export const courses: Record<CourseId, CourseConfig> = {
  practice: {
    id: "practice",
    name: "じっくり練習",
    intro: "時間を気にせず、答えを書く感触を確かめよう",
    questionCount: 5,
    timeLimitSeconds: null,
    initialLives: 3,
  },
  challenge: {
    id: "challenge",
    name: `${CHALLENGE_SECONDS}秒チャレンジ`,
    intro: `1問${CHALLENGE_SECONDS}秒。テンポよく全問突破しよう`,
    questionCount: 7,
    timeLimitSeconds: CHALLENGE_SECONDS,
    initialLives: 3,
  },
  marathon: {
    id: "marathon",
    name: "30問マラソン",
    intro: "30問をじっくり走り切ろう",
    questionCount: 30,
    timeLimitSeconds: null,
    initialLives: 5,
  },
};
