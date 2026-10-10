import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import {
  Plane,
  PropType,
  propFinishState,
  type PropState3D,
} from "@austencloud/scene-3d";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import {
  resolveLed3D,
  resolveGoo3D,
  resolveSparkles3D,
  resolveTrails3D,
} from "#lib/shared/effects/translators/webgl3d-translator.js";
import {
  WorkerImperativeEffectFrameBuilder,
  type WorkerImperativeEffectFrameInput,
} from "#lib/shared/3d/worker-renderer/effects/worker-imperative-effect-frame-builder.js";
import {
  WORKER_IMPERATIVE_EFFECTS,
  WORKER_POOLED_EFFECTS,
  WORKER_UNSUPPORTED_EFFECTS,
  isWorkerEffectExact,
} from "#lib/shared/3d/worker-renderer/effects/worker-effect-support.js";

function prop(x = 0): PropState3D {
  return {
    centerPathAngle: 0,
    staffRotationAngle: 0,
    plane: Plane.WALL,
    worldPosition: new Vector3(x, 0, 0),
    worldRotation: new Quaternion(),
    gripType: "square",
  };
}

function input(
  effect: "trails" | "led",
  device: "capsule" | "pixel-staff" = "capsule"
): WorkerImperativeEffectFrameInput {
  return {
    performerId: "p1",
    sourceIdBase: 9,
    deltaSeconds: 1 / 60,
    staffHalfLength: 0.5,
    collisionFloorY: -1.5,
    intent: {
      playing: true,
      sampledAtMs: 1_000,
      currentStep: 2.5,
      totalSteps: 16,
      seamlesslyLoopable: true,
      qualityTier: "high" as const,
      propBuild: propFinishState.build,
      tips: [
        { propIndex: 0, tipIndex: 0, effect },
        { propIndex: 0, tipIndex: 1, effect },
      ],
      handTrailEffects: [effect, "none"],
      trails: resolveTrails3D(DEFAULT_EFFECTS_CONFIG.trails),
      led: resolveLed3D({
        ...DEFAULT_EFFECTS_CONFIG.led,
        device: { kind: device, ledCount: device === "capsule" ? 2 : 32 },
      }),
      pooled: {},
    },
    left: {
      state: prop(),
      propType: PropType.STAFF,
      worldCenter: [4.2, 5, 6.1],
      worldRotation: [0, 0, 0, 1],
    },
    right: {
      state: null,
      propType: PropType.STAFF,
      worldCenter: [0, 0, 0],
      worldRotation: [0, 0, 0, 1],
    },
  };
}

