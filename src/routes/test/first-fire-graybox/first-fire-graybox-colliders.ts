import type { FirstFireBlenderContract } from "#lib/features/museum/data/first-fire-blender-contract.js";

export const FIRST_FIRE_GRAYBOX_SPAWN = {
  x: -27,
  y: 0.88,
  z: 0,
  yaw: Math.PI / 2,
} as const;

export interface FirstFireGrayboxCollider {
  id: string;
  /**
   * Always "shell": these are the room's outer envelope. Rock inside it is the
   * carved mesh, which is not described here at all. The union used to also
   * carry "basalt" for the pre-carve mass outlines - see the note on
   * `buildFirstFireGrayboxColliders`.
   */
  source: "shell";
  shape: "box";
  position: [number, number, number];
  size: [number, number, number];
  rotation?: { x: number; y: number; z: number; w: number };
}

const WALL_THICKNESS = 0.6;
const WALL_HEIGHT = 8;
const FLOOR_THICKNESS = 0.5;

function box(
  id: string,
  source: FirstFireGrayboxCollider["source"],
  position: [number, number, number],
  size: [number, number, number],
  rotation?: FirstFireGrayboxCollider["rotation"]
): FirstFireGrayboxCollider {
  return {
    id,
    source,
    shape: "box",
    position,
    size,
    ...(rotation ? { rotation } : {}),
  };
}

function axisAlignedWall(
  id: string,
  axis: "x" | "z",
  fixed: number,
  start: number,
  end: number
): FirstFireGrayboxCollider {
  const length = end - start;
  const centre = start + length / 2;
  return axis === "x"
    ? box(
        id,
        "shell",
        [centre, WALL_HEIGHT / 2, fixed],
        [length, WALL_HEIGHT, WALL_THICKNESS]
      )
    : box(
        id,
        "shell",
        [fixed, WALL_HEIGHT / 2, centre],
        [WALL_THICKNESS, WALL_HEIGHT, length]
      );
}

/**
 * Collision for the isolated review shell.
 *
 * This builds the outer envelope only: the floor, the four room walls with
 * their two door gaps, and a stop a little beyond each door so the review walk
 * ends at the threshold instead of in the void. The rock inside that envelope
 * collides as the carved mesh - see `first-fire-shell-collider` - so a wall
 * that the carve removed stops blocking the moment it stops being drawn.
 *
 * It used to also emit one upright box per edge of every basalt mass's authored
 * polygon. Those polygons are the rock's silhouette BEFORE the courts and
 * corridors were cut from it, and no basalt mesh is exported at all
 * (`basaltMassesBuiltAsGeometry: 0`), so those colliders sealed chambers that
 * the visitor could plainly see were open. Removed 2026-08-10; the shell mesh
 * is the only description of where the rock is.
 *
 * Every fire guide remains intentionally walk-through.
 */
export function buildFirstFireGrayboxColliders(
  contract: FirstFireBlenderContract
): FirstFireGrayboxCollider[] {
  const { minX, maxX, minY: minZ, maxY: maxZ } = contract.room.blenderBounds;
  const waterDoorMinZ = -(
    contract.doors.water.blender.y +
    contract.doors.water.clearWidth / 2
  );
  const waterDoorMaxZ = -(
    contract.doors.water.blender.y -
    contract.doors.water.clearWidth / 2
  );
  const earthDoorMinZ = -(
    contract.doors.earth.blender.y +
    contract.doors.earth.clearWidth / 2
  );
  const earthDoorMaxZ = -(
    contract.doors.earth.blender.y -
    contract.doors.earth.clearWidth / 2
  );

  const colliders: FirstFireGrayboxCollider[] = [
    box(
      "floor",
      "shell",
      [0, -FLOOR_THICKNESS / 2, 0],
      [contract.room.width, FLOOR_THICKNESS, contract.room.depth]
    ),
    axisAlignedWall("north-wall", "x", minZ, minX, maxX),
    axisAlignedWall("south-wall", "x", maxZ, minX, maxX),
    axisAlignedWall("water-wall-north", "z", minX, minZ, waterDoorMinZ),
    axisAlignedWall("water-wall-south", "z", minX, waterDoorMaxZ, maxZ),
    axisAlignedWall("earth-wall-north", "z", maxX, minZ, earthDoorMinZ),
    axisAlignedWall("earth-wall-south", "z", maxX, earthDoorMaxZ, maxZ),
    axisAlignedWall(
      "water-threshold-stop",
      "z",
      minX - 1.6,
      waterDoorMinZ,
      waterDoorMaxZ
    ),
    axisAlignedWall(
      "earth-threshold-stop",
      "z",
      maxX + 1.6,
      earthDoorMinZ,
      earthDoorMaxZ
    ),
  ];

  return colliders;
}
