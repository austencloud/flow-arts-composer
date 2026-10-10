import { describe, expect, it } from "vitest";
import {
  getDirectionDrillDepth,
  getDirectionDrillParent,
  getDirectionDrillSubtitle,
  getDirectionDrillTitle,
  type DirectionDrillRoute,
} from "#lib/features/create/shared/components/sequence-actions/direction-drill-route.js";

const ALL_ROUTES: readonly DirectionDrillRoute[] = [
  "hub",
  "reversals",
  "absolute",
];

describe("Direction drill-down route", () => {
  it.each([
    ["reversals", "hub"],
    ["absolute", "hub"],
    ["hub", null],
  ] as const)("backs from %s to %s", (route, parent) => {
    expect(getDirectionDrillParent(route)).toBe(parent);
  });

  it.each([
    ["hub", "Direction"],
    ["reversals", "Reversals"],
    ["absolute", "Rotation Direction"],
  ] as const)("labels %s as %s", (route, title) => {
    expect(getDirectionDrillTitle(route)).toBe(title);
  });

  // The subtitle is the only place a single-knob screen explains itself, so a
  // blank one ships a screen with a control and no stated purpose.
  it.each(ALL_ROUTES)("gives %s a non-empty header subtitle", (route) => {
    expect(getDirectionDrillSubtitle(route).trim().length).toBeGreaterThan(0);
  });

  it("gives each screen its own subtitle", () => {
    const subtitles = ALL_ROUTES.map(getDirectionDrillSubtitle);
    expect(new Set(subtitles).size).toBe(ALL_ROUTES.length);
  });

  it.each([
    ["hub", 0],
    ["reversals", 1],
    ["absolute", 1],
  ] as const)("puts %s at depth %i", (route, depth) => {
    expect(getDirectionDrillDepth(route)).toBe(depth);
  });

  // Back animates by comparing depths, so a parent must always sit exactly one
  // level shallower than its child.
  it("keeps every parent exactly one level above its child", () => {
    for (const route of ALL_ROUTES) {
      const parent = getDirectionDrillParent(route);
      if (!parent) {
        expect(getDirectionDrillDepth(route)).toBe(0);
        continue;
      }
      expect(
        getDirectionDrillDepth(route) - getDirectionDrillDepth(parent)
      ).toBe(1);
    }
  });
});
