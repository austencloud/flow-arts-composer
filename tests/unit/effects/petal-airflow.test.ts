import { describe, expect, it } from "vitest";
import {
  addPetalWake2D,
  addPetalWake3D,
  resolvePetalAirflowPhrase,
  samplePetalAirflow2D,
  samplePetalAirflow3D,
  type PetalAirflow2D,
  type PetalAirflow3D,
} from "#lib/shared/effects/domain/petal-airflow.js";

describe("petal airflow", () => {
  it("keeps nearby petals in the same coherent current", () => {
    const a: PetalAirflow2D = { x: 0, y: 0, turn: 0 };
    const b: PetalAirflow2D = { x: 0, y: 0, turn: 0 };
    samplePetalAirflow2D(240, 180, 3.2, 1, a);
    samplePetalAirflow2D(244, 183, 3.2, 1, b);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(3);
    expect(a.x * b.x + a.y * b.y).toBeGreaterThan(0);
  });

  it("keeps phrasing bounded with a long-term average of one", () => {
    const samples = Array.from({ length: 3600 }, (_, index) =>
      resolvePetalAirflowPhrase(index / 60)
    );
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0.66);
    expect(Math.max(...samples)).toBeLessThanOrEqual(1.34);
    expect(
      samples.reduce((sum, value) => sum + value, 0) / samples.length
    ).toBeCloseTo(1, 1);
  });

  it("lets a close moving prop push a petal and ignores a distant one", () => {
    const close: PetalAirflow2D = { x: 0, y: 0, turn: 0 };
    const far: PetalAirflow2D = { x: 0, y: 0, turn: 0 };
    const source = { x: 100, y: 100, velocityX: 300, velocityY: 0 };
    addPetalWake2D(close, 112, 100, source, 1);
    addPetalWake2D(far, 400, 100, source, 1);
    expect(close.x).toBeGreaterThan(10);
    expect(far).toEqual({ x: 0, y: 0, turn: 0 });
  });

  it("returns finite restrained airflow and wakes in Three.js world units", () => {
    const flow: PetalAirflow3D = { x: 0, y: 0, z: 0, turn: 0 };
    samplePetalAirflow3D(0.4, 1.2, -0.6, 2.5, flow);
    addPetalWake3D(flow, 0.4, 1.2, -0.6, {
      x: 0.5,
      y: 1.2,
      z: -0.6,
      velocityX: 2,
      velocityY: 0.4,
      velocityZ: 0.2,
    });
    expect(Object.values(flow).every(Number.isFinite)).toBe(true);
    expect(Math.hypot(flow.x, flow.y, flow.z)).toBeLessThan(0.55);
  });
});
