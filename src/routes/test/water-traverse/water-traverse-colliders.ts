/**
 * Physics for the Water Traverse.
 *
 * The terrain program owns every rect; this module only turns rects into
 * Rapier box descriptors. Ramps become rotated slabs rather than stacked
 * steps: the descent drops 18 m and a stair of auto-steppable risers would
 * either be hundreds of boxes or leave the visitor's feet floating half a
 * metre above the visible slope. The character controller climbs to 70°, so a
 * true 24° slab is well inside its budget.
 */

import {
  buildWaterTraverseLayout,
  type FloorRect,
  type WallRect,
  type WaterTraverseLayout,
  type WorldRect,
} from "#lib/features/water-traverse/data/water-traverse-terrain.js";

export interface TraverseCollider {
  id: string;
  position: [number, number, number];
  size: [number, number, number];
  /** Quaternion. Present only for ramp slabs. */
  rotation?: { x: number; y: number; z: number; w: number };
}

/**
 * The sculpted seabed. Separate from TraverseCollider because it is a triangle
 * soup, not a box: it has no centre, no extent and no rotation to speak of, and
 * pretending otherwise is what produced a staircase the first time round.
 *
 * Its vertices are already in world coordinates, so the body it hangs off sits
 * at the origin.
 */
export interface TraverseTrimeshCollider {
  id: string;
  vertices: Float32Array;
  indices: Uint32Array;
}

/** Slab thickness for floors. Deep enough that nothing tunnels through it. */
const FLOOR_THICKNESS = 1.2;

function centre(r: WorldRect): { x: number; z: number } {
  return { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 };
}

function spanX(r: WorldRect): number {
  return r.maxX - r.minX;
}

function spanZ(r: WorldRect): number {
  return r.maxZ - r.minZ;
}

/** Rotation about X by `angle`, as a quaternion. */
function pitchQuaternion(angle: number): {
  x: number;
  y: number;
  z: number;
  w: number;
} {
  return { x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) };
}

function floorCollider(floor: FloorRect): TraverseCollider {
  const c = centre(floor.rect);
  const width = spanX(floor.rect);
  const run = spanZ(floor.rect);

  if (floor.kind === "flat") {
    return {
      id: floor.id,
      position: [c.x, floor.fromY - FLOOR_THICKNESS / 2, c.z],
      size: [width, FLOOR_THICKNESS, run],
    };
  }

  const rise = floor.toY - floor.fromY;
  const length = Math.hypot(run, rise);
  // Rapier's +Z is the slab's own length axis. A positive rise as Z increases
  // means the far end is higher, which is a rotation of -atan2(rise, run)
  // about X.
  const pitch = -Math.atan2(rise, run);

  // Sink the slab along its OWN normal, not world -Y, so the walkable face
  // lands exactly on the authored slope instead of a few centimetres under it.
  const normalY = run / length;
  const normalZ = -rise / length;

  return {
    id: floor.id,
    position: [
      c.x,
      (floor.fromY + floor.toY) / 2 - (normalY * FLOOR_THICKNESS) / 2,
      c.z - (normalZ * FLOOR_THICKNESS) / 2,
    ],
    size: [width, FLOOR_THICKNESS, length],
    rotation: pitchQuaternion(pitch),
  };
}

function wallCollider(wall: WallRect): TraverseCollider {
  const c = centre(wall.rect);
  return {
    id: wall.id,
    position: [c.x, (wall.baseY + wall.topY) / 2, c.z],
    size: [spanX(wall.rect), wall.topY - wall.baseY, spanZ(wall.rect)],
  };
}

export interface WaterTraverseSetup {
  layout: WaterTraverseLayout;
  colliders: TraverseCollider[];
  trimeshes: TraverseTrimeshCollider[];
  spawn: { x: number; y: number; z: number; yaw: number };
}

export function buildWaterTraverseSetup(): WaterTraverseSetup {
  const layout = buildWaterTraverseLayout();

  return {
    layout,
    colliders: [
      ...layout.floorRects.map(floorCollider),
      ...layout.wallRects.map(wallCollider),
    ],
    // The seabed is gated off at chamber scale (the terrain module exports an
    // empty mesh until the height field is re-baked); a zero-triangle trimesh
    // is a degenerate Rapier collider, so it is omitted rather than passed.
    trimeshes:
      layout.seabedMesh.triangleCount > 0
        ? [
            {
              id: "seabed",
              vertices: layout.seabedMesh.vertices,
              indices: layout.seabedMesh.indices,
            },
          ]
        : [],
    spawn: layout.spawn,
  };
}
