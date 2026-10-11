import { describe, expect, it } from "vitest";

import type { AuthoredPointLightPlan } from "#lib/features/museum/services/museum-room-light-pool.js";
import {
  blendAuthoredPointLightPool,
  createEmptyAuthoredPointLightPool,
  MAX_AUTHORED_POINT_LIGHTS,
  selectAuthoredPointLights,
} from "#lib/features/museum/services/museum-room-light-pool.js";

const waterPlan: AuthoredPointLightPlan = {
  roomIds: ["cave-water"],
  lights: [
    { x: 8, y: 2, z: 0, color: "#0000ff", intensity: 8, distance: 9 },
    { x: 2, y: 2, z: 0, color: "#00ffff", intensity: 6, distance: 7 },
    { x: 4, y: 2, z: 0, color: "#0088ff", intensity: 5, distance: 8 },
    { x: 6, y: 2, z: 0, color: "#0044ff", intensity: 4, distance: 8 },
  ],
};

describe("museum authored point-light pool", () => {
  it("returns the same empty slot count for a corridor instead of enabling room plans", () => {
    const slots = selectAuthoredPointLights(null, 0, 0, [waterPlan], 0);

    expect(slots).toHaveLength(MAX_AUTHORED_POINT_LIGHTS);
    expect(slots.every((slot) => slot.intensity === 0)).toBe(true);
  });

  it("selects only the nearest lights belonging to the active room", () => {
    const unrelated: AuthoredPointLightPlan = {
      roomIds: ["cave-fire"],
      lights: [
        { x: 0, y: 2, z: 0, color: "#ff0000", intensity: 99, distance: 20 },
      ],
    };

    const slots = selectAuthoredPointLights(
      "cave-water",
      0,
      0,
      [waterPlan, unrelated],
      0
    );

    expect(slots).toHaveLength(MAX_AUTHORED_POINT_LIGHTS);
    expect(slots.map((slot) => slot.x)).toEqual([2, 4, 6]);
    expect(slots.some((slot) => slot.color === "#ff0000")).toBe(false);
  });

  it("blends uniforms without changing the permanent slot count", () => {
    const current = createEmptyAuthoredPointLightPool();
    const target = selectAuthoredPointLights(
      "cave-water",
      0,
      0,
      [waterPlan],
      0
    );
    const halfway = blendAuthoredPointLightPool(current, target, 0.5);

    expect(halfway).toHaveLength(MAX_AUTHORED_POINT_LIGHTS);
    expect(halfway[0]?.x).toBe(1);
    expect(halfway[0]?.intensity).toBe(3);
    expect(halfway[0]?.color).toBe("#008080");
  });

  it("keeps authored pulse modulation inside the existing slots", () => {
    const pulsing: AuthoredPointLightPlan = {
      roomIds: ["cave-fire"],
      lights: [
        {
          x: 1,
          y: 2,
          z: 1,
          color: "#ff6600",
          intensity: 10,
          distance: 8,
          modulationHz: 1,
          modulationDepth: 0.5,
        },
      ],
    };

    const quarterCycle = selectAuthoredPointLights(
      "cave-fire",
      0,
      0,
      [pulsing],
      0.25
    );

    expect(quarterCycle[0]?.intensity).toBeCloseTo(15);
    expect(quarterCycle).toHaveLength(MAX_AUTHORED_POINT_LIGHTS);
  });
});
