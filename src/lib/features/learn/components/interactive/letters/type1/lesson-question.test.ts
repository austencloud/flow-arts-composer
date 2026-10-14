import { describe, expect, it } from "vitest";
import { lessonQuestion } from "./lesson-question";

describe("lessonQuestion", () => {
  const questions = [{ answer: "A" }, { answer: "B" }] as const;

  it("keeps valid saved progress on its question", () => {
    expect(lessonQuestion(questions, 1)).toBe(questions[1]);
  });

  it.each([-1, 2, 0.5, NaN, Infinity])(
    "opens the first question for invalid saved index %s",
    (index) => {
      expect(lessonQuestion(questions, index)).toBe(questions[0]);
    }
  );
});
