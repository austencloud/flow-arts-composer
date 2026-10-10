import { describe, expect, it } from "vitest";
import type { PhysicsProvider, Vector3 } from "@austencloud/camera-3d";
import { FlowFestElectricUnicycleDrive } from "#lib/features/flow-fest-sim/services/flow-fest-electric-unicycle-drive.js";
import {
  FLOW_FEST_EUC_CONFIG,
  FLOW_FEST_EUC_TRAVERSAL_ENVELOPES,
  createFlowFestElectricUnicycleDynamics,
  deriveFlowFestEucTerrainAttitude,
  flowFestEucTraversalEnvelope,
  flowFestEucGamepadInput,
  flowFestEucKeyboardInput,
  mergeFlowFestEucInput,
  reconcileFlowFestEucCollision,
  stepFlowFestElectricUnicycle,
  type FlowFestElectricUnicycleDynamics,
  type FlowFestElectricUnicycleInput,
} from "#lib/features/flow-fest-sim/domain/flow-fest-electric-unicycle.js";
import {
  createFlowFestMobilityState,
  createFreshFlowFestMobilitySnapshot,
  restoreFlowFestMobilitySnapshot,
} from "#lib/features/flow-fest-sim/state/flow-fest-mobility-state.svelte.js";

class ControllerSkinPhysicsProvider implements PhysicsProvider {
  private position: Vector3 = { x: 0, y: 1, z: 0 };
  private velocity: Vector3 = { x: 0, y: 0, z: 0 };

  movePlayer(desired: Vector3, deltaTime: number): void {
    const planarDistance = Math.hypot(desired.x, desired.z);
    const corrected =
      planarDistance >= 0.02 ? desired : { x: 0, y: desired.y, z: 0 };
    this.position = {
      x: this.position.x + corrected.x,
      y: this.position.y + corrected.y,
      z: this.position.z + corrected.z,
    };
    this.velocity = {
      x: corrected.x / deltaTime,
      y: corrected.y / deltaTime,
      z: corrected.z / deltaTime,
    };
  }

  getPlayerPosition(): Vector3 {
    return { ...this.position };
  }

  isGrounded(): boolean {
    return true;
  }

  getVelocity(): Vector3 {
    return { ...this.velocity };
  }
}

class GroundedSlopePhysicsProvider implements PhysicsProvider {
  private position: Vector3 = { x: 0, y: 1, z: 0 };
  private velocity: Vector3 = { x: 0, y: 0, z: 0 };
  private readonly planarScale: number;
  private readonly verticalScale: number;

  constructor(slopeDegrees: number) {
    const radians = (slopeDegrees * Math.PI) / 180;
    this.planarScale = Math.cos(radians);
    this.verticalScale = Math.sin(radians);
  }

  movePlayer(desired: Vector3, deltaTime: number): void {
    const corrected = {
      x: desired.x * this.planarScale,
      y: Math.hypot(desired.x, desired.z) * this.verticalScale,
      z: desired.z * this.planarScale,
    };
    this.position = {
      x: this.position.x + corrected.x,
      y: this.position.y + corrected.y,
      z: this.position.z + corrected.z,
    };
    this.velocity = {
      x: corrected.x / deltaTime,
      y: corrected.y / deltaTime,
      z: corrected.z / deltaTime,
    };
  }

  getPlayerPosition(): Vector3 {
    return { ...this.position };
  }

  isGrounded(): boolean {
    return true;
  }

  getVelocity(): Vector3 {
    return { ...this.velocity };
  }
}

const IDLE: FlowFestElectricUnicycleInput = {
  throttle: 0,
  brake: 0,
  steer: 0,
  performanceMode: false,
  source: "none",
};

function runFrames(
  initial: FlowFestElectricUnicycleDynamics,
  input: FlowFestElectricUnicycleInput,
  frameCount: number
): FlowFestElectricUnicycleDynamics {
  let state = initial;
  for (let frame = 0; frame < frameCount; frame += 1) {
    state = stepFlowFestElectricUnicycle(state, input, 1 / 60).state;
  }
  return state;
}

