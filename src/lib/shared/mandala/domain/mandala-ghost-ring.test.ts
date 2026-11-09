import { describe, expect, it } from "vitest";
import {
  MANDALA_GHOST_BASE_OPACITY,
  MANDALA_GHOST_DECAY,
  MANDALA_TRAIL_MAX,
  MANDALA_TRAIL_MIN,
  MandalaGhostRing,
  clampTrailLength,
  mandalaGhostOpacity,
} from "./mandala-ghost-ring";

function ages(ring: MandalaGhostRing): number[] {
  const ids: number[] = [];
  for (let age = 0; age < ring.count; age++) {
    ids.push(ring.slot(ring.slotIndexAt(age))!.id);
  }
  return ids;
}

describe("MandalaGhostRing", () => {
  it("never holds more ghosts than its length and keeps the newest", () => {
    const ring = new MandalaGhostRing(4);
    for (let i = 0; i < 10; i++) ring.push(i * 10, i * 100);
    expect(ring.count).toBe(4);
    expect(ages(ring)).toEqual([9, 8, 7, 6]);
    expect(ring.slot(ring.slotIndexAt(0))!.rotationDeg).toBe(90);
    expect(ring.slotIndexAt(4)).toBe(-1);
  });

  it("reuses only the first `length` slots, so surfaces past it stay unallocated", () => {
    const ring = new MandalaGhostRing(3, 15);
    const used = new Set<number>();
    for (let i = 0; i < 20; i++) used.add(ring.push(0, i * 100));
    expect([...used].sort()).toEqual([0, 1, 2]);
  });

  it("reuses the same slot objects instead of allocating per capture", () => {
    const ring = new MandalaGhostRing(3);
    ring.push(0, 0);
    ring.push(0, 100);
    ring.push(0, 200);
    const before = [0, 1, 2].map((i) => ring.slot(i));
    ring.push(5, 300);
    ring.push(6, 400);
    ring.push(7, 500);
    const after = [0, 1, 2].map((i) => ring.slot(i));
    after.forEach((slot, i) => expect(slot).toBe(before[i]));
  });

  it("is deterministic: the same captures give the same ring", () => {
    const a = new MandalaGhostRing(5);
    const b = new MandalaGhostRing(5);
    for (let i = 0; i < 12; i++) {
      a.push(i * 7, i * 80);
      b.push(i * 7, i * 80);
    }
    expect(ages(a)).toEqual(ages(b));
    expect(a.slotIndexAt(0)).toBe(b.slotIndexAt(0));
  });

  it("captures on the interval, and again after the clock restarts", () => {
    const ring = new MandalaGhostRing(5);
    expect(ring.isDue(0, 80)).toBe(true);
    ring.push(0, 1000);
    expect(ring.isDue(1050, 80)).toBe(false);
    expect(ring.isDue(1080, 80)).toBe(true);
    expect(ring.isDue(10, 80)).toBe(true);
  });

  it("starts over on a new length and clamps it to the allowed range", () => {
    const ring = new MandalaGhostRing(8);
    for (let i = 0; i < 8; i++) ring.push(0, i * 100);
    ring.setLength(5);
    expect(ring.length).toBe(5);
    expect(ring.count).toBe(0);
    expect(ring.isDue(0)).toBe(true);
    ring.setLength(99);
    expect(ring.length).toBe(MANDALA_TRAIL_MAX);
    ring.setLength(0);
    expect(ring.length).toBe(MANDALA_TRAIL_MIN);
  });

  it("an emptied slot no longer reads as a ghost", () => {
    const ring = new MandalaGhostRing(4);
    ring.push(0, 0);
    ring.clear();
    expect(ring.count).toBe(0);
    expect(ring.slot(0)).toBeUndefined();
  });
});

describe("mandala ghost helpers", () => {
  it("fades by age, one decay step per interval", () => {
    expect(mandalaGhostOpacity(0, 80)).toBeCloseTo(MANDALA_GHOST_BASE_OPACITY);
    expect(mandalaGhostOpacity(80, 80)).toBeCloseTo(
      MANDALA_GHOST_BASE_OPACITY * MANDALA_GHOST_DECAY
    );
    expect(mandalaGhostOpacity(40, 80)).toBeLessThan(mandalaGhostOpacity(0, 80));
    expect(mandalaGhostOpacity(-5, 80)).toBeCloseTo(MANDALA_GHOST_BASE_OPACITY);
  });

  it("clamps a trail length to whole ghosts in range", () => {
    expect(clampTrailLength(1)).toBe(MANDALA_TRAIL_MIN);
    expect(clampTrailLength(7.6)).toBe(8);
    expect(clampTrailLength(Number.NaN)).toBe(8);
    expect(clampTrailLength(40)).toBe(MANDALA_TRAIL_MAX);
  });
});
