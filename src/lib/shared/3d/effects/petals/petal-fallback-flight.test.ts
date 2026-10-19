import { describe, expect, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { resolvePetals3D } from "#lib/shared/effects/translators/webgl3d-translator.js";
import {
  advanceFallbackPetalBody,
  createFallbackPetalBody,
} from "./petal-fallback-flight.js";

describe("unpooled petal flight", () => {
  const params = resolvePetals3D(DEFAULT_EFFECTS_CONFIG.petals);

  it("keeps emitted and ambient petals finite with the current resolved params", () => {
    for (const velocity of [
      { x: 1, y: 0.5, z: -1 },
      { x: 0, y: -0.5, z: 0 },
    ]) {
      const body = createFallbackPetalBody(
        params,
        "rounded",
        0.05,
        { x: 0, y: 3, z: 0 },
        velocity,
        () => 0.5
      );
      expect([body.vx, body.vy, body.vz]).toEqual([
        velocity.x,
        velocity.y,
        velocity.z,
      ]);
      for (let frame = 0; frame < 120; frame++) {
        advanceFallbackPetalBody(body, frame / 60, 1 / 60);
        expect(Object.values(body).every(Number.isFinite)).toBe(true);
      }
      expect(body.y).toBeLessThan(3);
      expect(Math.hypot(body.qx, body.qy, body.qz, body.qw)).toBeCloseTo(1);
    }
  });

  it("does not move a paused petal", () => {
    const body = createFallbackPetalBody(
      params,
      "rounded",
      0.05,
      { x: 0, y: 3, z: 0 },
      { x: 1, y: -0.5, z: 0 },
      () => 0.5
    );
    const before = { ...body };
    advanceFallbackPetalBody(body, 10, 0);
    expect(body).toEqual(before);
  });
});
