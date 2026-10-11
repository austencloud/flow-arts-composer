import { describe, it, expect } from "vitest";
import {
  calculateEndOrientation as core,
  deriveMotionType,
} from "#lib/shared/render/core/calculations/orientation.js";
// The sequence-engine copy is a positional-arg wrapper that delegates to core.
import { calculateEndOrientation as engine } from "#lib/shared/sequence-engine/services/orientation-propagator.js";
// The shared package copy. mcp-server delegates to this one, so covering it
// here also covers mcp-server.
import { calculateEndOrientation as pkg } from "@tka/render-core";

// Drift tripwire: every derivation copy must agree with the canonical core
// across the input space. If this fails, the copies have diverged — which the
// future "collapse 4 derivers to one" follow-up will fix.
const MOTION_TYPES = ["pro", "anti", "float", "dash", "static"];

// ALL 16 canonical orientations, not just the 4 radial ones. The original
// version of this test swept only radial, which is exactly why the 2026-07-25
// bug survived it: @tka/render-core and mcp-server blanket-lowercased the start
// orientation, so every interradial/centric value missed the camelCase-keyed
// rotation cycles — the turn silently no-opped and an invalid token ("centern")
// escaped. Radial was unaffected, so a radial-only sweep stayed green.
// Do not narrow this list.
const RADIAL = ["in", "out", "clock", "counter"];
const INTERRADIAL = ["clockIn", "clockOut", "counterIn", "counterOut"];
const CENTRIC = [
  "centerN", "centerNE", "centerE", "centerSE",
  "centerS", "centerSW", "centerW", "centerNW",
];
const ORIS = [...RADIAL, ...INTERRADIAL, ...CENTRIC];
const TURNS: (number | "fl")[] = [0, 0.5, 1, 1.5, 2, "fl"];
const ROT = ["cw", "ccw", "noRotation"];
const LOCS: [string, string][] = [
  ["n", "e"],
  ["e", "s"],
  ["n", "s"],
];

describe("calculateEndOrientation copies agree with core", () => {
  it("sequence-engine wrapper matches core across the input space", () => {
    for (const motionType of MOTION_TYPES)
      for (const startOrientation of ORIS)
        for (const turns of TURNS)
          for (const rotationDirection of ROT)
            for (const [startLocation, endLocation] of LOCS) {
              const expected = core({
                motionType,
                turns,
                rotationDirection,
                startLocation,
                endLocation,
                startOrientation,
              });
              const got = engine(
                motionType,
                turns,
                rotationDirection,
                startLocation,
                endLocation,
                startOrientation as never
              );
              expect(
                got,
                `${motionType}/${startOrientation}/${turns}/${rotationDirection}/${startLocation}->${endLocation}`
              ).toBe(expected);
            }
  });

  it("@tka/render-core matches core across the input space", () => {
    for (const motionType of MOTION_TYPES)
      for (const startOrientation of ORIS)
        for (const turns of TURNS)
          for (const rotationDirection of ROT)
            for (const [startLocation, endLocation] of LOCS) {
              const input = {
                motionType,
                turns,
                rotationDirection,
                startLocation,
                endLocation,
                startOrientation,
              };
              const expected = core(input as never);
              const got = pkg(input as never);
              expect(
                got,
                `${motionType}/${startOrientation}/${turns}/${rotationDirection}/${startLocation}->${endLocation}`
              ).toBe(expected);
            }
  });

  it("a turn advances centric and interradial orientations (no silent no-op)", () => {
    // Regression lock for the 2026-07-25 bug: a half turn from centerN must
    // reach centerE, not return centerN. Both copies, explicitly.
    for (const impl of [core, pkg]) {
      const at = (turns: number, startOrientation: string) =>
        impl({
          motionType: "pro",
          turns,
          rotationDirection: "cw",
          startLocation: "n",
          endLocation: "e",
          startOrientation,
        } as never);

      expect(at(0, "centerN")).toBe("centerN");
      expect(at(0.5, "centerN")).toBe("centerE");
      expect(at(1, "centerN")).toBe("centerS");
      expect(at(0.5, "clockIn")).toBe("counterIn");
    }
  });

  it("orientation casing is canonicalized, never lowercased through", () => {
    // "centern"/"clockin" are not valid Orientation values. A copy that
    // lowercases its input returns them verbatim; a correct one canonicalizes.
    for (const impl of [core, pkg]) {
      const out = impl({
        motionType: "pro",
        turns: 0,
        rotationDirection: "cw",
        startLocation: "n",
        endLocation: "e",
        startOrientation: "centern",
      } as never);
      expect(out).toBe("centerN");
    }
  });
});

describe("deriveMotionType resolves pro/anti on shift pairs", () => {
  it("diamond (cardinal) shift n->e: cw=pro, ccw=anti", () => {
    expect(deriveMotionType("n", "e", "cw", 0)).toBe("pro");
    expect(deriveMotionType("n", "e", "ccw", 0)).toBe("anti");
  });
  it("box (intercardinal) shift ne->se: cw=pro, ccw=anti", () => {
    expect(deriveMotionType("ne", "se", "cw", 0)).toBe("pro");
    expect(deriveMotionType("ne", "se", "ccw", 0)).toBe("anti");
  });
});
