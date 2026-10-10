import { describe, expect, it } from "vitest";
import { buildFirstFireBlenderContract } from "#lib/features/museum/data/first-fire-blender-contract.js";
import {
  buildFirstFireGrayboxColliders,
  FIRST_FIRE_GRAYBOX_SPAWN,
} from "../../../src/routes/test/first-fire-graybox/first-fire-graybox-colliders";

describe("First Fire Cinder Court collision scaffold", () => {
  const contract = buildFirstFireBlenderContract();
  const colliders = buildFirstFireGrayboxColliders(contract);

  it("spawns at the Water threshold inside the isolated 58 by 44 metre shell", () => {
    expect(contract.room.width).toBe(58);
    expect(contract.room.depth).toBe(44);
    expect(FIRST_FIRE_GRAYBOX_SPAWN.x).toBeGreaterThan(
      contract.room.blenderBounds.minX
    );
    expect(FIRST_FIRE_GRAYBOX_SPAWN.x).toBeLessThan(-26);
    expect(FIRST_FIRE_GRAYBOX_SPAWN.z).toBeCloseTo(
      -contract.doors.water.blender.y,
      12
    );
    expect(FIRST_FIRE_GRAYBOX_SPAWN.yaw).toBe(Math.PI / 2);
  });

  it("is the outer envelope only, with nothing from fire", () => {
    expect(
      colliders.filter((collider) => collider.source === "shell")
    ).toHaveLength(9);
    expect(colliders).toHaveLength(9);
    expect(
      colliders.some((collider) => /fire|flame|trench|magma/i.test(collider.id))
    ).toBe(false);
  });

  it("emits no collider from the pre-carve basalt outlines", () => {
    // The authored basalt polygons are the rock's silhouette BEFORE the courts
    // and corridors were cut out of it, and no basalt mesh is exported at all.
    // One box per polygon edge sealed chambers the visitor could see were open,
    // so rock collision moved to the carved mesh itself. If an edge collider
    // ever comes back, the room stops matching the model again.
    expect(contract.basalt.length).toBeGreaterThan(0);
    for (const mass of contract.basalt) {
      expect(
        colliders.some((collider) => collider.id.startsWith(`${mass.id}-edge-`))
      ).toBe(false);
    }
  });

  it("leaves both measured four-metre door spans open", () => {
    for (const side of ["water", "earth"] as const) {
      const north = colliders.find(
        (collider) => collider.id === `${side}-wall-north`
      )!;
      const south = colliders.find(
        (collider) => collider.id === `${side}-wall-south`
      )!;
      const gap =
        south.position[2] -
        south.size[2] / 2 -
        (north.position[2] + north.size[2] / 2);
      expect(gap).toBeCloseTo(contract.doors[side].clearWidth, 12);
      expect(gap).toBeCloseTo(4, 12);
    }
  });
});