describe("Flow Fest electric unicycle", () => {
  it("uses a technical EUC climb envelope without giving the same slope access on foot", () => {
    const mounted = flowFestEucTraversalEnvelope(true);
    const onFoot = flowFestEucTraversalEnvelope(false);

    expect(mounted).toBe(FLOW_FEST_EUC_TRAVERSAL_ENVELOPES.mounted);
    expect(onFoot).toBe(FLOW_FEST_EUC_TRAVERSAL_ENVELOPES.onFoot);
    expect((mounted.maxSlopeClimbAngleRadians * 180) / Math.PI).toBeCloseTo(
      42,
      8
    );
    expect(mounted.maxSlopeClimbAngleRadians).toBeGreaterThan(
      onFoot.maxSlopeClimbAngleRadians
    );
    expect(mounted.minSlopeSlideAngleRadians).toBeGreaterThan(
      mounted.maxSlopeClimbAngleRadians
    );
    expect(mounted.autoStepMaxHeightMeters).toBeGreaterThan(
      FLOW_FEST_EUC_CONFIG.wheelRadiusMeters
    );
  });

  it("accelerates into separate cruise and performance caps", () => {
    const cruise = runFrames(
      createFlowFestElectricUnicycleDynamics(),
      { ...IDLE, throttle: 1, source: "keyboard" },
      360
    );
    const performance = runFrames(
      createFlowFestElectricUnicycleDynamics(),
      {
        ...IDLE,
        throttle: 1,
        performanceMode: true,
        source: "keyboard",
      },
      360
    );

    expect(cruise.speedMetersPerSecond).toBeCloseTo(
      FLOW_FEST_EUC_CONFIG.cruiseSpeedMetersPerSecond,
      6
    );
    expect(performance.speedMetersPerSecond).toBeCloseTo(
      FLOW_FEST_EUC_CONFIG.performanceSpeedMetersPerSecond,
      6
    );
    expect(performance.speedMetersPerSecond).toBeGreaterThan(
      cruise.speedMetersPerSecond
    );
    expect(FLOW_FEST_EUC_CONFIG.cruiseSpeedMetersPerSecond).toBeGreaterThan(
      FLOW_FEST_EUC_CONFIG.humanSprintSpeedMetersPerSecond * 1.8
    );
    expect(
      FLOW_FEST_EUC_CONFIG.performanceSpeedMetersPerSecond /
        FLOW_FEST_EUC_CONFIG.humanWalkSpeedMetersPerSecond
    ).toBeGreaterThan(5);
    expect(
      FLOW_FEST_EUC_CONFIG.performanceSpeedMetersPerSecond * 2.2369362921
    ).toBeCloseTo(49.2, 1);
  });

  it("covers vehicle distance rather than runner distance at full performance torque", () => {
    const performance = runFrames(
      createFlowFestElectricUnicycleDynamics(),
      {
        ...IDLE,
        throttle: 1,
        performanceMode: true,
        source: "keyboard",
      },
      600
    );
    const humanSprintDistance =
      FLOW_FEST_EUC_CONFIG.humanSprintSpeedMetersPerSecond * 10;

    expect(performance.odometerMeters).toBeGreaterThan(humanSprintDistance * 2);
    expect(performance.speedMetersPerSecond).toBe(
      FLOW_FEST_EUC_CONFIG.performanceSpeedMetersPerSecond
    );
  });

  it("derives bounded wheel pitch, roll, and suspension travel from measured terrain", () => {
    const attitude = deriveFlowFestEucTerrainAttitude({
      centerMeters: 10.08,
      forwardMeters: 10.42,
      rearMeters: 9.94,
      leftMeters: 10.21,
      rightMeters: 9.97,
      longitudinalSpanMeters: 1.1,
      lateralSpanMeters: 0.78,
    });

    expect(attitude.pitchRadians).toBeGreaterThan(0);
    expect(attitude.rollRadians).toBeGreaterThan(0);
    expect(attitude.pitchRadians).toBeLessThanOrEqual(
      FLOW_FEST_EUC_CONFIG.maximumTerrainPitchRadians
    );
    expect(attitude.rollRadians).toBeLessThanOrEqual(
      FLOW_FEST_EUC_CONFIG.maximumTerrainRollRadians
    );
    expect(attitude.roughnessMeters).toBeGreaterThan(0);
    expect(attitude.roughnessMeters).toBeLessThanOrEqual(
      FLOW_FEST_EUC_CONFIG.suspensionTravelMeters
    );
  });

  it("brakes to a stop before accepting limited reverse torque", () => {
    let state = createFlowFestElectricUnicycleDynamics({
      speedMetersPerSecond: 8,
    });
    state = runFrames(state, { ...IDLE, brake: 1, source: "keyboard" }, 60);
    expect(state.speedMetersPerSecond).toBe(0);

    state = runFrames(
      state,
      { ...IDLE, throttle: -1, source: "keyboard" },
      180
    );
    expect(state.speedMetersPerSecond).toBeCloseTo(
      -FLOW_FEST_EUC_CONFIG.reverseSpeedMetersPerSecond,
      6
    );
  });

  it("reduces steering authority as speed rises and reverses steering in reverse", () => {
    const low = stepFlowFestElectricUnicycle(
      createFlowFestElectricUnicycleDynamics({ speedMetersPerSecond: 1 }),
      { ...IDLE, steer: 1, source: "keyboard" },
      1 / 30
    ).state;
    const high = stepFlowFestElectricUnicycle(
      createFlowFestElectricUnicycleDynamics({ speedMetersPerSecond: 12 }),
      { ...IDLE, steer: 1, source: "keyboard" },
      1 / 30
    ).state;
    const reverse = stepFlowFestElectricUnicycle(
      createFlowFestElectricUnicycleDynamics({ speedMetersPerSecond: -2 }),
      { ...IDLE, steer: 1, source: "keyboard" },
      1 / 30
    ).state;

    expect(Math.abs(low.headingRadians)).toBeGreaterThan(
      Math.abs(high.headingRadians)
    );
    expect(reverse.headingRadians).toBeLessThan(0);
  });

  it("is deterministic, drains charge by distance, and never leaves valid bounds", () => {
    const input = {
      ...IDLE,
      throttle: 0.72,
      steer: -0.34,
      source: "keyboard" as const,
    };
    const first = runFrames(
      createFlowFestElectricUnicycleDynamics(),
      input,
      900
    );
    const second = runFrames(
      createFlowFestElectricUnicycleDynamics(),
      input,
      900
    );

    expect(first).toEqual(second);
    expect(first.odometerMeters).toBeGreaterThan(0);
    expect(first.batteryPercent).toBeLessThan(100);
    expect(first.batteryPercent).toBeGreaterThanOrEqual(0);
  });

  it("reconciles speed against Rapier's corrected collision displacement", () => {
    const moving = createFlowFestElectricUnicycleDynamics({
      speedMetersPerSecond: 9,
      headingRadians: 0,
    });
    const blocked = reconcileFlowFestEucCollision(moving, { x: 0, z: 0 });
    const sliding = reconcileFlowFestEucCollision(moving, { x: 4, z: 5 });

    expect(blocked.speedMetersPerSecond).toBe(0);
    expect(sliding.speedMetersPerSecond).toBeCloseTo(5, 6);
    expect(sliding.pitchRadians).toBeGreaterThan(0);
  });

  it("counts grounded elevation gain as wheel travel instead of a collision", () => {
    const moving = createFlowFestElectricUnicycleDynamics({
      speedMetersPerSecond: 9,
      headingRadians: 0,
    });
    const slopeRadians = (30 * Math.PI) / 180;
    const climbing = reconcileFlowFestEucCollision(
      moving,
      {
        x: 0,
        y: 9 * Math.sin(slopeRadians),
        z: 9 * Math.cos(slopeRadians),
      },
      { x: 0, z: 9 },
      true
    );
    const airborne = reconcileFlowFestEucCollision(
      moving,
      {
        x: 0,
        y: -9,
        z: 0.4,
      },
      { x: 0, z: 9 },
      false
    );

    expect(climbing.speedMetersPerSecond).toBe(9);
    expect(airborne.speedMetersPerSecond).toBeCloseTo(
      0.4,
      6
    );
  });

  it("keeps accelerating while the grounded controller converts torque into a 30-degree climb", () => {
    const provider = new GroundedSlopePhysicsProvider(30);
    const drive = new FlowFestElectricUnicycleDrive(provider);
    drive.setKeyboardCodes(["KeyW"]);

    for (let frame = 0; frame < 180; frame += 1) {
      drive.movePlayer({ x: 0, y: 0, z: 0 }, 1 / 60);
    }

    expect(provider.getPlayerPosition().y).toBeGreaterThan(10);
    expect(provider.getPlayerPosition().z).toBeGreaterThan(18);
    expect(drive.snapshot().speedMetersPerSecond).toBeGreaterThan(12);
  });

  it("crosses the character-controller skin instead of resetting startup acceleration", () => {
    const provider = new ControllerSkinPhysicsProvider();
    const drive = new FlowFestElectricUnicycleDrive(provider);
    drive.setKeyboardCodes(["KeyW"]);

    for (let frame = 0; frame < 120; frame += 1) {
      drive.movePlayer({ x: 0, y: 0, z: 0 }, 1 / 60);
    }

    expect(provider.getPlayerPosition().z).toBeGreaterThan(8);
    expect(drive.snapshot().speedMetersPerSecond).toBeGreaterThan(8);
    expect(drive.snapshot().odometerMeters).toBeGreaterThan(8);
  });

  it("keeps vehicle time and distance stable when the rendered scene drops to eight frames per second", () => {
    const provider = new ControllerSkinPhysicsProvider();
    const drive = new FlowFestElectricUnicycleDrive(provider);
    drive.setKeyboardCodes(["KeyW", "ShiftLeft"]);

    for (let frame = 0; frame < 24; frame += 1) {
      drive.movePlayer({ x: 0, y: 0, z: 0 }, 1 / 8);
    }

    expect(drive.snapshot().speedMetersPerSecond).toBe(
      FLOW_FEST_EUC_CONFIG.performanceSpeedMetersPerSecond
    );
    expect(drive.snapshot().odometerMeters).toBeGreaterThan(40);
    expect(provider.getPlayerPosition().z).toBeGreaterThan(40);
  });

  it("maps keyboard and standard gamepad controls without stealing the stronger input", () => {
    const keyboard = flowFestEucKeyboardInput(["KeyW", "KeyA", "ShiftLeft"], 0);
    const gamepad = flowFestEucGamepadInput(
      {
        connected: true,
        mapping: "standard",
        axes: [-0.7, 0, 0, 0],
        buttons: Array.from({ length: 8 }, (_, index) => ({
          pressed: index === 5,
          value: index === 7 ? 0.6 : 0,
        })),
      },
      0
    );
    const merged = mergeFlowFestEucInput(keyboard, gamepad);

    expect(merged.throttle).toBe(1);
    expect(merged.steer).toBe(1);
    expect(merged.performanceMode).toBe(true);
    expect(merged.source).toBe("mixed");
  });

  it("maps left and right to the world-frame yaw convention without inversion", () => {
    const left = flowFestEucKeyboardInput(["KeyA"], 4);
    const right = flowFestEucKeyboardInput(["KeyD"], 4);
    const gamepadLeft = flowFestEucGamepadInput(
      {
        connected: true,
        mapping: "standard",
        axes: [-1, 0, 0, 0],
        buttons: [],
      },
      4
    );

    expect(left.steer).toBe(1);
    expect(right.steer).toBe(-1);
    expect(gamepadLeft.steer).toBe(1);

    const leftTurn = stepFlowFestElectricUnicycle(
      createFlowFestElectricUnicycleDynamics({ speedMetersPerSecond: 4 }),
      left,
      1 / 30
    ).state;
    const rightTurn = stepFlowFestElectricUnicycle(
      createFlowFestElectricUnicycleDynamics({ speedMetersPerSecond: 4 }),
      right,
      1 / 30
    ).state;
    expect(leftTurn.headingRadians).toBeGreaterThan(0);
    expect(rightTurn.headingRadians).toBeLessThan(0);
  });

  it("restores only finite, in-bounds snapshots from the same coordinate contract", () => {
    const snapshot = createFreshFlowFestMobilitySnapshot(
      "terrain-fingerprint",
      { x: 340, z: -20 },
      -2.4
    );
    expect(
      restoreFlowFestMobilitySnapshot(snapshot, "terrain-fingerprint")
    ).toEqual(snapshot);
    expect(
      restoreFlowFestMobilitySnapshot(snapshot, "new-fingerprint")
    ).toBeNull();
    expect(
      restoreFlowFestMobilitySnapshot(
        { ...snapshot, player: { x: Number.NaN, z: -20 } },
        "terrain-fingerprint"
      )
    ).toBeNull();
    expect(
      restoreFlowFestMobilitySnapshot(
        { ...snapshot, batteryPercent: 101 },
        "terrain-fingerprint"
      )
    ).toBeNull();
  });

  it("does not let a pre-hydration scene frame erase the restored pose", () => {
    const storageKey = "flow-fest-test:mobility-hydration";
    localStorage.removeItem(storageKey);
    const state = createFlowFestMobilityState();
    const target = { x: 89, z: -101 };
    state.hydrate("terrain-fingerprint", target, Math.PI, storageKey);

    const update = (player: { x: number; z: number }) => ({
      mounted: true,
      player,
      wheel: player,
      dynamics: createFlowFestElectricUnicycleDynamics({
        headingRadians: Math.PI,
      }),
      input: {
        throttle: 0,
        brake: 0,
        steer: 0,
        performanceMode: false,
        source: "none" as const,
      },
      parkedColliderActive: false,
      distanceToWheelMeters: 0,
      canMount: false,
      canDismount: true,
      interactionMessage: "Park wheel",
      gamepadConnected: false,
      collisionLimited: false,
    });

    state.applyRuntime(update({ x: 340, z: -20 }));
    expect(state.hydrating).toBe(true);
    expect(state.snapshot?.player).toEqual(target);

    state.applyRuntime(update(target));
    expect(state.hydrating).toBe(false);
    expect(state.snapshot?.player).toEqual(target);
    state.destroy();
    localStorage.removeItem(storageKey);
  });
});
