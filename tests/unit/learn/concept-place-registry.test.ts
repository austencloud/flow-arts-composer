import { describe, expect, it } from "vitest";
import { getConceptById } from "@tka/domain";
import {
  CONCEPT_RESOURCE_BINDINGS,
  getApprovedPractice,
  getConceptPlace,
  getConceptPlaceIdForLesson,
  getConceptPlacesByLevel,
} from "$lib/features/learn/domain/concept-place-registry";
import {
  buildConceptPlaceHref,
  readConceptPlaceId,
  shouldResumeSavedConcept,
  writeConceptPlaceId,
} from "$lib/features/learn/domain/concept-place-routes";
import { getConceptExperience } from "$lib/features/learn/domain/concept-experience-registry";
import { getGame } from "$lib/features/learn/play/domain/game-registry";
import { GUIDE_BODY_PAGES } from "../../../src/routes/(public)/guide/level-1/_data/guide-manifest";

describe("concept place registry", () => {
  it("builds the complete official TKA Level 1 map", () => {
    const places = getConceptPlacesByLevel(1);

    expect(places.map((place) => place.id)).toEqual([
      "1.1",
      "1.2",
      "1.3",
      "1.4",
      "1.5",
      "1.6",
      "1.7",
      "1.8",
    ]);
    for (const place of places) {
      expect(place.concept).toBe(getConceptById(place.id));
      expect(place.tkaLevel).toBe(1);
    }
  });

  it("resolves every mapped resource to its real owner", () => {
    const guideSlugs = new Set(GUIDE_BODY_PAGES.map((page) => page.id));

    for (const conceptId of Object.keys(CONCEPT_RESOURCE_BINDINGS)) {
      const place = getConceptPlace(conceptId);
      expect(place, conceptId).toBeDefined();

      for (const lesson of place!.lessonIds) {
        expect(
          getConceptExperience(lesson.lessonId),
          lesson.lessonId
        ).toBeDefined();
      }
      for (const guide of place!.guideRefs) {
        expect(guideSlugs.has(guide.slug), guide.slug).toBe(true);
      }
      for (const practice of place!.practice) {
        expect(getGame(practice.gameId), practice.gameId).toBeDefined();
      }
    }
  });

  it("does not publish practice candidates as recommendations", () => {
    expect(getApprovedPractice(getConceptPlace("1.3")!)).toEqual([]);
    expect(getApprovedPractice(getConceptPlace("1.5")!)).toEqual([]);
  });

  it("finds the official place for a lesson handoff", () => {
    expect(getConceptPlaceIdForLesson("grid")).toBe("1.1");
    expect(getConceptPlaceIdForLesson("hand-placements")).toBe("1.2");
    expect(getConceptPlaceIdForLesson("timing-and-direction")).toBe("1.3");
    expect(getConceptPlaceIdForLesson("not-a-lesson")).toBeNull();
  });

  it("grounds rotation direction in its focused lesson and related Guide page", () => {
    const place = getConceptPlace("1.4")!;

    expect(place.lessonIds).toEqual([
      {
        lessonId: "rotation-direction",
        label: "Rotation Direction lesson",
        coverage: "focused",
      },
    ]);
    expect(place.guideRefs).toEqual([
      {
        slug: "staff-motions",
        label: "Staff Motions",
        coverage: "partial",
      },
    ]);
  });

  it("keeps orientations reference-only until it has a focused lesson owner", () => {
    const place = getConceptPlace("1.6")!;

    expect(place.lessonIds).toEqual([]);
    expect(place.guideRefs).toEqual([
      {
        slug: "staff-placements",
        label: "Staff Placements",
        coverage: "partial",
      },
    ]);
    expect(place.exploration).toBeNull();
    expect(place.practice).toEqual([]);
    expect(place.applications).toEqual([]);
  });
});

describe("concept place URLs", () => {
  it("builds a stable official concept URL", () => {
    expect(buildConceptPlaceHref("1.3")).toBe("/learn/concepts?place=1.3");
  });

  it("reads known places and rejects invented ones", () => {
    expect(readConceptPlaceId(new URLSearchParams("place=1.5"))).toBe("1.5");
    expect(readConceptPlaceId(new URLSearchParams("place=game-2"))).toBeNull();
  });

  it("preserves unrelated URL state when changing the selected place", () => {
    const url = new URL("https://tkaflowarts.com/learn/concepts?source=guide");
    writeConceptPlaceId(url, "1.2");
    expect(url.search).toBe("?source=guide&place=1.2");
    writeConceptPlaceId(url, null);
    expect(url.search).toBe("?source=guide");
  });

  it("lets an explicit Atlas place outrank saved lesson state", () => {
    expect(shouldResumeSavedConcept(null, "1.4", true)).toBe(false);
    expect(shouldResumeSavedConcept(null, null, true)).toBe(true);
    expect(shouldResumeSavedConcept("rotation-direction", "1.4", true)).toBe(
      false
    );
  });
});
