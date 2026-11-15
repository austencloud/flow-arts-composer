import { describe, it, expect } from "vitest";
import {
  GridMode,
  GridPlacement,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { createStartPlacementVariations } from "#lib/shared/components/placement-picker/start-placement-utils.js";
import {
  changeKind,
  choicesFromVariations,
  choicesOfKind,
  handPoints,
  kindOf,
  leaveCustom,
  modeFromBlocked,
  moveLeftHandTo,
  pickOnly,
  shownChoice,
  shownMode,
  stepWithinKind,
} from "../start-placement-chooser";

// The real sixteen per grid mode, in picker order. Box mode uses the even
// numbers, so any rule keyed to diamond names would fail there.
const diamond = choicesFromVariations(
  createStartPlacementVariations(GridMode.DIAMOND)
);
const box = choicesFromVariations(createStartPlacementVariations(GridMode.BOX));
const allowedOf = (blocked: GridPlacement[]) =>
  diamond.map((c) => c.placement).filter((p) => !blocked.includes(p));

describe("kinds", () => {
  it("reads the kind from the alpha, beta, gamma prefix only", () => {
    expect(kindOf("alpha3")).toBe("apart");
    expect(kindOf("beta8")).toBe("together");
    expect(kindOf("gamma16")).toBe("adjacent");
    expect(kindOf("alphabet")).toBeNull();
    expect(kindOf("zeta1")).toBeNull();
  });

  it("has 4 apart, 4 together and 8 adjacent in both grid modes", () => {
    for (const choices of [diamond, box]) {
      expect(choices).toHaveLength(16);
      expect(choicesOfKind(choices, "apart")).toHaveLength(4);
      expect(choicesOfKind(choices, "together")).toHaveLength(4);
      expect(choicesOfKind(choices, "adjacent")).toHaveLength(8);
    }
  });

  it("finds the four hand points of each grid mode", () => {
    expect([...handPoints(diamond)].sort()).toEqual(["e", "n", "s", "w"]);
    expect([...handPoints(box)].sort()).toEqual(["ne", "nw", "se", "sw"]);
  });
});

describe("mode from the blocklist", () => {
  it("reads empty as Any, one allowed as Pick one, the rest as Custom", () => {
    expect(modeFromBlocked(diamond, [])).toBe("any");
    expect(
      modeFromBlocked(diamond, pickOnly(diamond, GridPlacement.BETA5))
    ).toBe("one");
    expect(modeFromBlocked(diamond, [GridPlacement.ALPHA1])).toBe("custom");
  });

  it("ignores blocked names from the other grid mode", () => {
    // A box placement left over in a diamond blocklist blocks nothing here.
    expect(modeFromBlocked(diamond, [GridPlacement.ALPHA2])).toBe("any");
  });

  it("shows Custom while the user asked for it, whatever the data says", () => {
    expect(shownMode("any", true)).toBe("custom");
    expect(shownMode("one", true)).toBe("custom");
    expect(shownMode("one", false)).toBe("one");
  });

  it("draws the one allowed placement, or the first in picker order", () => {
    expect(shownChoice(diamond, [])?.placement).toBe(GridPlacement.ALPHA1);
    expect(
      shownChoice(diamond, pickOnly(diamond, GridPlacement.GAMMA7))?.placement
    ).toBe(GridPlacement.GAMMA7);
  });
});

describe("pick one", () => {
  it("blocks all fifteen others", () => {
    const blocked = pickOnly(diamond, GridPlacement.BETA3);
    expect(blocked).toHaveLength(15);
    expect(allowedOf(blocked)).toEqual([GridPlacement.BETA3]);
  });
});

describe("turn stepper", () => {
  it("steps within the kind and wraps both ways", () => {
    expect(stepWithinKind(diamond, GridPlacement.ALPHA1, 1)).toBe(
      GridPlacement.ALPHA3
    );
    expect(stepWithinKind(diamond, GridPlacement.ALPHA7, 1)).toBe(
      GridPlacement.ALPHA1
    );
    expect(stepWithinKind(diamond, GridPlacement.ALPHA1, -1)).toBe(
      GridPlacement.ALPHA7
    );
  });

  it("visits all eight adjacent placements before coming back", () => {
    const seen = new Set<GridPlacement>();
    let p: GridPlacement = GridPlacement.GAMMA1;
    for (let i = 0; i < 8; i++) {
      seen.add(p);
      p = stepWithinKind(diamond, p, 1);
    }
    expect(seen.size).toBe(8);
    expect(p).toBe(GridPlacement.GAMMA1);
    expect([...seen].every((x) => kindOf(x) === "adjacent")).toBe(true);
  });

  it("uses box mode's own numbers in box mode", () => {
    expect(stepWithinKind(box, GridPlacement.BETA2, 1)).toBe(
      GridPlacement.BETA4
    );
  });
});

describe("change kind", () => {
  it("keeps the left hand's point when the new kind has it", () => {
    // alpha3: left hand west. beta7 is both hands west.
    expect(changeKind(diamond, GridPlacement.ALPHA3, "together")).toBe(
      GridPlacement.BETA7
    );
    // beta1: both north. gamma15 is the first adjacent with the left hand north.
    const adjacent = changeKind(diamond, GridPlacement.BETA1, "adjacent");
    expect(diamond.find((c) => c.placement === adjacent)?.left).toBe("n");
  });

  it("falls back to the kind's first placement from Any", () => {
    expect(changeKind(diamond, null, "adjacent")).toBe(GridPlacement.GAMMA1);
    expect(changeKind(box, null, "together")).toBe(GridPlacement.BETA2);
  });
});

describe("tapping a hand point", () => {
  it("moves the left hand and keeps the kind", () => {
    // beta1 is both hands north; tapping east gives both hands east.
    expect(moveLeftHandTo(diamond, GridPlacement.BETA1, "e")).toBe(
      GridPlacement.BETA3
    );
    // alpha1 is left south, right north; left to west is alpha3.
    expect(moveLeftHandTo(diamond, GridPlacement.ALPHA1, "w")).toBe(
      GridPlacement.ALPHA3
    );
  });

  it("for adjacent hands, keeps the right hand on the same side", () => {
    // gamma1: left west, right north (a quarter turn clockwise). Left to
    // south keeps clockwise: right west, which is gamma7.
    expect(moveLeftHandTo(diamond, GridPlacement.GAMMA1, "s")).toBe(
      GridPlacement.GAMMA7
    );
  });

  it("for adjacent hands, a tap on the left hand's own point swaps the right hand's side", () => {
    // gamma1 (W, N) ↔ gamma13 (W, S).
    expect(moveLeftHandTo(diamond, GridPlacement.GAMMA1, "w")).toBe(
      GridPlacement.GAMMA13
    );
    expect(moveLeftHandTo(diamond, GridPlacement.GAMMA13, "w")).toBe(
      GridPlacement.GAMMA1
    );
  });

  it("ignores a point the grid mode does not use", () => {
    expect(moveLeftHandTo(diamond, GridPlacement.BETA1, "ne")).toBe(
      GridPlacement.BETA1
    );
  });
});

describe("leaving Custom", () => {
  const custom = [GridPlacement.ALPHA1, GridPlacement.ALPHA3];

  it("Any clears the blocklist", () => {
    expect(leaveCustom(diamond, custom, "any")).toEqual([]);
  });

  it("Pick one keeps the first allowed placement", () => {
    expect(allowedOf(leaveCustom(diamond, custom, "one"))).toEqual([
      GridPlacement.ALPHA5,
    ]);
  });
});
