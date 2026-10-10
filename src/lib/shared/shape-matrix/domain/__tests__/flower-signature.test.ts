import { describe, it, expect } from "vitest";
import {
  buildFlowerAxis,
  buildFloatAxis,
  buildShapeMatrixAxis,
  flowerPetals,
  flowerKey,
  flowerLabel,
  flowerStartOrientation,
  hybridRatioLabel,
  flowerTurnPattern,
  ratioLabel,
} from "../flower-signature";
import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

describe("flower-signature", () => {
  it("enumerates 56 flowers ordered by turns, pro/anti alternating per step", () => {
    const axis = buildFlowerAxis();
    expect(axis).toHaveLength(56); // 2 styles × 7 turns × 2 orientations × 2 grids
    // turns ascending; pro before anti, in before out, diamond before box twin
    expect(axis[0]).toMatchObject({
      style: "pro",
      turns: 0,
      ori: "in",
      grid: "diamond",
    });
    expect(axis[1]).toMatchObject({
      style: "pro",
      turns: 0,
      ori: "in",
      grid: "box",
    });
    expect(axis[2]).toMatchObject({
      style: "pro",
      turns: 0,
      ori: "out",
      grid: "diamond",
    });
    expect(axis[4]).toMatchObject({
      style: "anti",
      turns: 0,
      ori: "in",
      grid: "diamond",
    });
    expect(axis[8]).toMatchObject({
      style: "pro",
      turns: 0.5,
      ori: "in",
      grid: "diamond",
    });
    // turns never decrease as we walk the axis → one direction of climb
    for (let i = 1; i < axis.length; i++) {
      expect(axis[i]!.turns).toBeGreaterThanOrEqual(axis[i - 1]!.turns);
    }
    // both styles present within the first turn step (alternating, not blocked)
    const firstStep = axis.filter((f) => f.turns === 0).map((f) => f.style);
    expect(firstStep).toEqual([
      "pro",
      "pro",
      "pro",
      "pro",
      "anti",
      "anti",
      "anti",
      "anti",
    ]);
  });

  it("computes whole petals for the complete reduced-ratio flower", () => {
    expect(flowerPetals({ style: "pro", turns: -0.25 })).toBe(1);
    expect(flowerPetals({ style: "anti", turns: -0.25 })).toBe(3);
    expect(flowerPetals({ style: "pro", turns: 0.5 })).toBe(1);
    expect(flowerPetals({ style: "anti", turns: 0.5 })).toBe(3); // triquetra
    expect(flowerPetals({ style: "pro", turns: 3 })).toBe(6);
    expect(flowerPetals({ style: "anti", turns: 3 })).toBe(8);
    expect(
      [0.25, 0.75, 1.25, 1.75, 2.25, 2.75].map((turns) =>
        flowerPetals({ style: "pro", turns })
      )
    ).toEqual([1, 3, 5, 7, 9, 11]);
    expect(
      [0.25, 0.75, 1.25, 1.75, 2.25, 2.75].map((turns) =>
        flowerPetals({ style: "anti", turns })
      )
    ).toEqual([5, 7, 9, 11, 13, 15]);
  });

  it("uses a complementary quarter-turn phase without changing whole-turn orientation", () => {
    expect(flowerStartOrientation({ turns: 0.75, ori: "in" })).toBe(
      Orientation.IN
    );
    expect(flowerStartOrientation({ turns: 0.75, ori: "out" })).toBe(
      Orientation.CLOCK
    );
    expect(flowerStartOrientation({ turns: 1.5, ori: "out" })).toBe(
      Orientation.OUT
    );
    expect(flowerStartOrientation({ turns: "fl", ori: "out" })).toBe(
      Orientation.OUT
    );
    expect(flowerStartOrientation({ turns: "fl", ori: "clock" })).toBe(
      Orientation.CLOCK
    );
    expect(flowerStartOrientation({ turns: "fl", ori: "counter" })).toBe(
      Orientation.COUNTER
    );
  });

  it("labels VTG ratios in SpiroAnim's hand-cycle-first order", () => {
    expect(ratioLabel("fl")).toBe("1:0");
    expect(ratioLabel(-0.25)).toBe("2:1");
    expect(ratioLabel(0)).toBe("1:1"); // isolation
    expect(ratioLabel(0.5)).toBe("1:2"); // triquetra when antispin
    expect(ratioLabel(1)).toBe("1:3");
    expect(ratioLabel(3)).toBe("1:7");
    expect(ratioLabel(0.25)).toBe("2:3");
    expect(ratioLabel(1.25)).toBe("2:7");
    expect(hybridRatioLabel(1, 0)).toBe("Left 1:3 × Right 1:1");
    expect(hybridRatioLabel(1, 1)).toBe("1:3");
    expect(hybridRatioLabel("fl", -0.25)).toBe("Left 1:0 × Right 2:1");
  });

  it("adds one orientation-only float axis without pro/anti aliases", () => {
    expect(buildFloatAxis()).toHaveLength(4);
    expect(new Set(buildFloatAxis().map((flower) => flower.style))).toEqual(
      new Set(["float"])
    );
    expect(buildShapeMatrixAxis()).toHaveLength(116);
  });

  it("formats a deck-compatible turn pattern (integers bare, halves X.5)", () => {
    expect(flowerTurnPattern({ turns: 1 })).toBe("1|1");
    expect(flowerTurnPattern({ turns: 0.5 })).toBe("0.5|0.5");
    expect(flowerTurnPattern({ turns: -0.25 })).toBe("-0.25|-0.25");
  });

  it("builds a stable key and a human label", () => {
    const f = {
      style: "anti",
      turns: 0.5,
      ori: "out",
      grid: "box",
      petals: 3,
    } as const;
    expect(flowerKey(f)).toBe("anti-0.5-out-box");
    expect(flowerLabel(f)).toBe("1:2 out box · 3p"); // VTG ratio-only; style read from axis
    expect(
      flowerLabel({
        style: "float",
        turns: "fl",
        ori: "clock",
        grid: "diamond",
        petals: 0,
      })
    ).toBe("1:0 clock diamond · 0p");
  });
});
