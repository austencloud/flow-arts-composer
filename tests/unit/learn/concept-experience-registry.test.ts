import { describe, expect, it } from "vitest";
import {
  CONCEPT_EXPERIENCES,
  getAvailableConcepts,
  getConceptExperience,
  getConceptExperienceForGuideSlug,
  isConceptExperienceAvailable,
} from "../../../src/lib/features/learn/domain/concept-experience-registry";
import { TKA_CONCEPTS } from "../../../src/lib/features/learn/domain/concepts";
import { GUIDE_BODY_PAGES } from "../../../src/routes/(public)/guide/level-1/_data/guide-manifest";

const expectedPublishedIds = [
  "grid",
  "hand-positions",
  "hand-motions-intro",
  "timing-and-direction",
  "reading-choreo-cards",
  "rotation-direction",
  "dual-shifts-alpha-beta",
  "gamma-motion",
  "staff-positions",
  "letter-codex-intro",
  "type1-abc-ghi",
  "words-alpha-beta",
];

describe("concept experience registry", () => {
  it("lists only lessons that have a real published experience", () => {
    expect(getAvailableConcepts().map((concept) => concept.id)).toEqual(
      expectedPublishedIds
    );
    expect(CONCEPT_EXPERIENCES.map((entry) => entry.conceptId)).toEqual(
      expectedPublishedIds
    );
  });

  it("maps every experience to one curriculum concept and one Guide topic", () => {
    const curriculumIds = new Set(TKA_CONCEPTS.map((concept) => concept.id));
    const guideSlugs = new Set(GUIDE_BODY_PAGES.map((page) => page.id));
    const experienceIds = CONCEPT_EXPERIENCES.map((entry) => entry.conceptId);
    const experienceSlugs = CONCEPT_EXPERIENCES.map((entry) => entry.guideSlug);

    expect(new Set(experienceIds).size).toBe(experienceIds.length);
    expect(experienceIds.every((id) => curriculumIds.has(id))).toBe(true);
    expect(experienceSlugs.every((slug) => guideSlugs.has(slug))).toBe(true);
    expect(
      CONCEPT_EXPERIENCES.every((entry) => typeof entry.load === "function")
    ).toBe(true);
  });

  it("keeps the hand-motions curriculum id aligned with its existing experience", () => {
    const handMotions = getConceptExperience("hand-motions-intro");

    expect(handMotions?.guideSlug).toBe("hand-motions");
    expect(getConceptExperienceForGuideSlug("hand-motions")).toBe(handMotions);
    expect(isConceptExperienceAvailable("hand-motions")).toBe(false);
  });

  it("publishes rotation direction as its own focused lesson", () => {
    const rotationDirection = getConceptExperience("rotation-direction");

    expect(rotationDirection?.guideSlug).toBe("staff-motions");
    expect(rotationDirection?.reviewStatus).toBe("built");
    expect(isConceptExperienceAvailable("rotation-direction")).toBe(true);
  });

  it("shares the written reference without displacing the full hand-motions lesson", () => {
    expect(getConceptExperience("timing-and-direction")?.guideSlug).toBe(
      "hand-motions"
    );
    expect(getConceptExperienceForGuideSlug("hand-motions")?.conceptId).toBe(
      "hand-motions-intro"
    );
  });

  it("opens the dedicated timing reference while retaining the Guide association", () => {
    expect(getConceptExperience("timing-and-direction")?.reference).toEqual({
      href: "/timing-and-direction",
      label: "Timing and Direction",
    });
    expect(
      getConceptExperience("hand-motions-intro")?.reference
    ).toBeUndefined();
  });
});
