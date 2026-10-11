/**
 * Collision scaffold for the standalone Drowned Gallery walk route.
 *
 * The GLB is visual only. Colliders rebuild from buildDrownedGalleryLayout —
 * the same call the Blender manifest serialises — translated to the GLB's
 * authoring origin (the water bay centre), so physics and the Blender geometry
 * cannot drift apart. Ramps are single tilted slabs — see buildRampSlab.
 */
import { buildVulcanCaveFloorPlan } from "#lib/features/museum/data/vulcan-cave-floor-plan.js";
import {
  buildDrownedGalleryLayout,
  CAUSEWAY_Y,
  GALLERY_FLOOR_Y,
  GALLERY_ROOF_Y,
  type DrownedGalleryLayout,
  type WorldRect,
} from "#lib/features/museum/data/drowned-gallery-terrain.js";
import { MIN_UNCROSSABLE_BARRIER } from "#lib/features/museum/domain/museum-design-rules.js";

export interface DrownedGalleryCollider {
  id: string;
  shape: "box";
  position: [number, number, number];
  size: [number, number, number];
  /** Only ramps carry one. Absent means axis-aligned. */
  rotation?: { x: number; y: number; z: number; w: number };
}

const FLOOR_T = 0.5;
/**
 * How far a running jump carries horizontally. Any floor inside this radius of
 * a basin is a launch pad for it.
 */
export const JUMP_REACH_M = 2.5;

/**
 * Water basins are fenced with an invisible barrier derived from the jump arc,
 * never a guessed number, and measured from the HIGHEST floor that can launch
 * at them rather than from the causeway.
 *
 * Two bugs live in this one line's history. The hand-picked 1.1 m was shorter
 * than a jump apex plus the controller's 0.45 auto-step, so the player mounted
 * the fence and stood in the mirror pool. Rebasing it on CAUSEWAY_Y then still
 * missed the exit ramp, which climbs to the museum datum (0) within 1.5 m of
 * the pool's corner and clears a causeway-relative fence by 0.15 m. Both were
 * found by a sweep, not by eye — see museum-player-physics.test.ts.
 */
function fenceTopFor(layout: DrownedGalleryLayout, basin: WorldRect): number {
  let highestLaunch = CAUSEWAY_Y;
  for (const floor of layout.floorRects) {
    const r = floor.rect;
    const withinReach =
      r.minX - JUMP_REACH_M < basin.maxX &&
      r.maxX + JUMP_REACH_M > basin.minX &&
      r.minZ - JUMP_REACH_M < basin.maxZ &&
      r.maxZ + JUMP_REACH_M > basin.minZ;
    if (!withinReach) continue;
    highestLaunch = Math.max(highestLaunch, floor.fromY, floor.toY);
  }
  return highestLaunch + MIN_UNCROSSABLE_BARRIER;
}

export interface DrownedGalleryWalkSetup {
  layout: DrownedGalleryLayout;
  origin: { x: number; z: number };
  colliders: DrownedGalleryCollider[];
  spawn: { x: number; y: number; z: number; yaw: number };
}

