import { describe, it, expect } from "vitest";
import {
  calculateDashLocation,
  type DashLocationInput,
} from "#lib/shared/render/core/calculations/dash-location.js";

/**
 * Dash arrows are NOT drawn at their start or end location — their location is
 * derived from turns, rotation direction, letter family, and (for Type 3) the
 * partner motion's shift arc. A wrong derivation puts the dash arrow in the wrong
 * cell, which is invisible until someone reads the pictograph carefully. These
 * tests exercise each routing branch.
 */

function input(overrides: Partial<DashLocationInput>): DashLocationInput {
  return {
    letter: "A",
    motionHand: "right",
    motionStartLocation: "n",
    motionEndLocation: "s",
    motionTurns: 0,
    motionRotationDirection: "cw",
    gridMode: "diamond",
    ...overrides,
  };
}

describe("calculateDashLocation — non-zero turns (rotation based)", () => {
  it("rotates the start location one step clockwise for a cw dash", () => {
    expect(calculateDashLocation(input({ motionTurns: 1, motionRotationDirection: "cw", motionStartLocation: "n" }))).toBe("e");
    expect(calculateDashLocation(input({ motionTurns: 1, motionRotationDirection: "cw", motionStartLocation: "e" }))).toBe("s");
    expect(calculateDashLocation(input({ motionTurns: 1, motionRotationDirection: "cw", motionStartLocation: "s" }))).toBe("w");
    expect(calculateDashLocation(input({ motionTurns: 1, motionRotationDirection: "cw", motionStartLocation: "w" }))).toBe("n");
  });

  it("rotates one step counter-clockwise for a ccw dash", () => {
    expect(calculateDashLocation(input({ motionTurns: 1, motionRotationDirection: "ccw", motionStartLocation: "n" }))).toBe("w");
    expect(calculateDashLocation(input({ motionTurns: 1, motionRotationDirection: "ccw", motionStartLocation: "e" }))).toBe("n");
  });

  it("cw and ccw rotations are inverses", () => {
    for (const start of ["n", "e", "s", "w"]) {
      const cw = calculateDashLocation(
        input({ motionTurns: 1, motionRotationDirection: "cw", motionStartLocation: start })
      );
      const back = calculateDashLocation(
        input({ motionTurns: 1, motionRotationDirection: "ccw", motionStartLocation: cw })
      );
      expect(back).toBe(start);
    }
  });

  it("four cw steps return to the start location", () => {
    let loc = "n";
    for (let i = 0; i < 4; i++) {
      loc = calculateDashLocation(
        input({ motionTurns: 1, motionRotationDirection: "cw", motionStartLocation: loc })
      );
    }
    expect(loc).toBe("n");
  });

  it("returns the start location when rotation is explicitly none", () => {
    expect(
      calculateDashLocation(
        input({ motionTurns: 1, motionRotationDirection: "no_rotation", motionStartLocation: "e" })
      )
    ).toBe("e");
  });
});

describe("calculateDashLocation — zero turns default mapping", () => {
  it("maps each straight cardinal dash to its perpendicular cell", () => {
    expect(calculateDashLocation(input({ motionStartLocation: "n", motionEndLocation: "s" }))).toBe("e");
    expect(calculateDashLocation(input({ motionStartLocation: "e", motionEndLocation: "w" }))).toBe("s");
    expect(calculateDashLocation(input({ motionStartLocation: "s", motionEndLocation: "n" }))).toBe("w");
    expect(calculateDashLocation(input({ motionStartLocation: "w", motionEndLocation: "e" }))).toBe("n");
  });
});

describe("calculateDashLocation — Phi-dash / Psi-dash special map", () => {
  it("splits red and blue to opposite cells for a phi-dash", () => {
    // Both motions at zero turns -> PHI_DASH_PSI_DASH_LOCATION_MAP.
    const base = {
      letter: "Φ-",
      motionStartLocation: "n",
      motionEndLocation: "s",
      motionTurns: 0 as const,
      otherMotionTurns: 0 as const,
    };
    expect(calculateDashLocation(input({ ...base, motionHand: "right" }))).toBe("e");
    expect(calculateDashLocation(input({ ...base, motionHand: "left" }))).toBe("w");
  });

  it("does the same for a psi-dash", () => {
    const base = {
      letter: "Ψ-",
      motionStartLocation: "e",
      motionEndLocation: "w",
      motionTurns: 0 as const,
      otherMotionTurns: 0 as const,
    };
    expect(calculateDashLocation(input({ ...base, motionHand: "right" }))).toBe("n");
    expect(calculateDashLocation(input({ ...base, motionHand: "left" }))).toBe("s");
  });
});

describe("calculateDashLocation — Type 3 (dash + partner shift)", () => {
  it("derives the dash cell from the partner shift's arc location", () => {
    // Dash starts at n (turns 0); partner is a pro shift w->n whose arc is nw.
    // DIAMOND_DASH_LOCATION_MAP["n,nw"] = "e".
    const result = calculateDashLocation(
      input({
        letter: "W-",
        motionStartLocation: "n",
        motionEndLocation: "s",
        motionTurns: 0,
        otherMotionType: "pro",
        otherMotionStartLocation: "w",
        otherMotionEndLocation: "n",
        otherMotionTurns: 0,
        gridMode: "diamond",
      })
    );
    expect(result).toBe("e");
  });
});

describe("calculateDashLocation — normalization", () => {
  it("is case-insensitive on locations", () => {
    expect(
      calculateDashLocation(input({ motionTurns: 1, motionRotationDirection: "CW", motionStartLocation: "N" }))
    ).toBe("e");
  });
});
