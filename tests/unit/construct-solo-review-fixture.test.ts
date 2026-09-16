import { describe, expect, it } from "vitest";
import { getSequenceMotionProfile } from "$lib/shared/foundation/services/sequence-motion-profile";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  createConstructRedPartnerReviewSequence,
  createConstructSoloReviewSequence,
} from "../../src/routes/test/construct-solo-handoff/construct-solo-review-fixture";

describe("Construct solo review fixture", () => {
  it.each(["left", "right"] as const)(
    "keeps the %s hand as the only authored motion",
    (authoredHand) => {
      const sequence = createConstructSoloReviewSequence(authoredHand);

      expect(sequence.steps).toHaveLength(8);
      expect(getSequenceMotionProfile(sequence)).toMatchObject({
        kind: "solo",
        authoredHand,
        hand: authoredHand,
      });
      expect(sequence.metadata).toMatchObject({
        artifactKind: "solo-prop",
        authoredHand,
      });
    }
  );

  it("gives the red pairing choice a visibly distinct counterpath", () => {
    const blue = createConstructSoloReviewSequence("left");
    const red = createConstructRedPartnerReviewSequence();

    expect(blue.startPlacement?.motions.left?.startLocation).toBe(
      GridLocation.NORTHWEST
    );
    expect(red.startPlacement?.motions.right?.startLocation).toBe(
      GridLocation.SOUTHEAST
    );
    expect(red.name).toBe("Counterpoint box orbit");
  });
});
