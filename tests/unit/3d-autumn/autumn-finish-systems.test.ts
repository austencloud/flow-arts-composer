import { describe, expect, it } from "vitest";
import {
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  Texture,
  Vector2,
} from "three";

import {
  inheritRootedWindPatch,
  patchRootedWindMaterial,
} from "#lib/shared/3d/environments/primitives/rooted-wind-material.js";
import { sampleAutumnLanternFlicker } from "#lib/shared/3d/environments/scenes/autumn/runtime/lighting/autumn-lantern-flicker.js";
import { patchAutumnGroundDetailMaterial } from "#lib/shared/3d/environments/scenes/autumn/runtime/ground/autumn-ground-detail.js";
import {
  createAutumnPondNormalMap,
  createAutumnPondSurfaceMaterial,
} from "#lib/shared/3d/environments/scenes/autumn/runtime/water/autumn-pond-surface-material.js";
import {
  calculateAutumnDepthFogFactor,
  getAutumnDepthCohesionProfile,
  patchAutumnDepthCohesionMaterial,
} from "#lib/shared/3d/environments/scenes/autumn/runtime/atmosphere/autumn-depth-cohesion.js";

describe("Autumn finish systems", () => {
  it("builds deterministic seamless pond normals without an asset request", () => {
    const normal = createAutumnPondNormalMap({ seed: 41, size: 32 });
    const repeat = createAutumnPondNormalMap({ seed: 41, size: 32 });
    const variant = createAutumnPondNormalMap({ seed: 67, size: 32 });
    const pixels = normal.image.data as Uint8Array;
    const repeatedPixels = repeat.image.data as Uint8Array;
    const variantPixels = variant.image.data as Uint8Array;

    expect(normal.image.width).toBe(32);
    expect(normal.image.height).toBe(32);
    expect(normal.wrapS).toBe(RepeatWrapping);
    expect(normal.wrapT).toBe(RepeatWrapping);
    expect(normal.colorSpace).toBe(NoColorSpace);
    expect([...pixels]).toEqual([...repeatedPixels]);
    expect([...pixels]).not.toEqual([...variantPixels]);
    expect(
      Array.from(
        { length: pixels.length / 4 },
        (_, index) => pixels[index * 4 + 3]
      ).every((alpha) => alpha === 255)
    ).toBe(true);

    normal.dispose();
    repeat.dispose();
    variant.dispose();
  });

  it("renders the pond without triggering Three's full-scene transmission pass", () => {
    const bodyNormal = new Texture();
    const coatNormal = new Texture();
    const material = createAutumnPondSurfaceMaterial(bodyNormal, coatNormal);

    expect(material.transmission).toBe(0);
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBeGreaterThanOrEqual(0.6);
    expect(material.normalMap).toBe(bodyNormal);
    expect(material.clearcoatNormalMap).toBe(coatNormal);
    expect(material.clearcoat).toBeGreaterThan(0);
    expect(material.depthWrite).toBe(false);

    material.dispose();
    bodyNormal.dispose();
    coatNormal.dispose();
  });

  it("keeps the lantern flicker restrained and deterministic", () => {
    const samples = Array.from({ length: 240 }, (_, index) =>
      sampleAutumnLanternFlicker(index / 30)
    );

    expect(samples.every((sample) => sample >= 0.93 && sample <= 1.07)).toBe(
      true
    );
    expect(
      new Set(samples.map((sample) => sample.toFixed(4))).size
    ).toBeGreaterThan(120);
    expect(sampleAutumnLanternFlicker(3.25)).toBe(
      sampleAutumnLanternFlicker(3.25)
    );
  });

  it("injects GPU-side spatial variation into the rooted wind owner", () => {
    const material = new MeshStandardMaterial();
    const uniforms = patchRootedWindMaterial(material, {
      direction: new Vector2(0.86, 0.5).normalize(),
      strength: 0.14,
      spatialVariation: 0.16,
      normalUpBlend: 0.34,
      minimumRoughness: 0.97,
      specularScale: 0.08,
      cacheKey: "autumn-finish-test",
      storageKey: "autumnFinishTestUniforms",
    });
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <begin_vertex>",
      fragmentShader:
        "#include <common>\n#include <map_fragment>\n#include <normal_fragment_maps>\n#include <roughnessmap_fragment>\n#include <lights_fragment_end>",
    };

    material.onBeforeCompile(shader as never, {} as never);

    expect(uniforms.spatialVariation.value).toBe(0.16);
    expect(material.forceSinglePass).toBe(true);
    expect(shader.vertexShader).toContain("uRootedWindSpatialVariation");
    expect(shader.vertexShader).toContain("rootedWindZoneStrength");
    expect(shader.fragmentShader).toContain("uRootedWindRootDarkening");
    expect(shader.fragmentShader).toContain("rootedWindColorNoise");
    expect(shader.fragmentShader).toContain("rootedWindUpNormal");
    expect(shader.fragmentShader).toContain("uRootedWindMinimumRoughness");
    expect(shader.fragmentShader).toContain("uRootedWindSpecularScale");
    expect(uniforms.rootDarkening.value).toBe(0);
    expect(uniforms.colorVariation.value).toBe(0);
    expect(uniforms.normalUpBlend.value).toBe(0.34);
    expect(uniforms.minimumRoughness.value).toBe(0.97);
    expect(uniforms.specularScale.value).toBe(0.08);

    const clone = material.clone();
    inheritRootedWindPatch(material, clone);
    expect(clone.onBeforeCompile).toBe(material.onBeforeCompile);
    expect(clone.customProgramCacheKey()).toBe(
      material.customProgramCacheKey()
    );
  });

  it("combines leaf-scale colour with the authored ground atlas", () => {
    const material = new MeshStandardMaterial();
    material.name = "Autumn Living Forest Floor";
    const detailMap = new Texture();
    const patch = patchAutumnGroundDetailMaterial(material, detailMap, 0.72);
    const shader = {
      uniforms: {},
      vertexShader:
        "#include <common>\n#include <uv_vertex>\n#include <begin_vertex>",
      fragmentShader:
        "#include <common>\n#include <map_fragment>\n#include <opaque_fragment>",
    };

    material.onBeforeCompile(shader as never, {} as never);

    expect(shader.uniforms.uAutumnGroundDetailMap.value).toBe(detailMap);
    expect(shader.uniforms.uAutumnGroundDetailStrength.value).toBe(0.72);
    expect(shader.vertexShader).toContain("vAutumnGroundDetailUv =");
    expect(shader.vertexShader).toContain("autumnGroundDetailPoint /");
    expect(shader.vertexShader).toContain("vAutumnGroundWorldPosition");
    expect(shader.fragmentShader).toContain("autumnGroundModulation");
    expect(shader.fragmentShader).toContain("vec3(1.15, 0.67, 0.42)");
    expect(shader.fragmentShader).toContain("vec3(1.18, 0.62, 0.38)");
    expect(shader.fragmentShader).toContain("autumnGroundCopper");
    expect(material.customProgramCacheKey()).toContain(
      "autumn-ground-detail-v7"
    );
    expect(shader.fragmentShader).toContain("autumnCabinLane");
    expect(shader.fragmentShader).toContain("autumnGroundRouteMask");
    expect(shader.fragmentShader).toContain("vec3(1.12, 0.62, 0.34)");

    patch.dispose();
    expect(material.userData.autumnGroundDetailPatch).toBeUndefined();
  });

  it("retains seasonal colour after fog on imported depth families", () => {
    const material = new MeshStandardMaterial();
    material.name = "Autumn Larch PBR";
    const patch = patchAutumnDepthCohesionMaterial(material);
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>",
      fragmentShader: "#include <common>\n#include <fog_fragment>",
    };

    material.onBeforeCompile(shader as never, {} as never);

    expect(patch?.profileId).toBe("larch-gold");
    expect(shader.fragmentShader).toContain("uAutumnDepthCohesionGrade");
    expect(shader.fragmentShader).not.toContain("#include <fog_fragment>");
    expect(shader.fragmentShader).toContain("uAutumnDepthFogDensityScale");
    expect(shader.fragmentShader).toContain("autumnDepthSourceLuminance");
    expect(patch?.uniforms.fogDensityScale.value).toBe(0.8);
    expect(patch?.uniforms.luminanceScale.value).toBe(0.9);
    expect(material.customProgramCacheKey()).toContain(
      "autumn-depth-cohesion-larch-gold-v3"
    );
    expect(getAutumnDepthCohesionProfile("Autumn Hero A PBR")).toBeNull();
    expect(getAutumnDepthCohesionProfile("Autumn Hero B PBR")).toBeNull();

    patch?.dispose();
    expect(material.userData.autumnDepthCohesionPatch).toBeUndefined();
  });

  it("keeps adjacent hero and depth trees inside one fog-value range", () => {
    const globalDensity = 0.016;
    const heroFog = calculateAutumnDepthFogFactor(41, globalDensity, 1);
    const importedFog = calculateAutumnDepthFogFactor(62, globalDensity, 0.8);

    expect(heroFog).toBeCloseTo(0.35, 2);
    expect(importedFog).toBeCloseTo(0.47, 2);
    expect(importedFog - heroFog).toBeLessThan(0.13);
  });
});
