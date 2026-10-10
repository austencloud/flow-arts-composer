import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene, ShaderMaterial } from "three";
import { BackgroundType } from "@austencloud/backgrounds";
import { SceneEffectsManager3D } from "#lib/shared/3d/effects/scene-effects/scene-effects-manager-3d.js";
import { isTrackedTip } from "#lib/shared/3d/effects/scene-effects/scene-effect-source-3d.js";
import { resolvePetalEnvironmentProfile } from "#lib/shared/3d/effects/petals/petal-world-art-direction.js";
import {
  resolveBloom3D,
  resolveFire3D,
} from "#lib/shared/effects/translators/webgl3d-translator.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { QualityTier } from "#lib/shared/3d/effects/types.js";

describe("SceneEffectsManager3D", () => {
  it("owns one scene-level mesh per material variant and releases them together", () => {
    const scene = new Scene();
    const manager = new SceneEffectsManager3D();
    manager.initialize(scene);

    // Existing pooled visuals, Goo's strand, drop and puddle meshes, Coal (two
    // draws), Fire's four stable lights, and the four-light scene pool shared
    // by Bloom, Trails, and Zap.
    expect(scene.children).toHaveLength(32);
    manager.update(1 / 60);
    manager.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it("assigns stable, non-overlapping source ranges to rigs", () => {
    const manager = new SceneEffectsManager3D();
    const first = manager.registerRig({ playing: false, sources: [] });
    const second = manager.registerRig({ playing: false, sources: [] });
    expect(second.sourceIdBase - first.sourceIdBase).toBe(4);
    first.dispose();
    second.dispose();
  });

  it("applies the viewer environment profile to the pooled petal material", () => {
    const scene = new Scene();
    const manager = new SceneEffectsManager3D();
    const profile = resolvePetalEnvironmentProfile(BackgroundType.FOREST);
    manager.setPetalEnvironmentProfile(profile);
    manager.initialize(scene);

    const petalMesh = scene.children.find(
      (child) =>
        child instanceof InstancedMesh &&
        child.renderOrder === 103 &&
        (child.material as ShaderMaterial).uniforms?.uBackdropLuminance
    ) as InstancedMesh | undefined;
    const material = petalMesh?.material as ShaderMaterial | undefined;
    expect(material?.uniforms.uBackdropLuminance?.value).toBe(
      profile.backdropLuminance
    );
    expect(material?.uniforms.uContrastStrength?.value).toBe(
      profile.contrastStrength
    );

    manager.dispose();
  });

  it("keeps Bloom optically live while a rig is paused", () => {
    const scene = new Scene();
    const manager = new SceneEffectsManager3D();
    const registration = manager.registerRig({
      playing: false,
      sources: [
        {
          sourceId: 1,
          propIndex: 0,
          tipIndex: 0,
          position: { x: 0, y: 0, z: 0 },
          velocity: { x: 0, y: 0, z: 0 },
          speed: 0,
          currentStep: 0,
          propColor: "#3575e2",
          effect: "bloom",
          params: resolveBloom3D(DEFAULT_EFFECTS_CONFIG.bloom),
          qualityTier: QualityTier.LOW,
        },
      ],
    });
    manager.initialize(scene);
    manager.update(1 / 60);

    const bloom = scene.children.find(
      (child): child is InstancedMesh =>
        child instanceof InstancedMesh && child.renderOrder === 119
    );
    expect(bloom?.count).toBe(1);

    registration.dispose();
    manager.dispose();
  });

  it("batches eight performers into one preallocated Fire renderer", () => {
    const scene = new Scene();
    const manager = new SceneEffectsManager3D();
    const registrations = Array.from({ length: 8 }, (_, performerIndex) =>
      manager.registerRig({
        playing: true,
        sources: [
          {
            sourceId: performerIndex * 4 + 1,
            propIndex: 0,
            tipIndex: 0,
            position: { x: performerIndex, y: 1.4, z: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            speed: 0,
            currentStep: 0,
            propColor: "#3b82f6",
            effect: "fire",
            params: resolveFire3D(DEFAULT_EFFECTS_CONFIG.fire),
            qualityTier: QualityTier.HIGH,
            jerk: 0,
          },
        ],
      })
    );

    manager.initialize(scene);
    manager.update(1 / 60);

    const fireMeshes = scene.children.filter(
      (child): child is InstancedMesh =>
        child instanceof InstancedMesh && child.renderOrder === 100
    );
    expect(fireMeshes).toHaveLength(1);
    expect(fireMeshes[0]!.count).toBeGreaterThan(0);

    for (const registration of registrations) registration.dispose();
    manager.dispose();
  });
});

describe("isTrackedTip", () => {
  it("keeps left/right tracking aligned with canonical tip indices", () => {
    expect(isTrackedTip("left_end", 0)).toBe(true);
    expect(isTrackedTip("left_end", 1)).toBe(false);
    expect(isTrackedTip("right_end", 0)).toBe(false);
    expect(isTrackedTip("right_end", 1)).toBe(true);
    expect(isTrackedTip("both_ends", 0)).toBe(true);
    expect(isTrackedTip("both_ends", 1)).toBe(true);
  });
});
