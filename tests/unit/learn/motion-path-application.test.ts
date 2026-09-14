import { describe, expect, it } from "vitest";
import { motionPathExamples } from "../../../src/routes/(public)/guide/motion-paths/_data/motion-path-examples";
import { createMotionPathApplication } from "../../../src/routes/(public)/guide/motion-paths/_data/motion-path-application.svelte";

describe("motion path application example", () => {
  it("changes only the selected step without mutating its source", () => {
    const source = motionPathExamples[2]!;
    const before = JSON.stringify(source);
    const lesson = createMotionPathApplication(source);
    const baseline = lesson.sequence;
    lesson.apply({ pathShape: "concave", motionAwarePaths: false }, 1);
    expect(lesson.sequence.steps[0]).toBe(baseline.steps[0]);
    expect(lesson.sequence.steps[0]!.motions.left.pathShape).toBe("arc");
    expect(lesson.sequence.steps[1]!.motions.left.pathShape).toBe("concave");
    expect(lesson.sequence.steps[2]).toBe(baseline.steps[2]);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("restores the saved example and resets without touching another lesson", () => {
    const source = motionPathExamples[2]!;
    const first = createMotionPathApplication(source);
    const second = createMotionPathApplication(source);
    first.apply({ pathShape: "linear", motionAwarePaths: false });
    first.save();
    expect(first.changed).toBe(false);
    first.apply({ pathShape: "concave", motionAwarePaths: false }, 0);
    expect(first.changed).toBe(true);
    first.restore();
    expect(
      first.sequence.steps.every(
        (step) => step.motions.left.pathShape === "linear"
      )
    ).toBe(true);
    expect(
      second.sequence.steps.every(
        (step) => step.motions.left.pathShape === "arc"
      )
    ).toBe(true);
    first.reset();
    expect(first.sequence.steps).toEqual(second.sequence.steps);
  });
});
