import { describe, expect, it } from "vitest";
import { createFuseRule, LEGACY_RULES } from "$lib/features/fuse/domain/fuse-rule";
import {
  classifyFuseRule,
  coerceToTnDRule,
  resolveFuseRule,
  type FuseTnDSelection,
} from "$lib/features/fuse/domain/fuse-tnd-rule";

function selection(partial: Partial<FuseTnDSelection>): FuseTnDSelection {
  return {
    mode: "TS",
    quarterOffset: "cw",
    invert: false,
    rewind: false,
    ...partial,
  };
}

describe("resolveFuseRule", () => {
  it.each([
    ["TS", "cw", createFuseRule({ rotationSteps: 0, reflect: "none" })],
    ["SS", "cw", createFuseRule({ rotationSteps: 4, reflect: "none" })],
    ["QS", "cw", createFuseRule({ rotationSteps: 2, reflect: "none" })],
    ["QS", "ccw", createFuseRule({ rotationSteps: 6, reflect: "none" })],
    ["TO", "cw", createFuseRule({ rotationSteps: 0, reflect: "mirror" })],
    ["SO", "cw", createFuseRule({ rotationSteps: 0, reflect: "flip" })],
    ["QO", "cw", createFuseRule({ rotationSteps: 2, reflect: "mirror" })],
    ["QO", "ccw", createFuseRule({ rotationSteps: 6, reflect: "mirror" })],
  ] as const)("%s %s resolves to its rule", (mode, quarterOffset, expected) => {
    expect(resolveFuseRule(selection({ mode, quarterOffset }))).toEqual(expected);
  });

  it("ignores the offset on non-quarter modes", () => {
    expect(resolveFuseRule(selection({ mode: "SS", quarterOffset: "ccw" }))).toEqual(
      resolveFuseRule(selection({ mode: "SS", quarterOffset: "cw" }))
    );
  });

  it("passes invert and rewind through", () => {
    expect(
      resolveFuseRule(selection({ mode: "TO", invert: true, rewind: true }))
    ).toEqual(createFuseRule({ reflect: "mirror", invert: true, rewind: true }));
  });
});

describe("classifyFuseRule", () => {
  it("round-trips every resolved selection", () => {
    const modes = ["TS", "SS", "QS", "TO", "SO", "QO"] as const;
    for (const mode of modes) {
      for (const quarterOffset of ["cw", "ccw"] as const) {
        for (const invert of [false, true]) {
          for (const rewind of [false, true]) {
            const sel = selection({ mode, quarterOffset, invert, rewind });
            const back = classifyFuseRule(resolveFuseRule(sel));
            expect(back?.mode, `${mode} ${quarterOffset}`).toBe(mode);
            expect(back?.invert).toBe(invert);
            expect(back?.rewind).toBe(rewind);
            if (mode === "QS" || mode === "QO") {
              expect(back?.quarterOffset).toBe(quarterOffset);
            }
          }
        }
      }
    }
  });

  it("reads the rotate-180 composites", () => {
    // rotate 180 then mirror (E-W) equals flip (N-S): Split, opp.
    expect(
      classifyFuseRule(createFuseRule({ rotationSteps: 4, reflect: "mirror" }))?.mode
    ).toBe("SO");
    // rotate 180 then flip equals mirror: Together, opp.
    expect(
      classifyFuseRule(createFuseRule({ rotationSteps: 4, reflect: "flip" }))?.mode
    ).toBe("TO");
    // rotate 0 then flip is flip: Split, opp.
    expect(
      classifyFuseRule(createFuseRule({ rotationSteps: 0, reflect: "flip" }))?.mode
    ).toBe("SO");
  });

  it("reads quarter rotations with either reflection as QO", () => {
    expect(
      classifyFuseRule(createFuseRule({ rotationSteps: 2, reflect: "flip" }))
    ).toMatchObject({ mode: "QO", quarterOffset: "cw" });
    expect(
      classifyFuseRule(createFuseRule({ rotationSteps: 6, reflect: "flip" }))
    ).toMatchObject({ mode: "QO", quarterOffset: "ccw" });
  });

  it("returns null on odd rotations", () => {
    for (const steps of [1, 3, 5, 7]) {
      expect(classifyFuseRule(createFuseRule({ rotationSteps: steps }))).toBeNull();
    }
  });

  it.each([
    ["mirror", "TO", false, false],
    ["flip", "SO", false, false],
    ["rotate90", "QS", false, false],
    ["rotate180", "SS", false, false],
    ["invert", "TS", true, false],
    ["rewind", "TS", false, true],
    ["rotate-mirror", "QO", false, false],
    ["mirror-invert", "TO", true, false],
    ["rotate-invert", "QS", true, false],
  ] as const)("legacy id %s restores as %s", (id, mode, invert, rewind) => {
    const back = classifyFuseRule(LEGACY_RULES[id]!);
    expect(back).toMatchObject({ mode, invert, rewind });
  });
});

describe("coerceToTnDRule", () => {
  it("leaves even rotations alone", () => {
    const rule = createFuseRule({ rotationSteps: 2, reflect: "mirror", invert: true });
    expect(coerceToTnDRule(rule)).toEqual({
      selection: selection({ mode: "QO", quarterOffset: "cw", invert: true }),
      adjusted: false,
    });
  });

  it.each([
    [1, "TS"],
    [3, "QS"],
    [5, "SS"],
    [7, "QS"],
  ] as const)("rounds %i down and keeps the other axes", (steps, mode) => {
    const rule = createFuseRule({ rotationSteps: steps, invert: true, rewind: true });
    const result = coerceToTnDRule(rule);
    expect(result.adjusted).toBe(true);
    expect(result.selection).toMatchObject({ mode, invert: true, rewind: true });
  });

  it("gives 7 a counterclockwise offset and 3 a clockwise one", () => {
    expect(coerceToTnDRule(createFuseRule({ rotationSteps: 7 })).selection.quarterOffset).toBe("ccw");
    expect(coerceToTnDRule(createFuseRule({ rotationSteps: 3 })).selection.quarterOffset).toBe("cw");
  });
});
