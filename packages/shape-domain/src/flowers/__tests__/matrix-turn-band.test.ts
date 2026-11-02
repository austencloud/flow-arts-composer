import { describe, expect, it } from "vitest";
import {
  clampMatrixTurnToLevel,
  matrixTurnsForLevel,
  matrixTurnSpokenLabel,
  matrixTurnVisibleLabel,
} from "../matrix-turn-band";

describe("matrix turn bands", () => {
  it("adds only the Shape Matrix's negative quarter turn to Level 4", () => {
    expect(matrixTurnsForLevel(3)).toEqual(["fl", 0, 0.5, 1, 1.5, 2, 2.5, 3]);
    expect(matrixTurnsForLevel(4).slice(0, 4)).toEqual(["fl", -0.25, 0, 0.25]);
  });

  it("keeps -0.25 only at Level 4 and clamps it to zero below that", () => {
    expect(clampMatrixTurnToLevel(-0.25, 4)).toBe(-0.25);
    expect(clampMatrixTurnToLevel(-0.25, 3)).toBe(0);
  });

  it("names Float and -0.25 in the selected notation system", () => {
    expect(matrixTurnVisibleLabel("fl", "turns")).toBe("Float");
    expect(matrixTurnVisibleLabel("fl", "ratios")).toBe("1:0");
    expect(matrixTurnVisibleLabel(-0.25, "turns")).toBe("-0.25");
    expect(matrixTurnVisibleLabel(-0.25, "ratios")).toBe("2:1");
    expect(matrixTurnSpokenLabel("fl", "ratios")).toBe("1:0 ratio");
    expect(matrixTurnSpokenLabel(-0.25, "turns")).toBe("-0.25 turns");
  });
});
