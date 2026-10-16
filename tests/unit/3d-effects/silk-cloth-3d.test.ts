import { describe, expect, it } from "vitest";
import {
  SILK_CLOTH_COLUMNS,
  SILK_CLOTH_ROWS,
  SILK_CLOTH_VERTICES,
  SilkCloth3D,
  silkWidthProfile,
  type SilkClothSettings,
} from "#lib/shared/3d/effects/silk/silk-cloth-3d.js";

const SETTINGS: SilkClothSettings = { length: 1.3, width: 0.2, flutter: 0.3, tautness: 0.5 };
const KNOT = (SILK_CLOTH_COLUMNS - 1) / 2;
const DT = 1 / 60;

function point(cloth: SilkCloth3D, index: number) {
  return {
    x: cloth.positions[index * 3]!,
    y: cloth.positions[index * 3 + 1]!,
    z: cloth.positions[index * 3 + 2]!,
  };
}

function tailCenter(cloth: SilkCloth3D) {
  return point(cloth, (SILK_CLOTH_ROWS - 1) * SILK_CLOTH_COLUMNS + KNOT);
}

function allFinite(cloth: SilkCloth3D): boolean {
  return cloth.positions.every(Number.isFinite) && cloth.normals.every(Number.isFinite);
}

describe("SilkCloth3D", () => {
  it("is gathered at the knot and widest in the body", () => {
    expect(silkWidthProfile(0)).toBeLessThan(0.25);
    expect(silkWidthProfile(0.4)).toBeCloseTo(1, 5);
    expect(silkWidthProfile(1)).toBeLessThan(silkWidthProfile(0.4));
  });

  it("keeps the knot on the tip and the fabric finite through fast spinning", () => {
    const cloth = new SilkCloth3D(1);
    const tip = (t: number) => ({ x: 0.62 * Math.cos(7 * t), y: 1.25 + 0.62 * Math.sin(7 * t), z: 0 });
    cloth.reset(tip(0), { x: 0, y: -1, z: 0 }, SETTINGS);
    for (let frame = 1; frame <= 600; frame++) {
      const pin = tip(frame * DT);
      cloth.step(pin, DT, SETTINGS, 0);
      const knot = point(cloth, KNOT);
      expect(Math.hypot(knot.x - pin.x, knot.y - pin.y, knot.z - pin.z)).toBeLessThan(1e-6);
    }
    expect(allFinite(cloth)).toBe(true);
    // The fabric holds its length instead of stretching out under the spin.
    const tail = tailCenter(cloth);
    const knot = point(cloth, KNOT);
    expect(Math.hypot(tail.x - knot.x, tail.y - knot.y, tail.z - knot.z)).toBeLessThan(SETTINGS.length * 1.15);
  });

  it("hangs down from a still tip and rests on the floor instead of sinking", () => {
    const cloth = new SilkCloth3D(2);
    const pin = { x: 0, y: 1, z: 0 };
    cloth.reset(pin, { x: 1, y: 0, z: 0 }, SETTINGS);
    for (let frame = 0; frame < 240; frame++) cloth.step(pin, DT, SETTINGS, 0);
    for (let index = 0; index < SILK_CLOTH_VERTICES; index++) {
      expect(point(cloth, index).y).toBeGreaterThanOrEqual(0);
    }
    // 1.3 m of silk from a 1 m tip: the tail ends up lying on the floor.
    expect(tailCenter(cloth).y).toBeLessThan(0.02);
    expect(Math.abs(tailCenter(cloth).x)).toBeLessThan(0.6);
  });

  it("streams behind a tip that moves through the air", () => {
    const cloth = new SilkCloth3D(3);
    let pin = { x: 0, y: 2, z: 0 };
    cloth.reset(pin, { x: -1, y: 0, z: 0 }, SETTINGS);
    for (let frame = 0; frame < 120; frame++) {
      pin = { x: pin.x + 4 * DT, y: 2, z: 0 };
      cloth.step(pin, DT, SETTINGS, -10);
    }
    const tail = tailCenter(cloth);
    // Air pushes the tail back along the path, not just straight down.
    expect(pin.x - tail.x).toBeGreaterThan(0.4);
    expect(allFinite(cloth)).toBe(true);
  });

  it("falls freely once it is let go", () => {
    const cloth = new SilkCloth3D(4);
    const pin = { x: 0, y: 2, z: 0 };
    cloth.reset(pin, { x: 0, y: -1, z: 0 }, SETTINGS);
    for (let frame = 0; frame < 30; frame++) cloth.step(pin, DT, SETTINGS, 0);
    for (let frame = 0; frame < 30; frame++) cloth.step(null, DT, SETTINGS, 0);
    expect(point(cloth, KNOT).y).toBeLessThan(1.95);
    expect(allFinite(cloth)).toBe(true);
  });

  it("stays finite when the step is zero or the tip does not move at all", () => {
    const cloth = new SilkCloth3D(5);
    const pin = { x: 0, y: 1, z: 0 };
    cloth.reset(pin, { x: 0, y: 0, z: 0 }, SETTINGS);
    cloth.step(pin, 0, SETTINGS, 0);
    for (let frame = 0; frame < 60; frame++) cloth.step(pin, DT, SETTINGS, 0);
    expect(allFinite(cloth)).toBe(true);
  });
});
