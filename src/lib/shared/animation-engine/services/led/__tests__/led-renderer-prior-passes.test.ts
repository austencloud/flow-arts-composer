import { describe, expect, it } from "vitest";
import { WebGLLedRenderer } from "../web-gl-led-renderer";
import { DEFAULT_LED_CONFIG } from "../../../domain/types/led-types";
import type { LedSample } from "../../../domain/types/led-types";

/**
 * A slow frame deposits one streak pass per prior LED set and a final pass for
 * the frame's own LEDs. The passes must chain into one continuous path with
 * caps only at the frame's ends, judged on the whole frame's travel.
 *
 * `buildSegments` is CPU-only (it fills a Float32Array), so it is driven
 * directly on an uninitialized renderer with a fake display size.
 */

const STRIDE = 15;
const FRAME = 950;

interface Harness {
  build(
    leds: readonly LedSample[],
    dt: number,
    discontinuity: boolean,
    firstPass: boolean,
    lastPass: boolean,
    startIndex: number
  ): number;
  data(): Float32Array;
}

function harness(): Harness {
  const renderer = new WebGLLedRenderer() as unknown as {
    displayWidth: number;
    displayHeight: number;
    instanceData: Float32Array;
    buildSegments: (
      leds: readonly LedSample[],
      canvasWidth: number,
      canvasHeight: number,
      config: typeof DEFAULT_LED_CONFIG,
      dt: number,
      timeDiscontinuity: boolean,
      firstPass: boolean,
      lastPass: boolean,
      startIndex: number
    ) => number;
  };
  renderer.displayWidth = FRAME;
  renderer.displayHeight = FRAME;
  return {
    build: (leds, dt, discontinuity, firstPass, lastPass, startIndex) =>
      renderer.buildSegments(
        leds,
        FRAME,
        FRAME,
        DEFAULT_LED_CONFIG,
        dt,
        discontinuity,
        firstPass,
        lastPass,
        startIndex
      ),
    data: () => renderer.instanceData,
  };
}

/** Two LEDs at the ends of a staff whose center sits at (475, 475). */
function staffAt(angle: number): LedSample[] {
  const half = 120;
  const cx = 475;
  const cy = 475;
  const mk = (sign: number, ledIndex: number): LedSample => ({
    x: cx + sign * half * Math.cos(angle),
    y: cy + sign * half * Math.sin(angle),
    propIndex: 0,
    ledIndex,
    endpointIndex: ledIndex,
    brightness: 1,
    r: 1,
    g: 0.5,
    b: 0,
  });
  return [mk(-1, 0), mk(1, 1)];
}

function segment(data: Float32Array, i: number) {
  const o = i * STRIDE;
  return {
    ax: data[o]!,
    ay: data[o + 1]!,
    bx: data[o + 2]!,
    by: data[o + 3]!,
    startCap: data[o + 9]!,
    endCap: data[o + 10]!,
  };
}

/** Segments of one LED, in write order, between two instance indices. */
function chain(data: Float32Array, from: number, to: number) {
  const out = [];
  for (let i = from; i < to; i++) out.push(segment(data, i));
  return out;
}

