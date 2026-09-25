import { describe, expect, it, vi } from "vitest";
import { Group } from "three";
import type { AvatarServices } from "@austencloud/scene-3d/worker";
import type { WorkerPerformerLocomotionSnapshot } from "$lib/shared/3d/worker-renderer/domain/worker-renderer-protocol";
import { WorkerPerformerLocomotion } from "$lib/shared/3d/worker-renderer/worlds/worker-performer-locomotion";

function snapshot(): WorkerPerformerLocomotionSnapshot {
  return {
    isMoving: true,
    moveSpeed: 1.2,
    moveDirection: { x: 0, z: 1 },
    lateralGait: "sidestep",
    gaitTimingSample: null,
    terminalStepPlan: null,
    turnRequest: null,
  };
}

function services() {
  const order: string[] = [];
  const locomotion = {
    configure: vi.fn(),
    initialize: vi.fn(),
    loadAnimations: vi.fn(async () => {}),
    setGaitTimingSample: vi.fn(),
    setTerminalStepPlan: vi.fn(),
    setActiveState: vi.fn(),
    setLocomotion: vi.fn(),
    update: vi.fn(() => order.push("locomotion")),
    getGaitClock: vi.fn(() => null),
    getSoleOffset: vi.fn(() => 0.03),
    getToeOffset: vi.fn(() => 0.02),
    getFootContact: vi.fn(() => ({ left: 1, right: 0 })),
    getFootPlantConfidence: vi.fn(() => 0.9),
    getStrideScale: vi.fn(() => 1.1),
    getSettlingPlants: vi.fn(() => ({
      left: { shift: 0.05, weight: 1 },
      right: { shift: 0, weight: 0 },
    })),
    reset: vi.fn(),
    dispose: vi.fn(),
  };
  const stateMachine = {
    getState: vi.fn(() => "idle"),
    update: vi.fn(() => ({
      state: "walking",
      animationSpeed: 1.1,
      isMoving: true,
      moveDirection: { x: 0, z: 1 },
      facingAngle: 0.25,
    })),
    reset: vi.fn(),
    dispose: vi.fn(),
  };
  const footPlanter = {
    initialize: vi.fn(),
    configure: vi.fn(),
    isReady: vi.fn(() => true),
    update: vi.fn(() => order.push("feet")),
    reset: vi.fn(),
    dispose: vi.fn(),
  };
  const skeleton = {
    getState: vi.fn(() => ({ bones: new Map() })),
  };
  const value = {
    locomotion,
    stateMachine,
    footPlanter,
    legIKSolver: {},
    contactCurveCache: {},
    turnAnimator: null,
    skeleton,
  } as unknown as AvatarServices;
  return { value, locomotion, stateMachine, footPlanter, order };
}

describe("worker performer locomotion", () => {
  it("loads the production in-place animation family before becoming ready", async () => {
    const fake = services();
    const runtime = new WorkerPerformerLocomotion(fake.value);
    await runtime.initialize(new Group());

    expect(fake.locomotion.loadAnimations).toHaveBeenCalledWith(
      expect.objectContaining({
        idle: "/animations/locomotion-pack/idle.glb",
        forward: "/animations/locomotion-pack/walk-forward.glb",
        backward: "/animations/locomotion-pack/walk-backward.glb",
        strafeLeft: "/animations/locomotion-pack/strafe-left.glb",
        strafeRight: "/animations/locomotion-pack/strafe-right.glb",
        runForward: "/animations/locomotion-pack/run.glb",
        terminalStops: expect.objectContaining({
          left: expect.objectContaining({
            animation: "/animations/terminal-stops/walk-stop-left.glb",
          }),
        }),
      })
    );
    expect(fake.footPlanter.initialize).toHaveBeenCalledOnce();
  });

  it("applies gait and planted feet before the caller runs arm IK", async () => {
    const fake = services();
    const runtime = new WorkerPerformerLocomotion(fake.value);
    const root = new Group();
    root.position.y = 0.4;
    await runtime.initialize(new Group());

    const frame = runtime.update(1 / 60, snapshot(), root, 0.25, 1.7, -1.5);

    expect(fake.stateMachine.update).toHaveBeenCalledWith(
      expect.objectContaining({
        hasMovementInput: true,
        horizontalSpeed: 1.2,
        moveDirection: { x: 0, z: 1 },
      }),
      1 / 60
    );
    expect(fake.locomotion.setActiveState).toHaveBeenCalledWith("walking");
    expect(fake.footPlanter.update).toHaveBeenCalledWith(
      1 / 60,
      expect.objectContaining({
        locomotionState: "walking",
        isMoving: true,
        contactLeft: 1,
        contactRight: 0,
        strideScale: 1.1,
        settlingPlants: {
          left: { shift: 0.05, weight: 1 },
          right: { shift: 0, weight: 0 },
        },
      })
    );
    expect(fake.order).toEqual(["locomotion", "feet"]);
    expect(frame).toEqual({ facingAngle: 0.25, offset: [0, 0, 0] });
  });
});
