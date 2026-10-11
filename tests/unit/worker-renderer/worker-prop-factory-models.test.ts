import { PropType, type PropBuild } from "@austencloud/scene-3d";
import { Group, Mesh, MeshStandardMaterial, SphereGeometry } from "three";
import { describe, expect, it } from "vitest";
import { createWorkerPropVisual } from "#lib/shared/3d/worker-renderer/worlds/props/worker-prop-factory.js";

const BUILD: PropBuild = {
  finish: "fire",
  fanBuild: "pictograph",
  fanFrameColor: "black",
  fanCover: "bare",
};

describe("worker prop authored model parity", () => {
  it("recolors only marked materials and preserves untouched hardware", async () => {
    const source = new Group();
    source.userData.tka_recolor_mode = "palette-main";
    const recolor = new MeshStandardMaterial({ color: "#808080" });
    recolor.name = "TKA_Test_Recolor";
    const hardware = new MeshStandardMaterial({ color: "#dddddd" });
    hardware.name = "Hardware";
    source.add(new Mesh(new SphereGeometry(0.1), [recolor, hardware]));

    const result = await createWorkerPropVisual({
      propType: PropType.CAPSULE_BATON,
      color: "red",
      length: 0.8,
      thickness: 0.01,
      layer: 0,
      build: BUILD,
      loadModel: async () => source,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const clone = result.visual.root.getObjectByProperty(
      "isMesh",
      true
    ) as Mesh;
    const materials = clone.material as MeshStandardMaterial[];
    expect(materials[0]).not.toBe(recolor);
    expect(materials[0].color.getHexString()).toBe("ef4444");
    expect(materials[0].emissiveIntensity).toBe(0);
    expect(materials[1]).toBe(hardware);
    expect(clone.castShadow).toBe(true);
    result.visual.dispose();
  });

  it("selects the exact fan build and color without touching sibling builds", async () => {
    const source = new Group();
    for (const name of [
      "Fan_Fire",
      "Fan_Lotus",
      "Fan_Day",
      "Fan_Moon",
      "Fan_Cover",
    ]) {
      const part = new Group();
      part.name = name;
      source.add(part);
    }
    const moonMaterial = new MeshStandardMaterial({ color: "#ffffff" });
    moonMaterial.name = "TKA_Fan_Moon_Frame";
    source
      .getObjectByName("Fan_Moon")
      ?.add(new Mesh(new SphereGeometry(0.1), moonMaterial));

    const result = await createWorkerPropVisual({
      propType: PropType.BIGFAN,
      color: "blue",
      length: 0.8,
      thickness: 0.01,
      layer: 0,
      build: {
        ...BUILD,
        fanBuild: "moon",
        fanFrameColor: "white",
        fanCover: "covered",
      },
      loadModel: async () => source,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.visual.source).toBe("fan-gltf");
    expect(result.visual.root.getObjectByName("Fan_Fire")?.visible).toBe(false);
    expect(result.visual.root.getObjectByName("Fan_Moon")?.visible).toBe(true);
    expect(result.visual.root.getObjectByName("Fan_Cover")?.visible).toBe(
      false
    );
    const transform = result.visual.root.getObjectByName(
      "worker-prop-fan-model-transform"
    );
    expect(transform?.scale.toArray()).toEqual([1.4, 1.4, 1.4]);
    const renderedMoon = result.visual.root.getObjectByName("Fan_Moon");
    const renderedMesh = renderedMoon?.children[0] as Mesh;
    expect(
      (renderedMesh.material as MeshStandardMaterial).color.getHexString()
    ).toBe("3b82f6");
    result.visual.dispose();
  });

  it("uses the selected fire/day finish for triad material construction", async () => {
    const fire = await createWorkerPropVisual({
      propType: PropType.TRIAD,
      color: "blue",
      length: 0.8,
      thickness: 0.01,
      build: BUILD,
    });
    const day = await createWorkerPropVisual({
      propType: PropType.TRIAD,
      color: "blue",
      length: 0.8,
      thickness: 0.01,
      build: { ...BUILD, finish: "day" },
    });
    expect(fire.ok && day.ok).toBe(true);
    if (!fire.ok || !day.ok) return;
    const fireMaterials = new Set<MeshStandardMaterial>();
    const dayMaterials = new Set<MeshStandardMaterial>();
    fire.visual.root.traverse((object) => {
      if ((object as Mesh).isMesh) {
        fireMaterials.add((object as Mesh).material as MeshStandardMaterial);
      }
    });
    day.visual.root.traverse((object) => {
      if ((object as Mesh).isMesh) {
        dayMaterials.add((object as Mesh).material as MeshStandardMaterial);
      }
    });
    expect(
      [...fireMaterials].some((material) => material.metalness === 0.62)
    ).toBe(true);
    expect(
      [...dayMaterials].some((material) => material.emissiveIntensity === 0.55)
    ).toBe(true);
    fire.visual.dispose();
    day.visual.dispose();
  });
});
