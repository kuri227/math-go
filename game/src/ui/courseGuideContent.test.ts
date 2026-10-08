import { describe, expect, it } from "vitest";
import { courses } from "../domain/courses";
import { courseGuideContent } from "./courseGuideContent";

describe("courseGuideContent", () => {
  it.each(Object.values(courses))("matches $id configuration", (course) => {
    const content = courseGuideContent(course);
    expect(content.questionCount).toBe(`${course.questionCount}問`);
    expect(content.lives).toBe(`${course.initialLives}回`);
    expect(content.ending).toContain(`全${course.questionCount}問`);
    expect(content.ending).toContain("残機が0");
    expect(content.time).toBe(course.timeLimitSeconds === null ? "時間制限なし" : `1問${course.timeLimitSeconds}秒`);
  });
  it("only describes timeouts and enlargement in timed mode", () => {
    expect(courseGuideContent(courses.challenge).penalty).toContain("時間切れ");
    expect(courseGuideContent(courses.practice).penalty).not.toContain("時間切れ");
    expect(courseGuideContent(courses.marathon).timing).toContain("通常サイズ");
  });
});
