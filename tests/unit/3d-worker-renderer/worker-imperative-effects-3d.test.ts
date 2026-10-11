import { afterEach, describe, expect, it, vi } from "vitest";
import { PerspectiveCamera, Scene } from "three";
import { TrailRenderer3D } from "#lib/shared/3d/effects/trails/trail-renderer-3d.js";
import { LedRenderer3D } from "#lib/shared/3d/effects/led/led-renderer-3d.js";
import { PovStripRenderer3D } from "#lib/shared/3d/effects/poi/pov-strip-renderer-3d.js";
import { MoonFanDiffuserRenderer3D } from "#lib/shared/3d/effects/led/moon-fan-diffuser-renderer-3d.js";
import { DynamicLightManager } from "#lib/shared/3d/effects/lighting/dynamic-light-manager.js";
import { QualityTier, TIER_CONFIGS } from "#lib/shared/3d/effects/types.js";
import { createEmptyPattern } from "#lib/shared/poi/domain/strip-pattern.js";
import { WorkerImperativeEffects3D } from "#lib/shared/3d/worker-renderer/effects/worker-imperative-effects-3d.js";
import type {
  WorkerImperativeEffectFrame,
  WorkerSceneEffectsSnapshot,
  WorkerTrailEffectFrame,
} from "#lib/shared/3d/worker-renderer/domain/worker-renderer-protocol.js";

function trail(sequence = 1): WorkerTrailEffectFrame {
  return {
    renderer: "trail",
    sourceId: "p1:0:right-end",
    sampleSequence: sequence,
    enabled: true,
    position: [1, 2, 3],
    config: {
      maxPoints: 256,
      width: 0.04,
      color: "#3b82f6",
      opacity: 0.85,
      rainbow: false,
      qualityTier: "high",
      mode: "fade",
      fadeDuration: 2,
      emissiveStrength: 3.2,
    },
  };
}

function otherFrames(): WorkerImperativeEffectFrame[] {
  const pattern = createEmptyPattern(2, 1, "test");
  return [
    {
      renderer: "led",
      sourceId: "p1:0:led",
      sampleSequence: 1,
      enabled: true,
      qualityTier: "high",
      sampledAtSeconds: 1,
      tips: [
        {
          position: [1, 2, 3],
          r: 1,
          g: 0,
          b: 0,
          brightness: 1,
          velocity: [0, 1, 0],
          speed: 1,
        },
      ],
    },
    {
      renderer: "pov",
      sourceId: "p1:1:pov",
      sampleSequence: 1,
      enabled: true,
      qualityTier: "medium",
      ledCount: 2,
      staffAxis: [1, 0, 0],
      staffCenter: [0, 1, 0],
      staffHalfLength: 0.5,
      frameIndex: 0,
      pattern,
      sampledAtSeconds: 1,
      brightness: 0.8,
      persistenceDuration: 0.12,
    },
    {
      renderer: "moon-fan",
      sourceId: "p1:0:moon-fan",
      sampleSequence: 1,
      enabled: true,
      worldCenter: [0, 1, 0],
      worldRotation: [0, 0, 0, 1],
      ledColors: Array.from({ length: 78 }, () => ({ r: 1, g: 0, b: 0 })),
      brightness: 0.8,
      scale: 1,
    },
  ];
}

describe("worker imperative effects", () => {
  afterEach(() => vi.restoreAllMocks());

  it("samples a trail once per app-owned frame and keeps its fade updating", () => {
    const addPoint = vi.spyOn(TrailRenderer3D.prototype, "addPoint");
    const update = vi.spyOn(TrailRenderer3D.prototype, "update");
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const effects = new WorkerImperativeEffects3D(scene, null);

    effects.apply([trail(1)], camera);
    effects.update(1 / 60, camera);
    effects.update(1 / 60, camera);
    expect(addPoint).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(2);

    effects.apply([trail(2)], camera);
    effects.update(1 / 60, camera);
    expect(addPoint).toHaveBeenCalledTimes(2);
    effects.dispose();
  });

  it("borrows and releases trail light slots from the scene effect owner", () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const lights = new DynamicLightManager(
      scene,
      TIER_CONFIGS[QualityTier.HIGH]
    );
    const effects = new WorkerImperativeEffects3D(scene, lights);

    effects.apply([trail()], camera);
    effects.update(1 / 60, camera);
    effects.update(0.3, camera);
    expect(lights.activeCount).toBe(1);

    effects.apply([], camera);
    effects.update(1 / 60, camera);
    effects.update(0.2, camera);
    expect(lights.activeCount).toBe(0);

    effects.dispose();
    lights.dispose();
  });

  it("feeds LED, POV, and moon-fan frames into their canonical renderers", () => {
    const ledUpdate = vi.spyOn(LedRenderer3D.prototype, "update");
    const ledReset = vi.spyOn(LedRenderer3D.prototype, "reset");
    const povUpdate = vi.spyOn(PovStripRenderer3D.prototype, "update");
    const povReset = vi.spyOn(PovStripRenderer3D.prototype, "reset");
    const moonUpdate = vi.spyOn(MoonFanDiffuserRenderer3D.prototype, "update");
    const moonReset = vi.spyOn(MoonFanDiffuserRenderer3D.prototype, "reset");
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const effects = new WorkerImperativeEffects3D(scene, null);
    const frames = otherFrames();

    effects.apply(frames, camera);
    effects.apply(frames, camera);
    expect(ledUpdate).toHaveBeenCalledTimes(1);
    expect(povUpdate).toHaveBeenCalledTimes(1);
    expect(moonUpdate).toHaveBeenCalledTimes(1);

    effects.apply([], camera);
    expect(ledReset).toHaveBeenCalled();
    expect(povReset).toHaveBeenCalled();
    expect(moonReset).toHaveBeenCalled();
    effects.dispose();
  });

  it("keeps the complete effects protocol payload structured-clone-safe", () => {
    const snapshot: WorkerSceneEffectsSnapshot = {
      playing: true,
      sources: [],
      imperative: [trail(), ...otherFrames()],
    };

    const cloned = structuredClone(snapshot);
    expect(cloned.playing).toBe(true);
    expect(cloned.imperative?.map((frame) => frame.renderer)).toEqual([
      "trail",
      "led",
      "pov",
      "moon-fan",
    ]);
    const pov = cloned.imperative?.find((frame) => frame.renderer === "pov");
    expect(ArrayBuffer.isView(pov?.pattern.frames[0]?.colors)).toBe(true);
    expect(Array.from(pov?.pattern.frames[0]?.colors ?? [])).toEqual([
      0, 0, 0, 0, 0, 0,
    ]);
  });
});
