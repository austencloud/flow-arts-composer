/**
 * The Air chimney: geometry invariants plus simulated travel in both columns.
 *
 * The gate this file guards is not "does it compile". It is the set of claims
 * the room's design rests on:
 *
 *  1. Air is the ONLY way up. If a ramp or a walkable slope ever reappears, the
 *     room is back to the version Austen rejected on 2026-08-05 — *"why would I
 *     go up the ramp to get to the airlift"*.
 *  2. Walking under a ledge leaves you on the floor. That is the bug the old
 *     room hid behind head-height rock rims, and those rims were the wall
 *     standing between the door and the shaft.
 *  3. The performers stay unreachable, because the void is the barrier.
 *  4. A visitor who never presses jump gets up AND back down.
 */
import { describe, it, expect } from "vitest";
import { buildVulcanCaveFloorPlan } from "#lib/features/museum/data/vulcan-cave-floor-plan.js";
import {
  buildAirChimneyLayout,
  createAirChimneyTerrain,
  AIR_FLOOR_Y,
  LEDGE_YS,
  OVERLOOK_Y,
  UPDRAFT_CEILING_PLAYER_Y,
  UPDRAFT_SPEED,
  SINK_SPEED,
} from "#lib/features/museum/data/air-chimney-layout.js";
import { STANDING_Y } from "#lib/features/museum/services/museum-physics-provider.js";

const plan = buildVulcanCaveFloorPlan();
const grid = plan.grid;
const layout = buildAirChimneyLayout(grid)!;
const terrain = createAirChimneyTerrain(grid)!;

/** Mirrors the UCC's ease so the simulation matches what the player feels. */
const UPDRAFT_RISE_EASE = 6;
const DT = 1 / 60;
/** 9 m of rise at 1 m/s cannot physically take less than this. */
const MIN_RISE_SECONDS = 6;

/**
 * Stand in a column and press nothing, exactly as the UCC does: ease vertical
 * velocity toward the terrain's reported speed, integrate, and clamp to the
 * floor the terrain reports for the CURRENT feet — the Y-aware seam.
 */
function ride(
  x: number,
  z: number,
  startFeetY: number,
  maxSeconds: number
): { feetY: number; seconds: number } {
  let feetY = startFeetY;
  let verticalVelocity = 0;
  let seconds = 0;
  while (seconds < maxSeconds) {
    const lift = terrain.updraftAt!(x, z, feetY + STANDING_Y);
    if (lift !== 0) {
      verticalVelocity +=
        (lift - verticalVelocity) * Math.min(1, UPDRAFT_RISE_EASE * DT);
    } else {
      verticalVelocity = 0;
    }
    const floor = terrain.elevationAt(x, z, feetY);
    feetY = Math.max(feetY + verticalVelocity * DT, floor);
    seconds += DT;
    if (lift > 0 && feetY >= OVERLOOK_Y - 0.02) break;
    if (lift < 0 && feetY <= AIR_FLOOR_Y + 0.02) break;
  }
  return { feetY, seconds };
}

