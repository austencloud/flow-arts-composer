import { describe, expect, it } from "vitest";
import {
  buildBrowsePath,
  resolveBrowsePathname,
} from "./browse-route-resolver.js";

describe("You drafts route", () => {
  it("keeps its own address through resolution and navigation", () => {
    const location = {
      primary: "you",
      section: "drafts",
      view: "list",
    } as const;
    expect(buildBrowsePath(location)).toBe("/browse/you/drafts");
    expect(resolveBrowsePathname("/browse/you/drafts")?.location).toEqual(
      location
    );
    expect(resolveBrowsePathname("/app/browse/you/drafts")?.canonicalPath).toBe(
      "/browse/you/drafts"
    );
  });
});
