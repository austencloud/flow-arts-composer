import { describe, expect, it } from "vitest";
import { getSequenceMotionProfile } from "$lib/shared/foundation/services/sequence-motion-profile";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  appendSoloContinuation,
  createSoloContinuationOptions,
  pairSoloReviewSequences,
} from "../../src/routes/test/construct-solo-handoff/construct-solo-proposal";
import { createConstructSoloReviewSequence } from "../../src/routes/test/construct-solo-handoff/construct-solo-review-fixture";

describe("Construct solo proposal", () => {
  const blue = createConstructSoloReviewSequence("left");
  const red = createConstructSoloReviewSequence("right");
  const pairedCatalog = pairSoloReviewSequences(blue, red).steps;

  it("builds real blue-only options that continue from the imported endpoint", () => {
    const options = createSoloContinuationOptions(
      [...pairedCatalog],
      blue,
      "left"
    );
    const option = options[0];
    const lastBlueMotion = blue.steps.at(-1)?.motions.left;

    expect(option).toBeDefined();
    expect(option?.motions.left.startLocation).toBe(
      lastBlueMotion?.endLocation
    );
    expect(isVisibleMotion(option?.motions.left)).toBe(true);
    expect(isVisibleMotion(option?.motions.right)).toBe(false);
  });

  it("appends a solo option without manufacturing a red motion", () => {
    const [option] = createSoloContinuationOptions(
      [...pairedCatalog],
      blue,
      "left"
    );
    const appended = appendSoloContinuation(blue, option!);

    expect(appended.steps).toHaveLength(9);
    expect(appended.steps.at(-1)?.stepNumber).toBe(9);
    expect(getSequenceMotionProfile(appended)).toMatchObject({
      kind: "solo",
      authoredHand: "left",
    });
  });

  it("introduces the second hand only after a red path is chosen", () => {
    const paired = pairSoloReviewSequences(blue, red);

    expect(paired.steps).toHaveLength(8);
    expect(getSequenceMotionProfile(paired).kind).toBe("paired");
    expect(isVisibleMotion(paired.startPlacement?.motions.left)).toBe(true);
    expect(isVisibleMotion(paired.startPlacement?.motions.right)).toBe(true);
  });
});