export function buildDrownedGalleryWalkSetup(): DrownedGalleryWalkSetup {
  const plan = buildVulcanCaveFloorPlan();
  const layout = buildDrownedGalleryLayout(plan.grid);
  if (!layout) {
    throw new Error("Drowned gallery layout missing from the compiled cave grid");
  }

  const origin = {
    x: (layout.bayBounds.minX + layout.bayBounds.maxX) / 2,
    z: (layout.bayBounds.minZ + layout.bayBounds.maxZ) / 2,
  };

  const colliders: DrownedGalleryCollider[] = [];
  const box = (
    id: string,
    rect: WorldRect,
    baseY: number,
    topY: number
  ): void => {
    const w = rect.maxX - rect.minX;
    const d = rect.maxZ - rect.minZ;
    const h = topY - baseY;
    if (w <= 0.005 || d <= 0.005 || h <= 0.005) return;
    colliders.push({
      id,
      shape: "box",
      position: [
        (rect.minX + rect.maxX) / 2 - origin.x,
        baseY + h / 2,
        (rect.minZ + rect.maxZ) / 2 - origin.z,
      ],
      size: [w, h, d],
    });
  };

  /**
   * A ramp is ONE tilted slab, never a stack of steps.
   *
   * Step stacks were the original shape here, and they made the surfacing
   * stair unwalkable: 0.35 m risers sit close enough to the walker's 0.45 m
   * auto-step that Rapier's step-up loses to the gravity term in the same
   * frame's desired motion, and the player sticks against a riser until they
   * jump. Austen hit it surfacing out of the flooded gallery, which is the
   * worst possible place for it — that beat is supposed to be one unbroken
   * walk up into the air.
   *
   * The slab's top face IS the ramp line, so the joins with the flat floors
   * above and below are exactly flush and there is no riser to step over at
   * all. Its footprint is identical to the rect: half-length L/2 projected
   * back onto the run axis is run/2 by construction.
   */
  const rampSlab = (
    id: string,
    floor: { kind: string; rect: WorldRect; fromY: number; toY: number }
  ): void => {
    const { rect } = floor;
    const width = rect.maxX - rect.minX;
    const depth = rect.maxZ - rect.minZ;
    const rise = floor.toY - floor.fromY;
    const midY = (floor.fromY + floor.toY) / 2;
    const cx = (rect.minX + rect.maxX) / 2 - origin.x;
    const cz = (rect.minZ + rect.maxZ) / 2 - origin.z;
    const half = FLOOR_T / 2;

    if (floor.kind === "ramp-z") {
      // fromY sits at minZ, toY at maxZ. Rotating by -theta about X sends the
      // slab's local +Z to (0, sin theta, cos theta) — the ramp's direction.
      const theta = Math.atan2(rise, depth);
      const a = -theta;
      colliders.push({
        id,
        shape: "box",
        position: [cx, midY - half * Math.cos(a), cz - half * Math.sin(a)],
        size: [width, FLOOR_T, Math.hypot(depth, rise)],
        rotation: { x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) },
      });
      return;
    }

    // ramp-x: fromY at minX, toY at maxX. Rotating by +theta about Z sends the
    // slab's local +X to (cos theta, sin theta, 0).
    const theta = Math.atan2(rise, width);
    colliders.push({
      id,
      shape: "box",
      position: [
        cx + half * Math.sin(theta),
        midY - half * Math.cos(theta),
        cz,
      ],
      size: [Math.hypot(width, rise), FLOOR_T, depth],
      rotation: { x: 0, y: 0, z: Math.sin(theta / 2), w: Math.cos(theta / 2) },
    });
  };

  for (const floor of layout.floorRects) {
    if (["pool-bottom", "channel-bed", "shore-shelf"].includes(floor.id)) {
      continue; // basins are fenced below, not walked
    }
    if (floor.kind === "flat") {
      box(`floor-${floor.id}`, floor.rect, floor.fromY - FLOOR_T, floor.fromY);
      continue;
    }
    rampSlab(`floor-${floor.id}`, floor);
  }

  for (const wall of layout.wallRects) {
    box(`wall-${wall.id}`, wall.rect, wall.baseY, wall.topY);
  }
  layout.rockFill.forEach((rect, index) => {
    box(`rock-${index}`, rect, GALLERY_FLOOR_Y - 0.5, GALLERY_ROOF_Y);
  });
  layout.thresholdJambs.forEach((rect, index) => {
    box(`jamb-${index}`, rect, CAUSEWAY_Y, CAUSEWAY_Y + 3.4);
  });
  layout.balustrades.forEach((rect, index) => {
    box(`rail-${index}`, rect, CAUSEWAY_Y, CAUSEWAY_Y + 0.9);
  });
  // Water basins and the alcove shore stay unwalkable, as in the museum. Each
  // fence is sized against the highest floor that can jump at THAT basin.
  box(
    "barrier-pool",
    layout.pool,
    layout.waterVolumes.at(-1)!.floorY,
    fenceTopFor(layout, layout.pool)
  );
  box(
    "barrier-channel",
    layout.channel,
    -2.7,
    fenceTopFor(layout, layout.channel)
  );
  box("barrier-shore", layout.shore, -1.0, fenceTopFor(layout, layout.shore));

  const approach = layout.approach;
  const spawn = {
    x: (approach.minX + approach.maxX) / 2 - origin.x,
    y: 0.95,
    z: approach.maxZ - 1.2 - origin.z,
    yaw: Math.PI,
  };

  return { layout, origin, colliders, spawn };
}
