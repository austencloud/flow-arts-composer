import { describe, expect, it, vi } from "vitest";
import { ShaderMaterial } from "three";
import { createVoidEnvironmentWorld } from "#lib/shared/3d/environments/worlds/void/void-environment-world.js";

describe("createVoidEnvironmentWorld", () => {
  it("constructs the complete production platform and light rig", () => {
    const world = createVoidEnvironmentWorld({ groundY: -1.5 });
    const names = new Set<string>();
    world.root.traverse((object) => names.add(object.name));

    expect(names).toContain("void-platform-body");
    expect(names).toContain("void-platform-grid");
    expect(names).toContain("void-platform-top-ring");
    expect(names).toContain("void-platform-bottom-ring");
    for (let index = 0; index < 8; index += 1) {
      expect(names).toContain(`void-platform-column-${index}`);
    }
    expect(
      world.root.children.filter((child) => child.type.endsWith("Light"))
    ).toHaveLength(2);

    world.dispose();
  });

  it("advances the shared grid shader and disposes exactly once", () => {
    const world = createVoidEnvironmentWorld({ groundY: -1.5 });
    const grid = world.root.getObjectByName("void-platform-grid") as {
      material: ShaderMaterial;
    };
    const dispose = vi.spyOn(grid.material, "dispose");

    world.update(0.25);
    expect(grid.material.uniforms.uTime!.value).toBeCloseTo(0.25);
    world.dispose();
    world.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("resolves performer clearance against authored stage growth", () => {
    const world = createVoidEnvironmentWorld({
      groundY: -1,
      stageRadius: 8,
      stageRadiusGrowth: 1,
    });
    const body = world.root.getObjectByName("void-platform-body") as {
      geometry: { parameters: { radiusTop: number } };
    };

    expect(body.geometry.parameters.radiusTop).toBe(8);
    world.dispose();
  });
});
