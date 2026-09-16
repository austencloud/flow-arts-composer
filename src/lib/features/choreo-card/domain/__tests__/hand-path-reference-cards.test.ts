import { describe, expect, it } from "vitest";
import {
  HAND_PATH_REFERENCE_CARDS,
  HAND_PATH_REFERENCE_CARD_IDS,
  getHandPathReferenceCards,
} from "../hand-path-reference-cards";

describe("hand-path reference cards", () => {
  it("defines one four-beat card for every timing and direction relationship", () => {
    expect(HAND_PATH_REFERENCE_CARDS).toHaveLength(6);
    expect(new Set(HAND_PATH_REFERENCE_CARD_IDS).size).toBe(6);
    expect(
      HAND_PATH_REFERENCE_CARDS.every(
        (referenceCard) =>
          referenceCard.sequence.steps.length === 4 &&
          referenceCard.sequence.startPlacement != null
      )
    ).toBe(true);
  });

  it("resolves a manifest selection in its frozen print order", () => {
    expect(
      getHandPathReferenceCards(["to", "ss"]).map((card) => card.id)
    ).toEqual(["to", "ss"]);
  });
});
