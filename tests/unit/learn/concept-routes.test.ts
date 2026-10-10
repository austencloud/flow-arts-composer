import { describe, expect, it } from "vitest";
import {
  buildConceptPath,
  buildConceptStartPath,
  conceptIdFromPathname,
  conceptRestartFromUrl,
  CONCEPT_LIST_PATH,
  isConceptPath,
} from "../../../src/lib/features/learn/domain/concept-routes";

describe("concept routes", () => {
  it("builds stable list and lesson URLs", () => {
    expect(buildConceptPath()).toBe(CONCEPT_LIST_PATH);
    expect(buildConceptPath("hand-motions-intro")).toBe(
      "/learn/concepts/hand-motions-intro"
    );
    expect(buildConceptPath("concept/with spaces")).toBe(
      "/learn/concepts/concept%2Fwith%20spaces"
    );
  });

  it("restores the concept id from a lesson URL", () => {
    expect(conceptIdFromPathname("/learn/concepts/grid")).toBe("grid");
    expect(conceptIdFromPathname("/learn/concepts/grid/")).toBe("grid");
    expect(
      conceptIdFromPathname("/learn/concepts/concept%2Fwith%20spaces")
    ).toBe("concept/with spaces");
  });

  it("rejects unrelated, incomplete, and malformed routes", () => {
    expect(conceptIdFromPathname(CONCEPT_LIST_PATH)).toBeNull();
    expect(conceptIdFromPathname("/learn/concepts/a/b")).toBeNull();
    expect(conceptIdFromPathname("/learn/concepts/%E0%A4%A")).toBeNull();
    expect(isConceptPath(CONCEPT_LIST_PATH)).toBe(true);
    expect(isConceptPath(`${CONCEPT_LIST_PATH}/`)).toBe(true);
    expect(isConceptPath("/learn/guide")).toBe(false);
  });

  it("links a lesson from its first step and reads that request back", () => {
    const href = buildConceptStartPath("grid");
    expect(href).toBe("/learn/concepts/grid?from-start");
    expect(
      conceptRestartFromUrl(new URL(href, "https://example.test"))
    ).toEqual({ conceptId: "grid", cleanHref: "/learn/concepts/grid" });
  });

  it("keeps other query and hash parts when it drops the request", () => {
    expect(
      conceptRestartFromUrl(
        new URL("https://example.test/learn/concepts/grid?a=1&from-start#top")
      )
    ).toEqual({ conceptId: "grid", cleanHref: "/learn/concepts/grid?a=1#top" });
  });

  it("ignores lesson URLs without the request and non-lesson URLs", () => {
    expect(
      conceptRestartFromUrl(new URL("https://example.test/learn/concepts/grid"))
    ).toBeNull();
    expect(
      conceptRestartFromUrl(
        new URL("https://example.test/learn/concepts?from-start")
      )
    ).toBeNull();
  });
});
