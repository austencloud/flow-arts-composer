import { describe, expect, it } from "vitest";
import { PLANNED_VIDEOS, plannedVideoFor } from "./planned-videos";
import { GUIDE_BODY_PAGES } from "../level-1/_data/guide-manifest";

describe("planned videos", () => {
  // A slug that names no page would hide its note without any error.
  it("names only real guide pages", () => {
    const slugs = new Set(GUIDE_BODY_PAGES.map((p) => p.id));
    for (const page of PLANNED_VIDEOS) expect(slugs.has(page.slug)).toBe(true);
  });
  it("drops the note once a page needs no more clips", () => {
    expect(plannedVideoFor("negative-space")?.clips.length).toBeGreaterThan(0);
    expect(plannedVideoFor("no-such-page")).toBeNull();
  });
});
