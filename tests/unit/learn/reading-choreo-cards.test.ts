import { describe, expect, it } from "vitest";
import { HAND_PATH_REFERENCE_SCAN_URLS } from "../../../src/lib/features/choreo-card/domain/hand-path-reference-card-manifest";
import { getHandPathReferenceCards } from "../../../src/lib/features/choreo-card/domain/hand-path-reference-cards";
import {
  getConceptExperience,
  isConceptExperienceAvailable,
} from "../../../src/lib/features/learn/domain/concept-experience-registry";
import {
  getConceptById,
  getNextConcept,
} from "../../../src/lib/features/learn/domain/concepts";

describe("Reading a Choreo Card lesson", () => {
  it("sits immediately after timing and direction with its prerequisite", () => {
    const timing = getConceptById("timing-and-direction");
    const cards = getConceptById("reading-choreo-cards");

    expect(cards?.prerequisites).toEqual(["timing-and-direction"]);
    expect(getNextConcept(timing!.id)?.id).toBe(cards?.id);
    expect(isConceptExperienceAvailable(cards!.id)).toBe(true);
    expect(getConceptExperience(cards!.id)?.reviewStatus).toBe("built");
  });

  it("uses an existing hand-path card and its published scan URL", () => {
    const [card] = getHandPathReferenceCards(["ss"]);

    expect(card?.sequence.metadata?.isHandPathVisualization).toBe(true);
    expect(card?.sequence.steps).toHaveLength(4);
    expect(HAND_PATH_REFERENCE_SCAN_URLS[card!.id]).toMatch(
      /^https:\/\/tka\.run\//
    );
  });
});