describe("worker imperative effect frame builder", () => {
  it("routes the performer's supporting floor into Goo sources", () => {
    const goo = input("trails");
    goo.collisionFloorY = 2.25;
    goo.intent.tips = [{ propIndex: 0, tipIndex: 0, effect: "goo" }];
    goo.intent.pooled.goo = resolveGoo3D(DEFAULT_EFFECTS_CONFIG.goo);
    expect(new WorkerImperativeEffectFrameBuilder().build(goo).sources).toEqual(
      [expect.objectContaining({ effect: "goo", collisionFloorY: 2.25 })]
    );
  });
  it("derives trails from the worker-owned world prop center", () => {
    const defaultTrails = input("trails");
    const output = new WorkerImperativeEffectFrameBuilder().build(
      defaultTrails
    );
    const trails = output.imperative?.filter(
      (frame) => frame.renderer === "trail"
    );

    expect(trails).toHaveLength(2);
    expect(trails.map((frame) => frame.sourceId)).toEqual([
      "p1:0:left-end",
      "p1:0:right-end",
    ]);
    expect(trails?.[0]?.position[0]).toBeGreaterThan(3);
    expect(trails[0]?.position[1]).toBe(5);
    expect(trails[0]?.config).toMatchObject({
      maxPoints: 256,
      qualityTier: "high",
      mode: "fade",
      fadeDuration: 2,
    });
    expect(() => structuredClone(output)).not.toThrow();
  });

  it("keeps LED pattern sampling and sub-frame supersampling inside the worker", () => {
    const builder = new WorkerImperativeEffectFrameBuilder();
    const first = builder.build(input("led"));
    const secondInput = input("led");
    secondInput.left.worldCenter = [4.4, 5, 6.1];
    secondInput.intent.sampledAtMs = 1_016;
    const second = builder.build(secondInput);
    const firstLed = first.imperative?.find(
      (frame) => frame.renderer === "led"
    );
    const secondLed = second.imperative?.find(
      (frame) => frame.renderer === "led"
    );

    expect(firstLed?.tips).toHaveLength(2);
    expect(secondLed?.tips).toHaveLength(16);
    expect(secondLed?.sampledAtSeconds).toBe(1.016);
    expect(secondLed?.tips.every((tip) => Number.isFinite(tip.speed))).toBe(
      true
    );
  });

  it("materializes a pixel-staff frame instead of substituting capsule LEDs", () => {
    const output = new WorkerImperativeEffectFrameBuilder().build(
      input("led", "pixel-staff")
    );
    const pov = output.imperative?.find((frame) => frame.renderer === "pov");

    expect(pov).toMatchObject({ ledCount: 32, brightness: expect.any(Number) });
    expect(pov?.pattern.ledCount).toBe(32);
    expect(() => structuredClone(pov)).not.toThrow();
  });

  it("materializes the exact moon-fan frame from the worker prop rotation", () => {
    const moonInput = input("led");
    moonInput.left.propType = PropType.FAN;
    moonInput.left.state = prop();
    moonInput.intent.propBuild = {
      ...propFinishState.build,
      fanBuild: "moon",
    };

    const output = new WorkerImperativeEffectFrameBuilder().build(moonInput);
    const moonFan = output.imperative?.find(
      (frame) => frame.renderer === "moon-fan"
    );

    expect(moonFan).toMatchObject({
      sourceId: "p1:0:moon-fan",
      enabled: true,
      worldCenter: expect.any(Array),
      worldRotation: expect.any(Array),
      brightness: expect.any(Number),
      scale: 1,
    });
    expect(moonFan?.ledColors).toHaveLength(78);
    expect(() => structuredClone(moonFan)).not.toThrow();
  });

  it("publishes pooled sources with stable worker-owned ids and Choreo timing", () => {
    const sparkle = input("trails");
    sparkle.intent.tips = [{ propIndex: 0, tipIndex: 0, effect: "sparkles" }];
    sparkle.intent.pooled.sparkles = resolveSparkles3D(
      DEFAULT_EFFECTS_CONFIG.sparkles
    );

    const output = new WorkerImperativeEffectFrameBuilder().build(sparkle);

    expect(output.sources).toEqual([
      expect.objectContaining({
        sourceId: 9,
        effect: "sparkles",
        currentStep: 2.5,
        totalSteps: 16,
        seamlesslyLoopable: true,
        position: expect.objectContaining({ y: 5 }),
      }),
    ]);
  });

  it("names every exact and fail-closed effect family", () => {
    expect(WORKER_IMPERATIVE_EFFECTS).toEqual(["trails", "led"]);
    expect(WORKER_POOLED_EFFECTS).toEqual([
      "sparkles",
      "goo",
      "bubbles",
      "petals",
      "smoke",
      "ink",
      "silk",
      "animal",
      "pulse",
      "bloom",
      "fire",
      "charcoal",
    ]);
    expect(WORKER_UNSUPPORTED_EFFECTS).toEqual(["zap", "ghost", "frost"]);
    expect(isWorkerEffectExact("trails")).toBe(true);
    expect(isWorkerEffectExact("led")).toBe(true);
    expect(isWorkerEffectExact("none")).toBe(true);
    expect(isWorkerEffectExact("zap")).toBe(false);
    expect(isWorkerEffectExact("ghost")).toBe(false);
    expect(isWorkerEffectExact("frost")).toBe(false);
  });
});
