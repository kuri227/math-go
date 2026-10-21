import { expect, it } from "vitest";
import { QuestionCatalog } from "./catalog";
import type { Question } from "../domain/types";

const questions = [{ id: "one", difficulty: 1, prompt: "りんごの問題", display: "1+2", category: "addition", review_status: "approved" },
  { id: "two", difficulty: 2, prompt: "x を求める", display: "x+1", category: "algebra", review_status: "pending" }] as Question[];
const catalog = new QuestionCatalog(questions);
it("searches the actual Japanese prompt, trims queries and ignores case", () => {
  expect(catalog.search(" りんご ", 1, false, false)).toEqual([questions[0]]);
  expect(catalog.search(" ADDITION ", 1, false, false)).toEqual([questions[0]]);
});
it("applies level and pending filters", () => {
  expect(catalog.search("", 1, false, true)).toEqual([]);
  expect(catalog.search("", 1, true, true)).toEqual([questions[1]]);
});
it("preserves selection order and ignores deleted IDs", () => {
  expect(catalog.selected(new Set(["two", "missing", "one"]))).toEqual([questions[1], questions[0]]);
});
