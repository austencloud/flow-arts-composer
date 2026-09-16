import { describe, it, expect } from "vitest";
import type { Component } from "svelte";
import { buildReaderNav, FRONT_MATTER_COUNT } from "./guide-reader-nav";
import { GUIDE_BODY_PAGES } from "./guide-manifest";

// Fake built registry keyed by the ids that are actually built (mirrors
// built-pages.ts). Importing the real BUILT pulls in the Svelte page components
// + their firebase/protobuf transitive deps, which don't load in the node test
// env. The builder only reads `built`'s KEYS, so a fake map exercises it fully.
const BUILT_IDS = [
  "the-grid",
  "hand-placements",
  "hand-motions",
  "hm-type1",
  "hm-gamma",
  "hm-type2",
  "hm-type34",
];
const built = Object.fromEntries(
  BUILT_IDS.map((id) => [id, (() => null) as unknown as Component])
) as Record<string, Component>;

describe("buildReaderNav", () => {
  const rows = buildReaderNav(built);

  it("front matter offset is 5", () => {
    expect(FRONT_MATTER_COUNT).toBe(5);
  });

  it("has the three front-matter jump rows at indices 0, 3, 4", () => {
    const front = rows.filter((r) => r.kind === "front");
    expect(front.map((r) => (r.kind === "front" ? r.index : -1))).toEqual([0, 3, 4]);
    expect(front.map((r) => (r.kind === "front" ? r.title : ""))).toEqual([
      "Cover",
      "Read Me",
      "Contents",
    ]);
  });

  it("has one page row per manifest body entry", () => {
    const pages = rows.filter((r) => r.kind === "page");
    expect(pages).toHaveLength(GUIDE_BODY_PAGES.length);
  });

  it("maps the first body page (The Grid) to reader index 5 and marks it built", () => {
    const grid = rows.find((r) => r.kind === "page" && r.id === "the-grid");
    expect(grid).toMatchObject({ index: 5, built: true, title: "The Grid" });
  });

  it("marks an unbuilt entry (base-letters) as not built", () => {
    const bl = rows.find((r) => r.kind === "page" && r.id === "base-letters");
    expect(bl && bl.kind === "page" ? bl.built : true).toBe(false);
  });

  it("emits a group header before each group's pages", () => {
    const groups = rows
      .filter((r) => r.kind === "group")
      .map((r) => (r.kind === "group" ? r.group : ""));
    expect(groups).toEqual(["1.0", "1.1", "1.2"]);
  });
});
