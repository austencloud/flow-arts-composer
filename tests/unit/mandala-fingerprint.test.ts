import { describe, it, expect } from "vitest";
import { shapeKey } from "#lib/shared/mandala/services/mandala-fingerprint.js";
import { colorSignature, orbitKey } from "#lib/shared/mandala/services/mandala-fingerprint.js";
import type { MandalaPaths } from "#lib/shared/mandala/domain/mandala-types.js";

function paths(left: string[], right: string[], purple: string[] = []): MandalaPaths {
  return {
    left: left.map((d, i) => ({ d, tipIndex: i })),
    right: right.map((d, i) => ({ d, tipIndex: i })),
    purple: purple.map((d, i) => ({ d, tipIndex: i })),
  };
}

const ARC = "M 10.00 0.00 C 5.00 5.00, 0.00 10.00, -10.00 0.00";
const LINE = "M -50.00 -50.00 C -25.00 -25.00, 0.00 0.00, 50.00 50.00";

// Rotate every on-curve point of a "d" string by `deg` degrees about the
// origin, re-emitting as an M + C polyline (parsePoints-compatible). Used to
// generate genuine geometric rotations for the invariance test.
function rotateD(d: string, deg: number): string {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const pts: Array<{ x: number; y: number }> = [];
  const m = d.match(/^M\s+(-?[\d.]+)\s+(-?[\d.]+)/);
  if (m) pts.push({ x: parseFloat(m[1]!), y: parseFloat(m[2]!) });
  const c = /C\s+-?[\d.]+\s+-?[\d.]+,\s+-?[\d.]+\s+-?[\d.]+,\s+(-?[\d.]+)\s+(-?[\d.]+)/g;
  let mc: RegExpExecArray | null;
  while ((mc = c.exec(d)) !== null) pts.push({ x: parseFloat(mc[1]!), y: parseFloat(mc[2]!) });
  const r = pts.map(({ x, y }) => ({ x: x * cos - y * sin, y: x * sin + y * cos }));
  let s = `M ${r[0]!.x.toFixed(2)} ${r[0]!.y.toFixed(2)}`;
  for (let i = 1; i < r.length; i++) {
    const a = r[i - 1]!, b = r[i]!;
    s += ` C ${a.x.toFixed(2)} ${a.y.toFixed(2)}, ${b.x.toFixed(2)} ${b.y.toFixed(2)}, ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
  }
  return s;
}

describe("shapeKey", () => {
  it("is deterministic", () => {
    const p = paths([ARC], [LINE]);
    expect(shapeKey(p)).toBe(shapeKey(p));
  });

  it("is color-blind: swapping which color draws which line yields the same key", () => {
    const a = paths([ARC], [LINE]);
    const b = paths([LINE], [ARC]);
    expect(shapeKey(a)).toBe(shapeKey(b));
  });

  it("collapses a line drawn by both colors to one line (overlap is one path)", () => {
    const both = paths([ARC], [ARC]);
    const single = paths([ARC], []);
    expect(shapeKey(both)).toBe(shapeKey(single));
  });

  it("distinguishes different shapes", () => {
    expect(shapeKey(paths([ARC], []))).not.toBe(shapeKey(paths([LINE], [])));
  });
});

describe("colorSignature", () => {
  it("flags blue-only", () => {
    const s = colorSignature(paths([ARC], []));
    expect(s).toMatchObject({ leftOnly: true, rightOnly: false });
    expect(s.comboPurpleRatio).toBe(0);
  });
  it("flags red-only", () => {
    expect(colorSignature(paths([], [ARC]))).toMatchObject({ leftOnly: false, rightOnly: true });
  });
  it("reports full overlap as comboPurpleRatio 1", () => {
    expect(colorSignature(paths([ARC], [ARC])).comboPurpleRatio).toBe(1);
  });
  it("reports zero overlap as comboPurpleRatio 0 but combo true", () => {
    const s = colorSignature(paths([ARC], [LINE]));
    expect(s.leftOnly).toBe(false);
    expect(s.rightOnly).toBe(false);
    expect(s.comboPurpleRatio).toBe(0);
  });
});

describe("orbitKey", () => {
  it("is rotation-invariant: a glyph and its 45deg rotation share an orbit key", () => {
    // 45deg rotation of (10,0) about origin = (7.07, 7.07); of (-10,0) = (-7.07,-7.07)
    const rotArc = "M 7.07 7.07 C 0.00 7.07, -7.07 7.07, -7.07 -7.07";
    expect(orbitKey(paths([ARC], []))).toBe(orbitKey(paths([rotArc], [])));
  });
  it("is reflection-invariant: a glyph and its mirror share an orbit key", () => {
    const mirrorArc = "M -10.00 0.00 C -5.00 5.00, 0.00 10.00, 10.00 0.00";
    expect(orbitKey(paths([ARC], []))).toBe(orbitKey(paths([mirrorArc], [])));
  });
  it("returns a fixed-width hash string", () => {
    expect(orbitKey(paths([ARC], []))).toHaveLength(22);
  });
});

describe("orbitKey invariance (adversarial)", () => {
  it("is identical across all 8 45-degree rotations of a generic glyph", () => {
    const glyph = "M 137.30 88.90 C 100.00 40.00, -60.50 150.20, 12.34 -176.55";
    const base = orbitKey(paths([glyph], []));
    for (let k = 1; k < 8; k++) {
      expect(orbitKey(paths([rotateD(glyph, 45 * k)], []))).toBe(base);
    }
  });
  it("is identical for a reflected generic glyph", () => {
    const glyph = "M 137.30 88.90 C 100.00 40.00, -60.50 150.20, 12.34 -176.55";
    const mirrored = glyph.replace(/(-?[\d.]+)(\s+)(-?[\d.]+)/g, (_m, x, sp, y) => `${(-parseFloat(x)).toFixed(2)}${sp}${y}`);
    expect(orbitKey(paths([mirrored], []))).toBe(orbitKey(paths([glyph], [])));
  });
});
