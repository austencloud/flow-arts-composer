import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeRng } from "#lib/shared/foundation/utils/seeded-rng.js";
import { parseFlowFestRuntimeContract } from "../../src/routes/test/flow-fest-graybox/flow-fest-runtime-contract";
import {
  allFlowFestCampPlanLines,
  createFlowFestCampPlan,
  flowFestCampPlanLineToRuntimeSegment,
  FLOW_FEST_LOWER_CAMPGROUND_OCCUPANCY,
} from "../../src/routes/test/flow-fest-sim/flow-fest-camp-plan";
import { deriveFlowFestLowerCampOccupancy } from "../../src/routes/test/flow-fest-sim/flow-fest-lower-camp-occupancy";
import { flowFestParkedCarModel } from "../../src/routes/test/flow-fest-sim/flow-fest-parked-cars";

const contract = parseFlowFestRuntimeContract(
  JSON.parse(
    readFileSync(
      "static/data/flow-fest-sim/gate2-runtime-contract.json",
      "utf8"
    )
  )
);
const plan = createFlowFestCampPlan(contract, "car-camp");
const loop = plan.internalDrives.find(
  (drive) => drive.id === "lower-campground-loop"
)!;
const routes = allFlowFestCampPlanLines(plan).map(
  flowFestCampPlanLineToRuntimeSegment
);

describe("Flow Fest lower campground occupancy", () => {
  it("derives deterministic car, roadside, and tree-line bands from the loop", () => {
    const first = deriveFlowFestLowerCampOccupancy({
      rng: makeRng(20260828),
      loop,
      routes,
    });
    const second = deriveFlowFestLowerCampOccupancy({
      rng: makeRng(20260828),
      loop,
      routes,
    });

    expect(first).toEqual(second);
    expect(first.centerVehicles).toHaveLength(
      FLOW_FEST_LOWER_CAMPGROUND_OCCUPANCY.centerVehicleCount
    );
    expect(first.centerTents).toHaveLength(
      FLOW_FEST_LOWER_CAMPGROUND_OCCUPANCY.centerTentCount
    );
    expect(first.centerCanopies).toHaveLength(
      FLOW_FEST_LOWER_CAMPGROUND_OCCUPANCY.centerCanopyCount
    );
    expect(first.innerRoadsideTents).toHaveLength(
      FLOW_FEST_LOWER_CAMPGROUND_OCCUPANCY.innerRoadsideTentCount
    );
    expect(first.outerTreeLineTents).toHaveLength(
      FLOW_FEST_LOWER_CAMPGROUND_OCCUPANCY.outerTreeLineTentCount
    );
    expect(first.audit).toMatchObject({
      centerVehicleOutsideLoopCount: 0,
      centerVehicleAisleIntrusionCount: 0,
      centerVehicleWalkLaneIntrusionCount: 0,
      centerGearWalkLaneIntrusionCount: 0,
      innerRoadsideTentOutsideLoopCount: 0,
      outerTreeLineTentInsideLoopCount: 0,
    });
    expect(first.audit.centerVehicleEmptyStallCount).toBeGreaterThan(0);
  });

  it("parks two rows per side of a central drive with mixed bodies, paints, and facing", () => {
    const layout = deriveFlowFestLowerCampOccupancy({
      rng: makeRng(20260828),
      loop,
      routes,
    });
    const rows = new Set(layout.centerVehicles.map((car) => car.row));
    expect(rows.size).toBe(4);
    expect(
      new Set(layout.centerVehicles.map((car) => car.modelId)).size
    ).toBeGreaterThanOrEqual(5);
    expect(
      layout.centerVehicles.filter((car) => car.facing === "backed-in").length
    ).toBeGreaterThan(0);
    expect(
      layout.centerVehicles.filter((car) => car.crooked).length
    ).toBe(4);
    for (const row of rows) {
      const rowCars = layout.centerVehicles
        .filter((car) => car.row === row)
        .sort((first, second) => first.stall - second.stall);
      for (let index = 1; index < rowCars.length; index += 1) {
        expect(rowCars[index]!.modelId).not.toBe(rowCars[index - 1]!.modelId);
      }
    }
    for (const car of layout.centerVehicles) {
      const model = flowFestParkedCarModel(car.modelId);
      expect(car.paintIndex).toBeGreaterThanOrEqual(0);
      expect(car.paintIndex).toBeLessThan(
        Math.max(1, model.paint?.variants.length ?? 1)
      );
    }
    // Every car keeps a stall's worth of room from every other car.
    for (const [index, car] of layout.centerVehicles.entries()) {
      for (const other of layout.centerVehicles.slice(index + 1)) {
        expect(Math.hypot(car.x - other.x, car.z - other.z)).toBeGreaterThan(
          3.3
        );
      }
    }
  });

  it("sets tents and canopies off a tailgate without blocking the walk lane", () => {
    const layout = deriveFlowFestLowerCampOccupancy({
      rng: makeRng(20260828),
      loop,
      routes,
    });
    const nearestCar = (point: { x: number; z: number }) =>
      layout.centerVehicles.reduce(
        (best, car) => {
          const distance = Math.hypot(car.x - point.x, car.z - point.z);
          return distance < best.distance ? { car, distance } : best;
        },
        { car: layout.centerVehicles[0]!, distance: Number.POSITIVE_INFINITY }
      );
    for (const tent of layout.centerTents) {
      const { car, distance } = nearestCar(tent);
      const halfLength = flowFestParkedCarModel(car.modelId).lengthMeters / 2;
      expect(car.facing).toBe("nose-in");
      expect(distance).toBeGreaterThanOrEqual(halfLength + 2.5);
      expect(distance).toBeLessThan(halfLength + 2.8);
    }
    for (const canopy of layout.centerCanopies) {
      const { car, distance } = nearestCar(canopy);
      const halfLength = flowFestParkedCarModel(car.modelId).lengthMeters / 2;
      expect(car.facing).toBe("nose-in");
      expect(distance).toBeGreaterThanOrEqual(halfLength + 1.9);
      expect(distance).toBeLessThan(halfLength + 2.2);
    }
    const gear = [...layout.centerTents, ...layout.centerCanopies];
    for (const [index, item] of gear.entries()) {
      for (const other of gear.slice(index + 1)) {
        expect(
          Math.hypot(item.x - other.x, item.z - other.z)
        ).toBeGreaterThanOrEqual(3.4);
      }
    }
  });

  it("keeps the gate check-in apron free of parked cars", () => {
    const camera = contract.reviewCameras.find(
      (candidate) => candidate.id === "lower-gate"
    )!;
    const apron = {
      x: camera.positionWorld[0],
      z: camera.positionWorld[2],
      radiusMeters: 10,
    };
    const layout = deriveFlowFestLowerCampOccupancy({
      rng: makeRng(20260828),
      loop,
      routes,
      keepClear: [apron],
    });
    expect(layout.centerVehicles).toHaveLength(
      FLOW_FEST_LOWER_CAMPGROUND_OCCUPANCY.centerVehicleCount
    );
    for (const car of layout.centerVehicles) {
      expect(Math.hypot(car.x - apron.x, car.z - apron.z)).toBeGreaterThanOrEqual(
        apron.radiusMeters
      );
    }
  });
});
