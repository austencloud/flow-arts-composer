import { describe, expect, it } from "vitest";
import { propsElementFor, letterFor } from "@tka/shape-engine";
import { MODE_ORDER, type Flower, type VtgMode } from "@tka/shape-domain";

// The spec's fit proof: left pro-2-in (blue, 4 petals) over right anti-2-in
// (red, 6 petals) at level 2, as the /shape-engine route draws it.
const left: Flower = { style: "pro", turns: 2, ori: "in", grid: "diamond", petals: 4 };
const right: Flower = { style: "anti", turns: 2, ori: "in", grid: "diamond", petals: 6 };
const pair = { left, right };

const ELEMENT: Record<VtgMode, string> = { SS: "fire", TS: "air", QS: "moon", SO: "water", TO: "earth", QO: "sun" };
const LETTERS: Record<VtgMode, string> = { SS: "C", TS: "I", QS: "U", SO: "LF", TO: "FL", QO: "RO" };

describe("propsElementFor", () => {
  it.each(MODE_ORDER)("hands %s gives the props element the engine's bridge row shows", async (mode) => {
    const element = await propsElementFor(mode, pair, [2, 2]);
    expect(element?.element).toBe(ELEMENT[mode]);
  });

  it("returns the element record without an icon path", async () => {
    const fire = await propsElementFor("SS", pair, [2, 2]);
    expect(fire?.familyId).toBe("split-opp");
    expect(fire?.accentColor).toBe("#f2673a");
    expect(fire && "iconPath" in fire).toBe(false);
  });
});

describe("letterFor", () => {
  it.each(MODE_ORDER)("mode %s of the reference pair reads its letters", async (mode) => {
    expect(await letterFor(pair, mode, [2, 2])).toBe(LETTERS[mode]);
  });
});
