/**
 * The LOOP preview's baked steps are really a LOOP: the second row is the
 * first one turned a quarter clockwise, and each step picks up where the one
 * before it left the hands.
 */
import { describe, expect, it } from "vitest";
import { LOOP_PART_STEPS } from "#lib/features/create/shared/components/method-previews/method-preview-compositions.js";
import {
  LOOP_PREVIEW_STEPS,
  loopPoseBefore,
} from "#lib/features/create/shared/components/method-previews/method-preview-loop.js";

const QUARTER: Record<string, string> = { n: "e", e: "s", s: "w", w: "n" };

describe("the LOOP preview", () => {
  it("repeats your steps a quarter turn round", () => {
    expect(LOOP_PREVIEW_STEPS).toHaveLength(2 * LOOP_PART_STEPS);
    for (let index = 0; index < LOOP_PART_STEPS; index += 1) {
      for (const hand of ["left", "right"] as const) {
        const yours = LOOP_PREVIEW_STEPS[index]!.motions[hand]!;
        const copy =
          LOOP_PREVIEW_STEPS[index + LOOP_PART_STEPS]!.motions[hand]!;
        expect(copy.motionType).toBe(yours.motionType);
        expect(copy.startLocation).toBe(QUARTER[yours.startLocation]);
        expect(copy.endLocation).toBe(QUARTER[yours.endLocation]);
      }
    }
  });

  it("starts every step where the one before it ended", () => {
    for (const [index, step] of LOOP_PREVIEW_STEPS.entries()) {
      const before = loopPoseBefore(index);
      for (const hand of ["left", "right"] as const) {
        expect(step.motions[hand]!.startLocation).toBe(
          before.motions[hand]!.endLocation
        );
      }
    }
  });
});
