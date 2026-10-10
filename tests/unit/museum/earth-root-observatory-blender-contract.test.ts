import { describe, expect, it } from "vitest";
import {
  buildEarthRootObservatoryBlenderContract,
  earthRootObservatoryBlenderPointToPlan,
  earthRootObservatoryPlanPointToBlender,
} from "#lib/features/museum/data/earth-root-observatory-blender-contract.js";
import {
  buildNominalEarthRootObservatoryPlan,
  type EarthRootObservatoryPlan,
} from "#lib/features/museum/data/earth-root-observatory-plan.js";
import {
  createEarthRootObservatoryGrayboxTerrain,
  nearestEarthRootObservatoryRouteProjection,
} from "#lib/features/museum/data/earth-root-observatory-graybox-terrain.js";

describe("Earth Root Observatory Blender contract", () => {
  it("round-trips plan positions through Blender local space", () => {
    const roomCentre = { x: 99.75, z: 13.25 };
    const planPoint = { x: 89.75, z: 11.75 };
    const blender = earthRootObservatoryPlanPointToBlender(
      planPoint,
      roomCentre,
      0.6
    );

    expect(blender).toEqual({ x: -10, y: 1.5, z: 0.6 });
    expect(earthRootObservatoryBlenderPointToPlan(blender, roomCentre)).toEqual(
      planPoint
    );
  });

  it("derives the approved shell, route, cameras, and G/H/I identities", () => {
    const contract = buildEarthRootObservatoryBlenderContract();

    expect(contract.room.width).toBe(34);
    expect(contract.room.depth).toBe(24);
    expect(contract.route.path).toHaveLength(12);
    expect(contract.route.segments).toHaveLength(11);
    expect(contract.route.length).toBeCloseTo(79.4396, 3);
    expect(contract.route.walkingDurationSeconds).toBeCloseTo(24.8249, 3);
    expect(contract.performers.map((performer) => performer.label)).toEqual([
      "G",
      "H",
      "I",
    ]);
    expect(
      contract.performers.map((performer) => performer.sequenceId)
    ).toEqual(["cave-earth-seq-g", "cave-earth-seq-h", "cave-earth-seq-i"]);
    expect(
      contract.performers.map((performer) => performer.stageHeight)
    ).toEqual([0.62, 0.62, 0.62]);
    expect(
      contract.performers.every((performer) =>
        Number.isFinite(performer.facingAngle)
      )
    ).toBe(true);
    expect(contract.cameras.map((camera) => camera.id)).toEqual([
      "fire-threshold",
      "tree-reveal",
      "performer-g",
      "performer-h",
      "performer-i",
      "recognition-overlook",
      "air-exit",
      "overview",
      "plan",
    ]);
  });
});

describe("Earth Root Observatory graybox terrain", () => {
  const plan: EarthRootObservatoryPlan = buildNominalEarthRootObservatoryPlan();
  const terrain = createEarthRootObservatoryGrayboxTerrain(plan);

  it("keeps the full approved centreline walkable at its authored elevation", () => {
    for (const point of plan.walkPath) {
      expect(terrain.blockedAt(point.x, point.z)).toBe(false);
      expect(terrain.elevationAt(point.x, point.z)).toBeCloseTo(
        point.elevation,
        6
      );
    }
  });

  it("blocks the living basin so the visitor stays on the horseshoe", () => {
    expect(terrain.blockedAt(plan.tree.centre.x, plan.tree.centre.z)).toBe(
      true
    );
    for (const performer of plan.performers) {
      expect(terrain.blockedAt(performer.centre.x, performer.centre.z)).toBe(
        true
      );
    }
  });

  it("makes every interaction volume reachable from the approved route", () => {
    for (const performer of plan.performers) {
      const projection = nearestEarthRootObservatoryRouteProjection(
        plan,
        performer.centre
      );
      expect(projection.distance).toBeLessThanOrEqual(
        performer.interactionRadius + plan.routeWidth / 2
      );
    }
  });
});
