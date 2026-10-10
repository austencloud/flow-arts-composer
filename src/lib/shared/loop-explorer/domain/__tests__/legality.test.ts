import { describe, it, expect } from "vitest";
import { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import { LOOPType } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import {
  evaluateChip,
  evaluateSelection,
  resolveEffectiveSlice,
  supportsQuarteredSlice,
} from "../legality";

const { ROTATED, MIRRORED, FLIPPED, SWAPPED, INVERTED, REWOUND } = LOOPComponent;

describe("evaluateSelection", () => {
  it("accepts every solo component", () => {
    for (const c of [ROTATED, MIRRORED, FLIPPED, SWAPPED, INVERTED, REWOUND]) {
      const result = evaluateSelection(new Set([c]));
      expect(result.legal).toBe(true);
    }
  });

  it("accepts every subset of the {MIRRORED, ROTATED, SWAPPED, INVERTED} 16-combo family", () => {
    const family = [MIRRORED, ROTATED, SWAPPED, INVERTED];
    const powerset: LOOPComponent[][] = [[]];
    for (const c of family) {
      for (const existing of [...powerset]) {
        powerset.push([...existing, c]);
      }
    }
    // 16 subsets total (including the empty set, which resolves to the
    // legacy ROTATED placeholder inside generateLOOPType).
    expect(powerset).toHaveLength(16);
    for (const subset of powerset) {
      const result = evaluateSelection(new Set(subset));
      expect(result.legal).toBe(true);
    }
  });

  it("rejects FLIPPED combined with anything else", () => {
    const result = evaluateSelection(new Set([FLIPPED, ROTATED]));
    expect(result.legal).toBe(false);
    expect(result.reason).toMatch(/flipped/i);
  });

  it("rejects REWOUND combined with anything else", () => {
    const result = evaluateSelection(new Set([REWOUND, MIRRORED]));
    expect(result.legal).toBe(false);
    expect(result.reason).toMatch(/rewound/i);
  });

  it("resolves the full 4-way combo to MIRRORED_ROTATED_INVERTED_SWAPPED", () => {
    const result = evaluateSelection(new Set([MIRRORED, ROTATED, INVERTED, SWAPPED]));
    expect(result.legal).toBe(true);
    expect(result.loopType).toBe(LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED);
  });
});

describe("evaluateChip", () => {
  it("disables FLIPPED once another component is selected", () => {
    const result = evaluateChip(new Set([ROTATED]), FLIPPED);
    expect(result.canAdd).toBe(false);
  });

  it("disables adding a second component once FLIPPED is selected solo", () => {
    const result = evaluateChip(new Set([FLIPPED]), ROTATED);
    expect(result.canAdd).toBe(false);
  });

  it("allows building toward the 4-combo through an unmapped intermediate", () => {
    // {rotated, inverted, swapped} isn't itself in IMPLEMENTED_COMBOS as a
    // terminal entry's exact match requirement for THIS test — but it must
    // remain reachable en route to the 4-combo (canExtendCombo semantics).
    const result = evaluateChip(new Set([ROTATED, INVERTED]), SWAPPED);
    expect(result.canAdd).toBe(true);
  });

  it("always allows toggling off an already-selected component", () => {
    const result = evaluateChip(new Set([FLIPPED]), FLIPPED);
    expect(result.canAdd).toBe(true);
  });
});

describe("quartered gating", () => {
  it("supports quartered only for rotation-containing types", () => {
    expect(supportsQuarteredSlice(LOOPType.ROTATED)).toBe(true);
    expect(supportsQuarteredSlice(LOOPType.MIRRORED)).toBe(false);
    expect(supportsQuarteredSlice(null)).toBe(false);
  });

  it("coerces quartered to halved for non-rotation types", () => {
    expect(resolveEffectiveSlice(LOOPType.MIRRORED, "quartered")).toBe("halved");
    expect(resolveEffectiveSlice(LOOPType.ROTATED, "quartered")).toBe("quartered");
    expect(resolveEffectiveSlice(LOOPType.ROTATED, "halved")).toBe("halved");
  });
});
