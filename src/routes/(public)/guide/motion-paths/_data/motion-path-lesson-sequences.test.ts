import { describe, expect, it } from "vitest";
import { motionPathExamples } from "./motion-path-examples";
import {
  pathJoinExample,
  singleHandPathExample,
} from "./motion-path-lesson-sequences";

describe("motion path lesson sequences", () => {
  it("hides only the companion hand in the single-hand view", () => {
    const source = motionPathExamples[2]!;
    const lesson = singleHandPathExample("linear");

    expect(
      lesson.steps.every((step) => step.motions.right?.isVisible === false)
    ).toBe(true);
    expect(
      lesson.steps.every((step) => step.motions.left?.isVisible !== false)
    ).toBe(true);
    expect(
      source.steps.some((step) => step.motions.right?.isVisible === false)
    ).toBe(false);
  });

  it("derives Arc and Concave panes from the same frozen sequence", () => {
    const arc = pathJoinExample("arc");
    const concave = pathJoinExample("concave");

    expect(arc.steps.map((step) => step.motions.left?.pathShape)).toContain(
      "arc"
    );
    expect(concave.steps.map((step) => step.motions.left?.pathShape)).toContain(
      "concave"
    );
    expect(arc.steps.length).toBe(concave.steps.length);
  });
});
