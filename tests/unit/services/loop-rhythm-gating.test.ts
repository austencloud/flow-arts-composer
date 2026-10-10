import { describe, expect, it } from "vitest";
import {
  fitLoopRhythmToLength,
  gateRhythm,
} from "#lib/shared/create/services/loop-rhythm-gating.js";
import { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";

const C = LOOPComponent;

describe("gateRhythm", () => {
  it("halved MIR (mirrored+inverted+rotated) at 16: ok, seed 4, mult 4", () => {
    const r = gateRhythm(
      new Set([C.MIRRORED, C.INVERTED, C.ROTATED]),
      { rotationInterval: 2, inversionInterval: 2, inversionMode: "expand" },
      16
    );
    expect(r).toEqual({ ok: true, seedLength: 4, multiplier: 4 });
  });

  it("halved MIR at 18: not divisible", () => {
    const r = gateRhythm(
      new Set([C.MIRRORED, C.INVERTED, C.ROTATED]),
      { rotationInterval: 2, inversionInterval: 2, inversionMode: "expand" },
      18
    );
    expect(r).toEqual({
      ok: false,
      reason: "18 beats can't split into 4 equal parts",
    });
  });

  it("rotated+inverted expand at length equal to the multiplier: seed 1 is too short", () => {
    const r = gateRhythm(
      new Set([C.ROTATED, C.INVERTED]),
      { rotationInterval: 2, inversionInterval: 2, inversionMode: "expand" },
      2
    );
    expect(r).toEqual({
      ok: false,
      reason: "Too short. A one-step seed has nothing for inversion to flip",
    });
  });

  it("overlay inversion never affects divisibility (rot:2+mir:2+inv overlay@4) at 16: ok, seed 4, mult 4", () => {
    const r = gateRhythm(
      new Set([C.ROTATED, C.MIRRORED, C.INVERTED]),
      { rotationInterval: 2, inversionInterval: 4, inversionMode: "overlay" },
      16
    );
    expect(r).toEqual({ ok: true, seedLength: 4, multiplier: 4 });
  });

  it("unmapped combo returns a reason string", () => {
    const r = gateRhythm(
      new Set([C.FLIPPED, C.REWOUND]),
      { rotationInterval: 2, inversionInterval: 2, inversionMode: "expand" },
      16
    );
    expect(r).toEqual({
      ok: false,
      reason: "No LOOP type matches this exact combination",
    });
  });
});

describe("fitLoopRhythmToLength", () => {
  it("fits a 10-step rotated LOOP by changing quartered to halved", () => {
    const result = fitLoopRhythmToLength(
      new Set([C.ROTATED]),
      { rotationInterval: 4, inversionInterval: 2 },
      10
    );

    expect(result).toEqual({
      rhythm: { rotationInterval: 2, inversionInterval: 2 },
      gate: { ok: true, seedLength: 5, multiplier: 2 },
      changed: true,
    });
  });

  it("keeps an already buildable rhythm unchanged", () => {
    const result = fitLoopRhythmToLength(
      new Set([C.ROTATED]),
      { rotationInterval: 4, inversionInterval: 2 },
      8
    );

    expect(result?.rhythm.rotationInterval).toBe(4);
    expect(result?.changed).toBe(false);
  });

  it("returns null when the component expansion cannot fit the length", () => {
    expect(
      fitLoopRhythmToLength(
        new Set([C.MIRRORED, C.INVERTED, C.ROTATED]),
        { rotationInterval: 4, inversionInterval: 4, inversionMode: "expand" },
        10
      )
    ).toBeNull();
  });
});
