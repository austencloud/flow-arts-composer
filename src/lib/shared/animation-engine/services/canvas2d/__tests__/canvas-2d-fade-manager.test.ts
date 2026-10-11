import { describe, it, expect } from "vitest";
import { Canvas2DFadeManager } from "../canvas-2d-fade-manager";
import { DURATION } from "#lib/shared/transitions/transitions.js";
import { normalizeAngleSigned } from "../../angle-calculator";
import { interpolatePropCrossfadeTransform } from "../../canvas-2d-animation-renderer";

/**
 * Canvas2DFadeManager serves both glyph fades and the renderer-local prop
 * crossfade. Its default remains 300ms; weighted transitions pass a project
 * timing token explicitly.
 */
describe("Canvas2DFadeManager duration parameterization", () => {
  it("defaults to 300ms when constructed with no argument (glyph behavior unchanged)", () => {
    const m = new Canvas2DFadeManager();
    m.startFadeTransition();
    m.updateFadeProgress(0); // lazy-stamp start = 0
    const mid = m.updateFadeProgress(150); // halfway through 300ms
    expect(mid.currentAlpha).toBeCloseTo(0.5, 2);
    expect(mid.isComplete).toBe(false);

    const done = m.updateFadeProgress(300);
    expect(done.currentAlpha).toBe(1);
    expect(done.isComplete).toBe(true);
  });

  it("honors the emphasized duration used by the prop crossfade", () => {
    const m = new Canvas2DFadeManager(DURATION.emphasis);
    m.startFadeTransition();
    m.updateFadeProgress(0);

    const midpoint = m.updateFadeProgress(DURATION.emphasis / 2);
    expect(midpoint.isComplete).toBe(false);
    expect(midpoint.currentAlpha).toBeCloseTo(0.5, 2);

    const done = m.updateFadeProgress(DURATION.emphasis);
    expect(done.currentAlpha).toBe(1);
    expect(done.previousAlpha).toBe(0);
    expect(done.isComplete).toBe(true);
  });

  it("two independently-constructed instances run on independent clocks/durations", () => {
    // Mirrors the renderer's blue/red prop crossfade managers: one color's
    // transition must not affect the other's timer.
    const left = new Canvas2DFadeManager(DURATION.emphasis);
    const right = new Canvas2DFadeManager(DURATION.emphasis);

    left.startFadeTransition();
    left.updateFadeProgress(1000); // blue starts fading at virtual t=1000

    // Red never started — must report the steady "not fading" state regardless
    // of what time blue is being driven at.
    const redState = right.updateFadeProgress(1000);
    expect(redState.isComplete).toBe(true);
    expect(redState.currentAlpha).toBe(1);

    const blueMid = left.updateFadeProgress(1000 + DURATION.emphasis / 2);
    expect(blueMid.isComplete).toBe(false);
    expect(blueMid.currentAlpha).toBeCloseTo(0.5, 2);
  });
});

describe("prop crossfade transform bridge", () => {
  const outgoing = {
    centerX: 100,
    centerY: 400,
    angle: (350 * Math.PI) / 180,
    scaleFactor: 1,
  };
  const incoming = {
    centerX: 500,
    centerY: 200,
    angle: (10 * Math.PI) / 180,
    scaleFactor: 1,
  };

  it("moves monotonically from the last painted pose to the incoming pose", () => {
    const samples = [0, 0.25, 0.5, 0.75, 1].map((progress) =>
      interpolatePropCrossfadeTransform(outgoing, incoming, progress)
    );

    expect(samples[0]).toEqual(outgoing);
    expect(samples.at(-1)?.centerX).toBe(incoming.centerX);
    expect(samples.at(-1)?.centerY).toBe(incoming.centerY);
    expect(samples.at(-1)?.angle).toBeCloseTo(incoming.angle);
    expect(samples.at(-1)?.scaleFactor).toBe(incoming.scaleFactor);
    expect(samples.map(({ centerX }) => centerX)).toEqual(
      [...samples.map(({ centerX }) => centerX)].sort((a, b) => a - b)
    );
    expect(samples.map(({ centerY }) => centerY)).toEqual(
      [...samples.map(({ centerY }) => centerY)].sort((a, b) => b - a)
    );
  });

  it("takes the short rotation across the zero-degree seam", () => {
    const midpoint = interpolatePropCrossfadeTransform(
      outgoing,
      incoming,
      0.5
    );

    expect(Math.abs(normalizeAngleSigned(midpoint.angle))).toBeLessThan(
      (10 * Math.PI) / 180
    );
  });
});
