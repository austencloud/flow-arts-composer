import { describe, expect, it } from "vitest";
import {
  comparisonChoices,
  comparisonVariants,
  comparisonPoint,
  comparisonFrame,
} from "../../../src/routes/(public)/guide/motion-paths/_data/motion-path-comparison";
import { motionPathExamples } from "../../../src/routes/(public)/guide/motion-paths/_data/motion-path-examples";
import { MotionType } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

describe("selected sequence route comparison", () => {
  it("shows the same endpoints and different intermediate routes without editing the source", () => {
    for (const source of motionPathExamples) {
      const before = JSON.stringify(source);
      const variants = comparisonVariants(source);
      for (const choice of comparisonChoices(source).filter(
        (item) => item.changes
      )) {
        const arc = variants.arc.steps[choice.index]!;
        const concave = variants.concave.steps[choice.index]!;
        for (const t of [0, 1]) {
          const a = comparisonPoint(arc, choice.hand, t)!;
          const b = comparisonPoint(concave, choice.hand, t)!;
          expect(a.x).toBeCloseTo(b.x, 8);
          expect(a.y).toBeCloseTo(b.y, 8);
        }
        expect(comparisonPoint(arc, choice.hand, 0.5)).not.toEqual(
          comparisonPoint(concave, choice.hand, 0.5)
        );
      }
      expect(JSON.stringify(source)).toBe(before);
    }
  });
  it("keeps dash and static routes identical and skips invisible hands", () => {
    const source = structuredClone(motionPathExamples[2]!);
    source.steps[0]!.motions.left.motionType = MotionType.STATIC;
    source.steps[0]!.motions.left.endLocation =
      source.steps[0]!.motions.left.startLocation;
    source.steps[1]!.motions.left.motionType = MotionType.DASH;
    source.steps[2]!.motions.right.isVisible = false;
    const choices = comparisonChoices(source);
    expect(choices.find((c) => c.key === "2:right")).toBeUndefined();
    expect(choices.find((c) => c.key === "0:left")!.changes).toBe(false);
    expect(choices.find((c) => c.key === "1:left")!.changes).toBe(false);
    const variants = comparisonVariants(source);
    for (const index of [0, 1])
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        expect(comparisonPoint(variants.arc.steps[index]!, "left", t)).toEqual(
          comparisonPoint(variants.concave.steps[index]!, "left", t)
        );
      }
  });
  it("frames the entire sampled routes with room for their endpoint labels", () => {
    for (const source of motionPathExamples) {
      const variants = comparisonVariants(source);
      for (const choice of comparisonChoices(source)) {
        const steps = [
          variants.arc.steps[choice.index]!,
          variants.concave.steps[choice.index]!,
        ];
        const [x, y, width, height] = comparisonFrame(steps, choice.hand)
          .split(" ")
          .map(Number) as [number, number, number, number];
        for (const step of steps)
          for (const t of [0, 0.25, 0.5, 0.75, 1]) {
            const point = comparisonPoint(step, choice.hand, t)!;
            expect(point.x).toBeGreaterThan(x + 20);
            expect(point.x).toBeLessThan(x + width - 20);
            expect(point.y).toBeGreaterThan(y + 20);
            expect(point.y).toBeLessThan(y + height - 20);
          }
      }
    }
  });
});
