import { beforeEach, describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import {
  CharcoalRenderer3D,
  type CharcoalRenderer3DSpatialDebugSnapshot,
  type CharcoalTipInput,
} from "#lib/shared/3d/effects/charcoal/charcoal-renderer-3d.js";
import { QualityTier } from "#lib/shared/3d/effects/types.js";
import { resolveCharcoal3D } from "#lib/shared/effects/translators/webgl3d-translator.js";

function createMockScene(): any {
  return { add: vi.fn(), remove: vi.fn() };
}

function createTip(
  overrides: Partial<CharcoalTipInput> = {}
): CharcoalTipInput {
  return {
    sourceId: 0,
    position: new Vector3(0, 1, 0),
    velocityX: 1,
    velocityY: 0,
    velocityZ: 0,
    speed: 1,
    jerk: 0,
    ...overrides,
  };
}

function createParams(overrides: Record<string, unknown> = {}) {
  return resolveCharcoal3D({
    intensity: 0.65,
    spread: 0.45,
    glow: 0.55,
    ...overrides,
  });
}

describe("CharcoalRenderer3D", () => {
  let renderer: CharcoalRenderer3D;

  beforeEach(() => {
    renderer = new CharcoalRenderer3D(QualityTier.HIGH);
  });

  it("initializes the point and dimensional ember layers", () => {
    const scene = createMockScene();
    renderer.initialize(scene);

    expect(scene.add).toHaveBeenCalledTimes(2);
  });

  it("keeps a readable coal head on every stationary tip", () => {
    renderer.initialize(createMockScene());
    renderer.updateConfig(createParams());
    renderer.update(
      [0, 1, 2, 3].map((index) =>
        createTip({
          sourceId: index,
          position: new Vector3(index * 0.2, 1, 0),
          velocityX: 0,
          speed: 0,
        })
      ),
      1 / 60
    );

    expect(renderer.getDebugSnapshot()).toMatchObject({
      activeTipCount: 4,
      activeSparkCount: 0,
      activePointCount: 16,
    });
  });

  it("matches the dense moving-particle envelope of the 2D effect", () => {
    renderer.initialize(createMockScene());
    renderer.updateConfig(createParams());
    const movingTip = createTip({ velocityX: 3, speed: 3 });

    for (let frame = 0; frame < 60; frame++) {
      renderer.update([movingTip], 1 / 60);
    }

    const snapshot = renderer.getDebugSnapshot();
    expect(snapshot.emittedSparkCount).toBeGreaterThan(180);
    expect(snapshot.emittedFragmentCount).toBeGreaterThan(50);
    expect(snapshot.activeSparkCount).toBeGreaterThan(150);
    expect(snapshot.activeTipCount).toBe(1);
  });

  it("maintains visible tip-local coal without path backfill", () => {
    renderer.initialize(createMockScene());
    renderer.updateConfig(createParams({ emissionStyle: "banked-ember" }));
    const movingTip = createTip({ speed: 0, velocityX: 0 });

    for (let frame = 0; frame < 60; frame++) {
      renderer.update([movingTip], 1 / 60);
    }

    expect(renderer.getDebugSnapshot()).toMatchObject({ activeTipCount: 1 });
    expect(renderer.getDebugSnapshot().emittedFragmentCount).toBeGreaterThan(7);
    expect(renderer.getDebugSnapshot().activeSparkCount).toBeGreaterThan(20);
    expect(renderer.getDebugSnapshot().activeFragmentCount).toBeGreaterThan(0);
  });

  it("applies visibly different emission behavior per preset style", () => {
    const styles = [
      "steel-wool",
      "forge-burst",
      "cinder-fan",
      "banked-ember",
    ] as const;
    const snapshots = Object.fromEntries(
      styles.map((emissionStyle) => {
        const styled = new CharcoalRenderer3D(QualityTier.HIGH);
        styled.initialize(createMockScene());
        styled.updateConfig(createParams({ emissionStyle }));
        const movingTip = createTip({ velocityX: 3, speed: 3 });
        for (let frame = 0; frame < 60; frame++) {
          styled.update([movingTip], 1 / 60);
        }
        return [emissionStyle, styled.getDebugSnapshot()] as const;
      })
    );

    expect(snapshots["steel-wool"].emittedSparkCount).toBeGreaterThan(
      snapshots["forge-burst"].emittedSparkCount
    );
    expect(snapshots["cinder-fan"].emittedSparkCount).toBeGreaterThan(
      snapshots["banked-ember"].emittedSparkCount
    );
    expect(
      snapshots["banked-ember"].emittedFragmentCount /
        snapshots["banked-ember"].emittedSparkCount
    ).toBeGreaterThan(
      snapshots["steel-wool"].emittedFragmentCount /
        snapshots["steel-wool"].emittedSparkCount
    );
  });

  it("makes Forge Burst respond harder to the same momentum shift", () => {
    const createBurst = (emissionStyle: "steel-wool" | "forge-burst") => {
      const styled = new CharcoalRenderer3D(QualityTier.HIGH);
      styled.initialize(createMockScene());
      styled.updateConfig(createParams({ emissionStyle }));
      styled.update([createTip({ velocityX: 4, speed: 4 })], 1 / 60);
      styled.update([createTip({ velocityX: 0, speed: 0 })], 1 / 60);
      return styled.getDebugSnapshot().lastBurst;
    };

    const steelBurst = createBurst("steel-wool");
    const forgeBurst = createBurst("forge-burst");
    expect(steelBurst).not.toBeNull();
    expect(forgeBurst).not.toBeNull();
    expect(forgeBurst!.fragmentCount).toBeGreaterThan(
      steelBurst!.fragmentCount
    );
    expect(forgeBurst!.sparkCount).toBeGreaterThan(steelBurst!.sparkCount);
  });

  it("fires once for a momentum shift and rearms after motion settles", () => {
    renderer.initialize(createMockScene());
    renderer.updateConfig(createParams());
    const moving = createTip({ velocityX: 3, speed: 3 });
    const stopped = createTip({ velocityX: 0, speed: 0, jerk: 180 });

    renderer.update([moving], 1 / 60);
    for (let frame = 0; frame < 20; frame++) {
      renderer.update([stopped], 1 / 60);
    }
    expect(renderer.getDebugSnapshot().burstCount).toBe(1);
    expect(renderer.getDebugSnapshot().emittedFragmentCount).toBeGreaterThan(0);

    renderer.update([moving], 1 / 60);
    renderer.update([stopped], 1 / 60);
    expect(renderer.getDebugSnapshot().burstCount).toBe(2);
  });

  it("does not confuse a slow endpoint with a hard momentum shift", () => {
    renderer.initialize(createMockScene());
    renderer.updateConfig(createParams());
    renderer.update(
      [createTip({ velocityX: 0.8, speed: 0.8, jerk: 0 })],
      1 / 60
    );
    renderer.update([createTip({ velocityX: 0, speed: 0, jerk: 500 })], 1 / 60);

    expect(renderer.getDebugSnapshot()).toMatchObject({
      burstCount: 0,
      lastBurst: null,
    });
  });

  it("scales burst volume with momentum-shift severity", () => {
    const moderate = new CharcoalRenderer3D(QualityTier.HIGH);
    const severe = new CharcoalRenderer3D(QualityTier.HIGH);
    moderate.initialize(createMockScene());
    severe.initialize(createMockScene());
    moderate.updateConfig(createParams());
    severe.updateConfig(createParams());

    moderate.update([createTip({ velocityX: 2, speed: 2 })], 1 / 60);
    moderate.update([createTip({ velocityX: 0, speed: 0 })], 1 / 60);
    severe.update([createTip({ velocityX: 6, speed: 6 })], 1 / 60);
    severe.update([createTip({ velocityX: 0, speed: 0 })], 1 / 60);

    const moderateBurst = moderate.getDebugSnapshot().lastBurst;
    const severeBurst = severe.getDebugSnapshot().lastBurst;
    expect(moderateBurst).not.toBeNull();
    expect(severeBurst).not.toBeNull();
    expect(severeBurst!.severity).toBeGreaterThan(moderateBurst!.severity);
    expect(severeBurst!.sparkCount).toBeGreaterThan(moderateBurst!.sparkCount);
    expect(severeBurst!.fragmentCount).toBeGreaterThan(
      moderateBurst!.fragmentCount
    );
  });

  it("throws a halt burst along the tip's incoming momentum", () => {
    renderer.initialize(createMockScene());
    renderer.updateConfig(createParams({ spread: 0 }));
    renderer.update([createTip({ velocityX: 4, speed: 4 })], 1 / 60);
    renderer.update([createTip({ velocityX: 0, speed: 0, jerk: 240 })], 1 / 60);

    const burst = renderer.getDebugSnapshot().lastBurst;
    expect(burst).not.toBeNull();
    expect(burst!.sourceDirection[0]).toBeCloseTo(1, 6);
    expect(burst!.sourceDirection[1]).toBeCloseTo(0, 6);
    expect(burst!.sourceDirection[2]).toBeCloseTo(0, 6);
    expect(burst!.averageSparkVelocity[0]).toBeGreaterThan(0);
    expect(Math.abs(burst!.averageSparkVelocity[1])).toBeLessThan(
      burst!.averageSparkVelocity[0]
    );
    expect(Math.abs(burst!.averageSparkVelocity[2])).toBeLessThan(
      burst!.averageSparkVelocity[0]
    );
  });

  it("applies all translated physics controls and palette colors live", () => {
    renderer.initialize(createMockScene());
    const params = createParams({
      intensity: 0.8,
      spread: 0.75,
      glow: 0.9,
      coreColor: [220, 255, 235],
      midColor: [45, 245, 125],
      coolColor: [3, 78, 36],
    });
    renderer.updateConfig(params);

    const snapshot = renderer.getDebugSnapshot();
    expect(snapshot.physics).toEqual({
      particleLifetime: params.particleLifetime,
      gravity: params.gravity,
      sparkSizeJitter: params.sparkSizeJitter,
    });
    expect(snapshot.palette).toEqual({
      core: [220, 255, 235],
      mid: [45, 245, 125],
      cool: [3, 78, 36],
    });
  });

  it("does not draw a streak across an implausible frame jump", () => {
    renderer.initialize(createMockScene());
    renderer.updateConfig(createParams());
    renderer.update([createTip()], 1 / 60);
    const beforeJump = renderer.getDebugSnapshot();
    renderer.update(
      [createTip({ position: new Vector3(0.24, 1, 0), speed: 8 })],
      1 / 60
    );

    const afterJump = renderer.getDebugSnapshot();
    expect(afterJump).toMatchObject({
      suppressedDiscontinuityCount: 1,
    });
    expect(afterJump.emittedSparkCount).toBe(beforeJump.emittedSparkCount);
    expect(afterJump.emittedFragmentCount).toBe(
      beforeJump.emittedFragmentCount
    );
  });

  it("does not connect physical tips when their input order changes", () => {
    renderer.initialize(createMockScene());
    renderer.updateConfig(createParams());
    renderer.update(
      [
        createTip({ sourceId: 0, position: new Vector3(-0.4, 1, 0) }),
        createTip({ sourceId: 1, position: new Vector3(0.4, 1, 0) }),
      ],
      1 / 60
    );
    renderer.update(
      [
        createTip({ sourceId: 1, position: new Vector3(0.42, 1, 0) }),
        createTip({ sourceId: 0, position: new Vector3(-0.42, 1, 0) }),
      ],
      1 / 60
    );

    expect(renderer.getDebugSnapshot()).toMatchObject({
      activeTipCount: 2,
      suppressedDiscontinuityCount: 0,
    });
  });

  it("suppresses path and burst emission across a LOOP seam", () => {
    renderer.initialize(createMockScene());
    renderer.updateConfig(createParams());
    renderer.update([createTip()], 1 / 60, {
      currentStep: 15.98,
      totalSteps: 16,
    });
    const beforeSeam = renderer.getDebugSnapshot();
    renderer.update(
      [
        createTip({
          position: new Vector3(0.4, 1, 0),
          speed: 24,
          jerk: 80,
        }),
      ],
      1 / 60,
      { currentStep: 16.02, totalSteps: 16 }
    );

    const afterSeam = renderer.getDebugSnapshot();
    expect(afterSeam).toMatchObject({
      burstCount: 0,
      suppressedDiscontinuityCount: 1,
    });
    expect(afterSeam.emittedSparkCount).toBe(beforeSeam.emittedSparkCount);
    expect(afterSeam.emittedFragmentCount).toBe(
      beforeSeam.emittedFragmentCount
    );
  });

  it("clears path history and particles on reset", () => {
    renderer.initialize(createMockScene());
    renderer.updateConfig(createParams());
    renderer.update([createTip({ velocityX: 3, speed: 3, jerk: 0 })], 1 / 60);
    renderer.update([createTip({ velocityX: 0, speed: 0, jerk: 180 })], 1 / 60);
    expect(renderer.getDebugSnapshot().activeSparkCount).toBeGreaterThan(0);

    renderer.reset();
    expect(renderer.getDebugSnapshot()).toMatchObject({
      activeSparkCount: 0,
      activeFragmentCount: 0,
      activeTipCount: 0,
      activePointCount: 0,
    });
  });

  it("collides fragments only with the supplied rig-local floor", () => {
    const frames: CharcoalRenderer3DSpatialDebugSnapshot[] = [];
    const stopObserving = CharcoalRenderer3D.observeDiagnostics((snapshot) => {
      frames.push(snapshot);
    });
    const tips = [-0.72, -0.24, 0.24, 0.72].map((x, sourceId) =>
      createTip({
        sourceId,
        position: new Vector3(x, -1.62, 0),
        velocityX: 3,
        speed: 3,
      })
    );

    try {
      renderer.initialize(createMockScene());
      renderer.updateConfig(
        createParams({ intensity: 1, emissionStyle: "banked-ember" })
      );
      for (let frame = 0; frame < 60; frame++) {
        renderer.update(tips, 1 / 60, {
          currentStep: frame / 4,
          totalSteps: 16,
        });
      }

      expect(
        frames.some(
          ({ densestHorizontalBand }) =>
            (densestHorizontalBand?.groundClampedCount ?? 0) > 0
        )
      ).toBe(false);

      renderer.reset();
      frames.length = 0;
      for (let frame = 0; frame < 60; frame++) {
        renderer.update(tips, 1 / 60, {
          currentStep: frame / 4,
          totalSteps: 16,
          collisionFloorY: -1.56,
        });
      }

      const collisionBands = frames.flatMap(({ densestHorizontalBand }) =>
        densestHorizontalBand && densestHorizontalBand.groundClampedCount > 0
          ? [densestHorizontalBand]
          : []
      );
      expect(collisionBands.length).toBeGreaterThan(0);
      expect(collisionBands.every(({ yCenter }) => yCenter < -1.5)).toBe(true);
    } finally {
      stopObserving();
    }
  });

  it("uses bounded quality-tier capacities", () => {
    const low = new CharcoalRenderer3D(QualityTier.LOW).getDebugSnapshot();
    const medium = new CharcoalRenderer3D(
      QualityTier.MEDIUM
    ).getDebugSnapshot();
    const high = new CharcoalRenderer3D(QualityTier.HIGH).getDebugSnapshot();

    expect(low).toMatchObject({ sparkCapacity: 1200, fragmentCapacity: 300 });
    expect(medium).toMatchObject({
      sparkCapacity: 3600,
      fragmentCapacity: 900,
    });
    expect(high).toMatchObject({
      sparkCapacity: 7200,
      fragmentCapacity: 1800,
    });
  });

  it("disposes every owned object cleanly", () => {
    const scene = createMockScene();
    renderer.initialize(scene);
    renderer.dispose();

    expect(scene.remove).toHaveBeenCalledTimes(2);
    expect(() => new CharcoalRenderer3D().dispose()).not.toThrow();
  });
});
