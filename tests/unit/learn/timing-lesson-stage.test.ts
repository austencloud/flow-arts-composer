import { describe, expect, it } from "vitest";
import { migrateTimingLessonSavedStep } from "../../../src/lib/features/learn/components/interactive/motions/timing-lesson-stage";

describe("timing lesson progress migration", () => {
  it("starts new learners at placement", () => {
    expect(migrateTimingLessonSavedStep(0, 1, 3)).toBe(4);
  });
  it("keeps the old introduction at placement and the old review at review", () => {
    expect(migrateTimingLessonSavedStep(4, 1, 3)).toBe(4);
    expect(migrateTimingLessonSavedStep(5, 1, 3)).toBe(7);
  });
  it("restores each new step without migrating it again", () => {
    for (const step of [4, 5, 6, 7])
      expect(migrateTimingLessonSavedStep(step, 2, 3)).toBe(step);
  });
  it("bounds invalid saved progress", () => {
    expect(migrateTimingLessonSavedStep(NaN, 2, 3)).toBe(4);
    expect(migrateTimingLessonSavedStep(-9, 2, 3)).toBe(4);
    expect(migrateTimingLessonSavedStep(100, 2, 3)).toBe(7);
  });
});