describe("Air chimney — the lift is the traversal", () => {
  it("has no ramp: every floor surface is flat", () => {
    // A ramp anywhere means someone reintroduced the climb this room exists
    // without. Air moves the visitor vertically; feet only do the flat.
    expect(layout.floorRects.filter((f) => f.kind !== "flat")).toEqual([]);
  });

  it("blocks nothing — the barrier is open air, not rock rims", () => {
    for (const probe of Object.values(layout.probes)) {
      expect(terrain.blockedAt(probe.x, probe.z)).toBe(false);
    }
  });

  it("leaves the floor open beneath the overlook and every ledge", () => {
    // The bug the rims were hiding: elevationAt was 2D and the physics clamp
    // treats its answer as a minimum, so standing here teleported the player
    // onto the surface overhead.
    const under = layout.probes.underOverlook;
    expect(terrain.elevationAt(under.x, under.z, AIR_FLOOR_Y)).toBeCloseTo(
      AIR_FLOOR_Y,
      5
    );
    for (const ledge of layout.ledges) {
      expect(
        terrain.elevationAt(ledge.anchor.x, ledge.anchor.z, AIR_FLOOR_Y)
      ).toBeCloseTo(AIR_FLOOR_Y, 5);
    }
  });

  it("still puts a surface underfoot when the player is actually up there", () => {
    const over = layout.probes.overlook;
    expect(terrain.elevationAt(over.x, over.z, OVERLOOK_Y)).toBeCloseTo(
      OVERLOOK_Y,
      5
    );
    for (const ledge of layout.ledges) {
      expect(
        terrain.elevationAt(ledge.anchor.x, ledge.anchor.z, ledge.y)
      ).toBeCloseTo(ledge.y, 5);
    }
  });

  it("keeps open air between the rise column and every performer ledge", () => {
    for (const ledge of layout.ledges) {
      const gap =
        ledge.wall === "west"
          ? layout.riseCentre.x - layout.riseRadius - ledge.rect.maxX
          : ledge.rect.minX - (layout.riseCentre.x + layout.riseRadius);
      expect(gap).toBeGreaterThanOrEqual(1.8);
    }
  });

  it("puts the three ledges at three separated heights, low to high", () => {
    const ys = layout.ledges.map((l) => l.y);
    expect(ys).toEqual([...LEDGE_YS]);
    for (let i = 1; i < ys.length; i += 1) {
      expect(ys[i]! - ys[i - 1]!).toBeGreaterThan(1.5);
    }
    expect(ys[ys.length - 1]!).toBeLessThan(OVERLOOK_Y);
  });

  it("keeps every ledge on one wall, staggered along Z", () => {
    // They alternated walls once. At ~6 m to either side that put the
    // performers outside the view cone — from the floor you could not see one —
    // and the ride became a 180° whip between pairs. One wall, climbing away as
    // a diagonal, is what makes all three readable at once.
    const walls = new Set(layout.ledges.map((l) => l.wall));
    expect(walls.size).toBe(1);
    const zs = layout.ledges.map((l) => (l.rect.minZ + l.rect.maxZ) / 2);
    for (let i = 1; i < zs.length; i += 1) {
      expect(zs[i]).toBeGreaterThan(zs[i - 1]!);
    }
  });

  it("keeps the performers inside a natural view cone from the shaft", () => {
    // Lateral offset from the column centre. Beyond ~7 m the pair falls outside
    // a 75° FOV at eye level and the eye-level pairing stops working.
    for (const ledge of layout.ledges) {
      const lateral = Math.abs(ledge.anchor.x - layout.riseCentre.x);
      expect(lateral).toBeLessThanOrEqual(7);
    }
  });

  it("carries a visitor from the floor to the overlook with no jump input", () => {
    const { feetY, seconds } = ride(
      layout.riseCentre.x,
      layout.riseCentre.z,
      AIR_FLOOR_Y,
      30
    );
    expect(feetY).toBeGreaterThanOrEqual(OVERLOOK_Y - 0.05);
    // Generous bounds on purpose: the rate is a tuning constant Austen has not
    // signed off on, so this guards "it arrives", not a particular feel.
    expect(seconds).toBeGreaterThan(MIN_RISE_SECONDS);
    expect(seconds).toBeLessThan(14);
  });

  it("sets a visitor back down on the floor through the sink column", () => {
    const { feetY } = ride(
      layout.sinkCentre.x,
      layout.sinkCentre.z,
      OVERLOOK_Y,
      30
    );
    expect(feetY).toBeCloseTo(AIR_FLOOR_Y, 1);
  });

  it("stops lifting at the overlook instead of hovering past it", () => {
    expect(
      terrain.updraftAt!(
        layout.riseCentre.x,
        layout.riseCentre.z,
        UPDRAFT_CEILING_PLAYER_Y + 0.01
      )
    ).toBe(0);
  });

  it("reports lift only inside the columns, and the right sign in each", () => {
    expect(
      terrain.updraftAt!(layout.riseCentre.x, layout.riseCentre.z, STANDING_Y)
    ).toBeCloseTo(UPDRAFT_SPEED, 5);
    expect(
      terrain.updraftAt!(
        layout.sinkCentre.x,
        layout.sinkCentre.z,
        OVERLOOK_Y + STANDING_Y
      )
    ).toBeCloseTo(-SINK_SPEED, 5);
    const entry = layout.probes.entry;
    expect(terrain.updraftAt!(entry.x, entry.z, STANDING_Y)).toBe(0);
  });

  it("does not drag at the visitor once they are down and walking out", () => {
    const exit = layout.probes.exit;
    expect(terrain.updraftAt!(exit.x, exit.z, STANDING_Y)).toBe(0);
    expect(
      terrain.updraftAt!(
        layout.sinkCentre.x,
        layout.sinkCentre.z,
        AIR_FLOOR_Y + STANDING_Y
      )
    ).toBe(0);
  });
});
