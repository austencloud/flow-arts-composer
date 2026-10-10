import { describe, expect, it } from "vitest";
import {
  MeshStandardMaterial,
  Texture,
  Vector2,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { patchRootedWindMaterial } from "#lib/shared/3d/environments/primitives/rooted-wind-material.js";
import { FOREST_LIVING_GRASS_MATERIAL_PROFILE } from "#lib/shared/3d/environments/scenes/forest/forest-grass-material-profile.js";
import {
  isForestGroundMaterial,
  getForestGroundDetailFamily,
  inheritForestGroundDetailPatch,
  patchForestGroundDetailMaterial,
} from "#lib/shared/3d/environments/scenes/forest/forest-ground-detail.js";

describe("Forest ground detail", () => {
  it("keeps living grass matte and stable across camera angles", () => {
    const material = new MeshStandardMaterial();
    const profile = FOREST_LIVING_GRASS_MATERIAL_PROFILE;
    const uniforms = patchRootedWindMaterial(material, {
      direction: new Vector2(0.72, -0.69).normalize(),
      strength: 0.05,
      normalUpBlend: profile.normalUpBlend,
      minimumRoughness: profile.minimumRoughness,
      specularScale: profile.specularScale,
      cacheKey: "forest-grass-material-test",
      storageKey: "forestGrassMaterialTest",
    });
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <begin_vertex>",
      fragmentShader:
        "#include <common>\n#include <map_fragment>\n#include <normal_fragment_maps>\n#include <roughnessmap_fragment>\n#include <lights_fragment_end>",
    } as WebGLProgramParametersWithUniforms;

    material.onBeforeCompile(shader, {} as never);

    expect(uniforms.normalUpBlend.value).toBe(0.72);
    expect(uniforms.minimumRoughness.value).toBe(0.99);
    expect(uniforms.specularScale.value).toBe(0.02);
    expect(shader.fragmentShader).toContain(
      "clamp(uRootedWindNormalUpBlend, 0.0, 0.92)"
    );
    expect(shader.fragmentShader).toContain(
      "reflectedLight.directSpecular *= uRootedWindSpecularScale"
    );
  });

  it("targets only authored Forest terrain families", () => {
    const terrain = new MeshStandardMaterial({ name: "Shade Moss" });
    const tree = new MeshStandardMaterial({ name: "polyhaven-oak-bark" });

    expect(isForestGroundMaterial(terrain)).toBe(true);
    expect(isForestGroundMaterial(tree)).toBe(false);
    expect(getForestGroundDetailFamily(terrain)).toBe("litter");
    expect(getForestGroundDetailFamily(tree)).toBeNull();
  });

  it("patches world-space micro detail and restores the material", () => {
    const material = new MeshStandardMaterial({
      name: "Leaf Duff",
      color: "#59754a",
    });
    const detailMap = new Texture();
    const detailMaps = {
      neutral: detailMap,
      meadow: new Texture(),
      litter: new Texture(),
      damp: new Texture(),
    };
    const familyMask = new Texture();
    const shader = {
      uniforms: {},
      vertexShader:
        "#include <common>\n#include <uv_vertex>\n#include <defaultnormal_vertex>\n#include <begin_vertex>",
      fragmentShader:
        "#include <common>\n#include <map_fragment>\n#include <normal_fragment_maps>\n#include <roughnessmap_fragment>",
    } as WebGLProgramParametersWithUniforms;

    const patch = patchForestGroundDetailMaterial(
      material,
      detailMaps,
      familyMask,
      0.9,
      {
        preserveColor: material.color,
        normalResponse: 0.14,
        roughnessFloor: 0.96,
      }
    );
    expect(material.color.getHexString()).toBe("ffffff");
    material.onBeforeCompile(shader, {} as never);

    // Forest delegates to the shared masked-ground-detail primitive
    // (6a5556bc96), so the uniforms carry the generic `uMaskedGround*` names
    // and the Forest family→channel mapping is what this guards. The mask
    // channels are texture colour channels, not hands: the 2026-08-31 hand
    // sweep renamed them to Right/Left and 59ebc05613 put the source back on
    // red/blue to match the GLSL that declares and reads them.
    expect(shader.uniforms.uMaskedGroundRedMap.value).toBe(detailMap);
    expect(shader.uniforms.uMaskedGroundGreenMap.value).toBe(detailMaps.meadow);
    expect(shader.uniforms.uMaskedGroundBlueMap.value).toBe(detailMaps.litter);
    expect(shader.uniforms.uMaskedGroundFourthMap.value).toBe(detailMaps.damp);
    expect(shader.uniforms.uMaskedGroundFamilyMask.value).toBe(familyMask);
    expect(shader.uniforms.uMaskedGroundDetailStrength.value).toBe(0.9);
    expect(shader.uniforms.uMaskedGroundNormalResponse.value).toBe(0.14);
    expect(shader.uniforms.uMaskedGroundRoughnessFloor.value).toBe(0.96);
    // The primary detail scale used to be inlined as `/ 2.8`; it is now a
    // uniform the Forest caller supplies, so both halves are asserted.
    expect(shader.uniforms.uMaskedGroundPrimaryScale.value).toBe(2.8);
    expect(shader.uniforms.uMaskedGroundHeightResponse.value).toBe(0.18);
    expect(shader.uniforms.uMaskedGroundMacroDetailStrength.value).toBe(0);
    expect(shader.vertexShader).toContain("vMaskedGroundWorldPosition");
    expect(shader.fragmentShader).toContain(
      "maskedGroundPoint / uMaskedGroundPrimaryScale"
    );
    expect(shader.fragmentShader).toContain("secondaryUv");
    expect(shader.fragmentShader).toContain("familyFeather");
    expect(shader.fragmentShader).toContain("maskedGroundSurfaceGradient");
    expect(shader.fragmentShader).toContain(
      "uMaskedGroundHeightResponse * uMaskedGroundDetailStrength"
    );
    expect(shader.fragmentShader).toContain(
      "clamp(uMaskedGroundNormalResponse, 0.0, 0.32)"
    );
    expect(shader.fragmentShader).toContain(
      "roughnessFactor,\n            uMaskedGroundRoughnessFloor"
    );

    const clone = material.clone();
    inheritForestGroundDetailPatch(material, clone);
    expect(clone.customProgramCacheKey()).toContain("forest-ground-detail-v8");
    expect(clone.userData.forestGroundDetailPatch).toBeDefined();

    patch.dispose();
    expect(material.color.getHexString()).not.toBe("ffffff");
    expect(material.userData.forestGroundDetailPatch).toBeUndefined();
  });
});
