import { describe, it, expect } from "vitest";
import {
  AA_TOLERANCE,
  diffBuffers,
  bodyDiffBuffers,
} from "#lib/shared/parity/image-diff.js";

/** Build a w×h solid-color RGBA buffer. */
function solid(w: number, h: number, r: number, g: number, b: number, a = 255): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = a;
  }
  return buf;
}

describe("diffBuffers", () => {
  it("reports zero for identical buffers", () => {
    const a = solid(4, 4, 10, 20, 30);
    const b = solid(4, 4, 10, 20, 30);
    const r = diffBuffers(a, b, 4, 4);
    expect(r.diffPct).toBe(0);
    expect(r.maxDelta).toBe(0);
  });

  it("counts a single-channel delta above tolerance", () => {
    const a = solid(2, 1, 0, 0, 0);
    const b = solid(2, 1, 0, 0, 0);
    b[0] = 100; // red of pixel 0 jumps 100 (> AA_TOLERANCE)
    const r = diffBuffers(a, b, 2, 1);
    expect(r.maxDelta).toBe(100);
    expect(r.diffPct).toBe(50); // 1 of 2 pixels differs
  });

  it("ignores a sub-tolerance delta", () => {
    const a = solid(2, 1, 50, 50, 50);
    const b = solid(2, 1, 50, 50, 50);
    b[0] = 50 + (AA_TOLERANCE - 1);
    const r = diffBuffers(a, b, 2, 1);
    expect(r.diffPct).toBe(0);
    expect(r.maxDelta).toBe(AA_TOLERANCE - 1);
  });
});

describe("bodyDiffBuffers", () => {
  it("excludes a synthetic hard edge from the body", () => {
    // 4×1 strip: black | black | white | white  → a hard edge at x=1→2.
    const w = 4,
      h = 1;
    const a = new Uint8ClampedArray(w * h * 4);
    const set = (buf: Uint8ClampedArray, x: number, v: number) => {
      const i = x * 4;
      buf[i] = v;
      buf[i + 1] = v;
      buf[i + 2] = v;
      buf[i + 3] = 255;
    };
    set(a, 0, 0);
    set(a, 1, 0);
    set(a, 2, 255);
    set(a, 3, 255);
    const b = a.slice();
    set(b, 0, 200); // body pixel x=0 (non-edge with dilate 0) diverges hard
    set(b, 2, 200); // edge pixel x=2 also diverges — must be EXCLUDED from body
    // dilate 0 ⇒ edges are exactly x=1,x=2 (the luma jump); body = x=0,x=3.
    const r = bodyDiffBuffers(a, b, w, h, { edgeDilate: 0 });
    expect(r.edgePct).toBe(50); // x=1,x=2 of 4 pixels are edge
    expect(r.bodyMaxDelta).toBe(200); // from body x=0, NOT the excluded edge x=2
  });
});
