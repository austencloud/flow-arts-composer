import { describe, expect, it } from "vitest";
import {
  GOO_MAX_SPLATS,
  GooGlassSim,
  splatRadius,
  type GooGlassParams,
} from "./goo-glass-sim";
import { resolveGooLook2D } from "./goo-look-2d";
import type { GooIntent } from "../domain/effects-config";

const BOUNDS = { width: 1000, height: 1000 };
const FRAME = 1 / 60;

function params(palette: GooIntent["palette"] = "classic"): GooGlassParams {
  return { scale: 1, gravity: 1, viscosity: 0.3, look: resolveGooLook2D(palette) };
}

function run(glass: GooGlassSim, seconds: number, p: GooGlassParams): void {
  for (let t = 0; t < seconds; t += FRAME) glass.step(FRAME, p, BOUNDS);
}

/** A drop that hits the glass head-on, too slow to throw specks. */
function hit(x: number, y: number, r: number) {
  return { x, y, vx: 0, vy: 0, r };
}

describe("GooGlassSim", () => {
  it("lets a heavy splat run down the glass and leave a streak", () => {
    const glass = new GooGlassSim(() => 0.5);
    const p = params();
    glass.land([hit(500, 100, 14)], p);
    run(glass, 1, p);
    const splat = glass.splats.find((s) => s.y > 140);
    expect(splat).toBeDefined();
    expect(glass.streaks.length).toBeGreaterThan(0);
  });

  it("holds a small splat in place until it dries away", () => {
    const glass = new GooGlassSim(() => 0.5);
    const p = params();
    glass.land([hit(500, 100, 2)], p);
    run(glass, 1, p);
    expect(glass.splats).toHaveLength(1);
    expect(glass.splats[0]!.y).toBe(100);
    run(glass, 60, p);
    expect(glass.splats).toHaveLength(0);
  });

  it("rolls mercury down without wetting the glass", () => {
    const glass = new GooGlassSim(() => 0.5);
    const p = params("mercury");
    glass.land([hit(500, 100, 14)], p);
    run(glass, 1, p);
    expect(glass.splats.some((s) => s.y > 140)).toBe(true);
    expect(glass.streaks).toHaveLength(0);
  });

  it("merges splats that touch into one holding both", () => {
    const glass = new GooGlassSim(() => 0.5);
    const p = params();
    glass.land([hit(500, 500, 2), hit(503, 500, 2)], p);
    glass.step(FRAME, p, BOUNDS);
    expect(glass.splats).toHaveLength(1);
    expect(splatRadius(glass.splats[0]!)).toBeGreaterThan(1.6 * 2 * 1.2);
  });

  it("fades splats off a crowded glass instead of popping them", () => {
    const glass = new GooGlassSim(() => 0.5);
    const p = params();
    const impacts = [];
    for (let i = 0; i < GOO_MAX_SPLATS - 4; i++) {
      impacts.push(hit(20 + (i % 40) * 24, 20 + Math.floor(i / 40) * 24, 2));
    }
    glass.land(impacts, p);
    const before = glass.splats.length;
    glass.step(FRAME, p, BOUNDS);
    expect(glass.splats.length).toBe(before);
    run(glass, 4, p);
    expect(glass.splats.length).toBeLessThan(before);
    expect(glass.splats.length).toBeLessThanOrEqual(GOO_MAX_SPLATS);
  });
});
