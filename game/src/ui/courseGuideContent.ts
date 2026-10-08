import type { CourseConfig } from "../domain/courses";

/** Derive rule copy from the same configuration used by the game. */
export function courseGuideContent(course: CourseConfig) {
  const timed = course.timeLimitSeconds !== null;
  return {
    name: course.name,
    description: course.intro,
    questionCount: `${course.questionCount}問`,
    time: timed ? `1問${course.timeLimitSeconds}秒` : "時間制限なし",
    lives: `${course.initialLives}回`,
    timing: timed
      ? "残り時間が少なくなると、問題が大きくなります。認識・判定中は時計が止まります。"
      : "問題は通常サイズのまま。時間を気にせず、じっくり考えられます。",
    ending: `全${course.questionCount}問を終えるか、残機が0になると終了します。`,
    penalty: timed
      ? "不正解のまま次へ進む・「わからない」を選ぶ・時間切れになると、残機が1減ります。"
      : "不正解のまま次へ進む・「わからない」を選ぶと、残機が1減ります。",
  };
}
