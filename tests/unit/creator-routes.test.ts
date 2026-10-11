import { describe, expect, it } from "vitest";
import {
  buildCreatorPath,
  parseCreatorPathname,
} from "#lib/shared/navigation/services/creator-routes.js";

describe("creator routes", () => {
  it("builds stable list and profile paths", () => {
    expect(buildCreatorPath()).toBe("/creators");
    expect(buildCreatorPath("user/name")).toBe("/creators/user%2Fname");
  });

  it("parses the canonical Creators module path", () => {
    expect(parseCreatorPathname("/creators")).toEqual({
      creatorId: null,
      canonicalPath: "/creators",
      isLegacy: false,
    });
    expect(parseCreatorPathname("/creators/user%2Fname")).toEqual({
      creatorId: "user/name",
      canonicalPath: "/creators/user%2Fname",
      isLegacy: false,
    });
  });

  it.each([
    "/browse/creators/abc",
    "/social/creators/abc",
    "/app/browse/creators/abc",
    "/app/social/creators/abc",
  ])("migrates %s to the canonical profile path", (pathname) => {
    expect(parseCreatorPathname(pathname)).toEqual({
      creatorId: "abc",
      canonicalPath: "/creators/abc",
      isLegacy: true,
    });
  });

  it.each(["/browse/creators", "/social/creators"])(
    "migrates the legacy list path %s",
    (pathname) => {
      expect(parseCreatorPathname(pathname)).toEqual({
        creatorId: null,
        canonicalPath: "/creators",
        isLegacy: true,
      });
    }
  );

  it("leaves unrelated module paths alone", () => {
    expect(parseCreatorPathname("/browse/gallery")).toBeNull();
    expect(parseCreatorPathname("/social/community")).toBeNull();
  });
});
