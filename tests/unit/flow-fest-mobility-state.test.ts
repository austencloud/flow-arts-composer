// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  createFlowFestMobilityState,
  createFreshFlowFestMobilitySnapshot,
  FLOW_FEST_MOBILITY_SNAPSHOT_VERSION,
  mobilityCarDynamicsFromSnapshot,
  restoreFlowFestMobilitySnapshot,
} from "../../src/lib/features/flow-fest-sim/state/flow-fest-mobility-state.svelte";
import { createFlowFestElectricUnicycleDynamics } from "../../src/lib/features/flow-fest-sim/domain/flow-fest-electric-unicycle";
import {
  createFlowFestCarDynamics,
  FLOW_FEST_CAR_CONFIG,
} from "../../src/lib/features/flow-fest-sim/domain/flow-fest-car";
import { FLOW_FEST_GROUND_VEHICLE_IDLE_INPUT } from "../../src/lib/features/flow-fest-sim/domain/flow-fest-ground-vehicle";
import { FLOW_FEST_DRIVE_IN_SPAWN } from "../../src/routes/test/flow-fest-sim/flow-fest-camp-plan";

const FINGERPRINT = "terrain-fingerprint";

describe("Flow Fest mobility snapshot with a car", () => {
  it("starts a fresh drive-in session in the driver's seat with the wheel as cargo", () => {
    const snapshot = createFreshFlowFestMobilitySnapshot(
      FINGERPRINT,
      FLOW_FEST_DRIVE_IN_SPAWN,
      FLOW_FEST_DRIVE_IN_SPAWN.headingRadians,
      { car: { modelId: "ace-hatchback", paintIndex: 2 }, driving: true }
    );
    expect(snapshot.version).toBe(FLOW_FEST_MOBILITY_SNAPSHOT_VERSION);
    expect(snapshot.mounted).toBe(false);
    expect(snapshot.car).toEqual({
      modelId: "ace-hatchback",
      paintIndex: 2,
      x: FLOW_FEST_DRIVE_IN_SPAWN.x,
      z: FLOW_FEST_DRIVE_IN_SPAWN.z,
      headingRadians: FLOW_FEST_DRIVE_IN_SPAWN.headingRadians,
      driving: true,
    });
    expect(snapshot.car?.x).toBeCloseTo(-500.01, 2);
    expect(snapshot.car?.z).toBeCloseTo(37.46, 2);
    expect(snapshot.car?.headingRadians).toBeCloseTo(1.616, 3);
    expect(restoreFlowFestMobilitySnapshot(snapshot, FINGERPRINT)).toEqual(
      snapshot
    );
    // Without a car the session still begins on the wheel.
    expect(
      createFreshFlowFestMobilitySnapshot(FINGERPRINT, { x: 340, z: -20 }, -2.4)
    ).toMatchObject({ mounted: true, car: null });
  });

  it("rejects cars that are not in the catalog, off the square, or driven from the wheel", () => {
    const snapshot = createFreshFlowFestMobilitySnapshot(
      FINGERPRINT,
      FLOW_FEST_DRIVE_IN_SPAWN,
      FLOW_FEST_DRIVE_IN_SPAWN.headingRadians,
      { car: { modelId: "lightbody-pickup", paintIndex: 0 }, driving: true }
    );
    const car = snapshot.car!;
    expect(
      restoreFlowFestMobilitySnapshot(
        { ...snapshot, car: { ...car, modelId: "hovercraft" } },
        FINGERPRINT
      )
    ).toBeNull();
    expect(
      restoreFlowFestMobilitySnapshot(
        { ...snapshot, car: { ...car, paintIndex: 4 } },
        FINGERPRINT
      )
    ).toBeNull();
    expect(
      restoreFlowFestMobilitySnapshot(
        { ...snapshot, car: { ...car, x: 600 } },
        FINGERPRINT
      )
    ).toBeNull();
    expect(
      restoreFlowFestMobilitySnapshot({ ...snapshot, mounted: true }, FINGERPRINT)
    ).toBeNull();
    expect(
      restoreFlowFestMobilitySnapshot({ ...snapshot, version: 1 }, FINGERPRINT)
    ).toBeNull();
    expect(mobilityCarDynamicsFromSnapshot(car)).toEqual(
      createFlowFestCarDynamics({ headingRadians: car.headingRadians })
    );
  });

  it("keeps the parked car where the runtime left it and drops it only when told", () => {
    const storageKey = "flow-fest-test:mobility-car";
    localStorage.removeItem(storageKey);
    const state = createFlowFestMobilityState();
    state.hydrate(
      FINGERPRINT,
      FLOW_FEST_DRIVE_IN_SPAWN,
      FLOW_FEST_DRIVE_IN_SPAWN.headingRadians,
      storageKey,
      { car: { modelId: "bokaroo-suv", paintIndex: 1 }, driving: true }
    );
    const base = {
      mounted: false,
      player: { ...FLOW_FEST_DRIVE_IN_SPAWN },
      wheel: { ...FLOW_FEST_DRIVE_IN_SPAWN },
      dynamics: createFlowFestElectricUnicycleDynamics(),
      input: FLOW_FEST_GROUND_VEHICLE_IDLE_INPUT,
      parkedColliderActive: false,
      distanceToWheelMeters: 0,
      canMount: false,
      canDismount: false,
      interactionMessage: "",
      gamepadConnected: false,
      collisionLimited: false,
      onFoot: { speedMetersPerSecond: 0, sprinting: false },
    };
    const parkedAtGate = {
      modelId: "bokaroo-suv",
      paintIndex: 1,
      driving: false,
      position: { x: 329.22, z: -108.5 },
      dynamics: createFlowFestCarDynamics({ headingRadians: -2.1881 }),
      input: FLOW_FEST_GROUND_VEHICLE_IDLE_INPUT,
      distanceToDoorMeters: 0.4,
      canBoard: true,
      canExit: false,
      collisionLimited: false,
      edgeMessage: null,
    };
    state.applyRuntime({ ...base, car: parkedAtGate });
    expect(state.snapshot?.car).toEqual({
      modelId: "bokaroo-suv",
      paintIndex: 1,
      x: 329.22,
      z: -108.5,
      headingRadians: -2.1881,
      driving: false,
    });
    // An update that says nothing about the car leaves it parked.
    state.applyRuntime(base);
    expect(state.snapshot?.car?.driving).toBe(false);
    state.applyRuntime({ ...base, car: null });
    expect(state.snapshot?.car).toBeNull();
    state.destroy();
    expect(JSON.parse(localStorage.getItem(storageKey) ?? "null")?.car).toBeNull();
    localStorage.removeItem(storageKey);
    expect(FLOW_FEST_CAR_CONFIG.exitSpeedMetersPerSecond).toBe(0.5);
  });
});
