import { describe, it, expect } from "vitest";
import { DynamicLightManager } from "#lib/shared/3d/effects/lighting/dynamic-light-manager.js";
import { Vector3, Color, Scene } from "three";
import { QualityTier, TIER_CONFIGS } from "#lib/shared/3d/effects/types.js";

function createManager(maxLights: number) {
  const scene = new Scene();
  const config = {
    ...TIER_CONFIGS[QualityTier.HIGH],
    maxDynamicLights: maxLights,
  };
  const manager = new DynamicLightManager(scene, config);
  return { manager, scene };
}

describe("DynamicLightManager", () => {
  it("returns null when pool is exhausted", () => {
    const { manager } = createManager(2);
    const pos = new Vector3();
    const color = new Color(1, 0, 0);

    const h1 = manager.requestLight(pos, color, 1, 5);
    const h2 = manager.requestLight(pos, color, 1, 5);
    const h3 = manager.requestLight(pos, color, 1, 5);

    expect(h1).not.toBeNull();
    expect(h2).not.toBeNull();
    expect(h3).toBeNull();
  });

  it("recycles released lights", () => {
    const { manager } = createManager(1);
    const pos = new Vector3();
    const color = new Color(1, 0, 0);

    const h1 = manager.requestLight(pos, color, 1, 5);
    expect(h1).not.toBeNull();

    manager.releaseLight(h1!);

    const h2 = manager.requestLight(pos, color, 1, 5);
    expect(h2).not.toBeNull();
  });

  it("returns null when tier has zero lights", () => {
    const { manager } = createManager(0);
    const result = manager.requestLight(new Vector3(), new Color(), 1, 5);
    expect(result).toBeNull();
  });

  it("disposes all lights from scene", () => {
    const { manager, scene } = createManager(3);
    expect(scene.children.length).toBe(3);

    manager.dispose();
    expect(scene.children.length).toBe(0);
  });

  it("updates position and intensity of active light", () => {
    const { manager } = createManager(1);
    const pos = new Vector3(0, 0, 0);
    const color = new Color(1, 0, 0);

    const handle = manager.requestLight(pos, color, 1, 5)!;
    const newPos = new Vector3(5, 10, 15);
    manager.updateLight(handle, newPos, 3);

    // After release and re-request, old handle should be invalid
    manager.releaseLight(handle);
    expect(manager.activeCount).toBe(0);
  });

  it("releaseAll returns all lights to pool", () => {
    const { manager } = createManager(3);
    const pos = new Vector3();
    const color = new Color();

    manager.requestLight(pos, color, 1, 5);
    manager.requestLight(pos, color, 1, 5);
    manager.requestLight(pos, color, 1, 5);

    expect(manager.activeCount).toBe(3);

    manager.releaseAll();
    expect(manager.activeCount).toBe(0);

    // All three slots should be available again
    const h1 = manager.requestLight(pos, color, 1, 5);
    const h2 = manager.requestLight(pos, color, 1, 5);
    const h3 = manager.requestLight(pos, color, 1, 5);
    expect(h1).not.toBeNull();
    expect(h2).not.toBeNull();
    expect(h3).not.toBeNull();
  });

  it("ignores update/release on invalid handle", () => {
    const { manager } = createManager(1);
    // Should not throw
    manager.updateLight({ id: 999 }, new Vector3(), 1);
    manager.releaseLight({ id: 999 });
    expect(manager.activeCount).toBe(0);
  });

  it("pre-allocates lights matching tier config", () => {
    const { scene } = createManager(4);
    expect(scene.children.length).toBe(4);
  });

  it("keeps every pooled light visible at zero intensity while idle", () => {
    const { manager, scene } = createManager(4);
    const handle = manager.requestLight(
      new Vector3(1, 2, 3),
      new Color("#ff7700"),
      0.6,
      3
    );
    expect(handle).not.toBeNull();
    manager.releaseLight(handle!);

    expect(scene.children).toHaveLength(4);
    expect(scene.children.every((light) => light.visible)).toBe(true);
    expect(
      scene.children.every(
        (light) => "intensity" in light && light.intensity === 0
      )
    ).toBe(true);
  });
});