describe("LED renderer prior passes", () => {
  it("a plain single-pass frame keeps the one-pass cap rule", () => {
    const h = harness();
    // Seed a previous position so the next frame has a path to continue.
    h.build(staffAt(0), 1 / 60, true, true, true, 0);
    const n = h.build(staffAt(0.4), 1 / 60, false, true, true, 0);
    expect(n).toBeGreaterThan(0);
    const segs = chain(h.data(), 0, n);
    // Moving LEDs: butt joins at both frame ends, no caps.
    expect(segs.every((s) => s.startCap === 0 && s.endCap === 0)).toBe(true);
  });

  it("chains the prior passes into one path that ends on the final LEDs", () => {
    const h = harness();
    h.build(staffAt(0), 1 / 60, true, true, true, 0);
    const prior1 = staffAt(0.2);
    const prior2 = staffAt(0.4);
    const final = staffAt(0.6);
    let count = h.build(prior1, 1 / 60, false, true, false, 0);
    const afterPass1 = count;
    count = h.build(prior2, 1 / 60, false, false, false, count);
    const afterPass2 = count;
    count = h.build(final, 1 / 60, false, false, true, count);
    expect(afterPass1).toBeGreaterThan(0);
    expect(afterPass2).toBeGreaterThan(afterPass1);
    expect(count).toBeGreaterThan(afterPass2);

    const data = h.data();
    // The final pass's last written segment ends on a final LED position
    // (float32 instance data: compare at pixel-fraction precision).
    const last = segment(data, count - 1);
    const onFinal = final.some(
      (l) => Math.hypot(l.x - last.bx, l.y - last.by) < 1e-2
    );
    expect(onFinal).toBe(true);
    // Every later pass starts where the earlier pass stopped: for each LED,
    // the first segment of pass 2 begins at a point some pass-1 segment ended.
    const pass1 = chain(data, 0, afterPass1);
    const pass2 = chain(data, afterPass1, afterPass2);
    const pass1Ends = pass1.map((s) => [s.bx, s.by] as const);
    let joined = 0;
    for (const s of pass2) {
      if (pass1Ends.some(([x, y]) => Math.hypot(x - s.ax, y - s.ay) < 1e-2))
        joined++;
    }
    expect(joined).toBeGreaterThanOrEqual(2);
    // No caps anywhere on a frame whose LEDs travelled.
    const all = chain(data, 0, count);
    expect(all.every((s) => s.startCap === 0 && s.endCap === 0)).toBe(true);
  });

  it("caps both ends of a whole frame that barely moved, across passes", () => {
    const h = harness();
    h.build(staffAt(0), 1 / 60, true, true, true, 0);
    // Tiny jitters: each pass moves, but the frame as a whole stays put.
    let count = h.build(staffAt(0.0004), 1 / 60, false, true, false, 0);
    const afterPass1 = count;
    count = h.build(staffAt(0.0002), 1 / 60, false, false, false, count);
    const afterPass2 = count;
    count = h.build(staffAt(0.0001), 1 / 60, false, false, true, count);
    const data = h.data();
    const pass1 = chain(data, 0, afterPass1);
    const pass2 = chain(data, afterPass1, afterPass2);
    const pass3 = chain(data, afterPass2, count);
    // Pass 1 was written before the frame knew it was isolated; the last pass
    // patched its start caps on. Two LEDs, one segment each.
    expect(pass1.length).toBe(2);
    expect(pass1.every((s) => s.startCap === 1)).toBe(true);
    // Joins inside the frame stay butt.
    expect(pass1.every((s) => s.endCap === 0)).toBe(true);
    expect(pass2.every((s) => s.startCap === 0 && s.endCap === 0)).toBe(true);
    // The final pass closes the path with end caps and no start caps.
    expect(pass3.every((s) => s.startCap === 0)).toBe(true);
    expect(pass3.every((s) => s.endCap === 1)).toBe(true);
  });

  it("writes the start cap on the first pass of a discontinuity", () => {
    const h = harness();
    h.build(staffAt(0), 1 / 60, true, true, true, 0);
    let count = h.build(staffAt(1.0), 1 / 120, true, true, false, 0);
    const afterPass1 = count;
    count = h.build(staffAt(1.2), 1 / 120, false, false, true, count);
    const data = h.data();
    const pass1 = chain(data, 0, afterPass1);
    // A discontinuity discards the history: each LED's path starts fresh at
    // its first prior position with a round cap, then streaks on.
    const firstSegments = pass1.filter((s) => s.startCap === 1);
    expect(firstSegments.length).toBe(2);
    const pass2 = chain(data, afterPass1, count);
    expect(pass2.every((s) => s.startCap === 0)).toBe(true);
  });
});
