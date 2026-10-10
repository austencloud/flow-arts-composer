import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
  "hand-placements",
  "hand-motions-intro",
  "timing-and-direction",
  "reading-choreo-cards",
  "rotation-direction",
  "dual-shifts-alpha-beta",
  "gamma-motion",
  "staff-placements",
  "letter-codex-intro",
  "type1-abc-ghi",
  "words-alpha-beta",
];

const learnDomainDir = resolve(process.cwd(), "src/lib/features/learn/domain");
const registrySource = readFileSync(
  resolve(learnDomainDir, "concept-experience-registry.ts"),
  "utf8"
);

/** Save names a lesson component passes to getExperiencePersistence, read
 * from the component and the files it imports by relative path. */
function lessonSaveNames(conceptId: string): string[] {
  const entry = registrySource.match(
    new RegExp(`conceptId: "${conceptId}"[\\s\\S]*?import\\("([^"]+)"\\)`)
  );
  if (!entry) return [];
  const component = resolve(learnDomainDir, entry[1]);
  const source = readFileSync(component, "utf8");
  const files = [source];
  for (const [, path] of source.matchAll(/from "(\.{1,2}\/[^"]+)"/g)) {
    // Svelte rune modules are imported without their trailing .ts.
    for (const candidate of [path, `${path}.ts`]) {
      try {
        files.push(
          readFileSync(resolve(dirname(component), candidate), "utf8")
        );
        break;
      } catch {
        // Not this spelling; try the next.
      }
    }
  }
  const names = new Set<string>();
  for (const text of files) {
    for (const [, call] of text.matchAll(
      /getExperiencePersistence\(([^)]*)\)/g
    )) {
      for (const [, name] of call.matchAll(/["']([^"']+)["']/g))
        names.add(name);
    }
    for (const [, name] of text.matchAll(/conceptId="([^"]+)"/g))
      names.add(name);
  }
  return [...names];
}

describe("concept experience registry", () => {
  // Continue and the Guide's start-over link clear a lesson's saved place by
  // its concept id, so each lesson must save under that same id.
  it.each(expectedPublishedIds)(
    "%s saves lesson progress under its own concept id",
    (conceptId) => {
      expect(lessonSaveNames(conceptId)).toContain(conceptId);
    }
  );

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
