import { describe, expect, it } from "vitest";
import {
  Color,
  MeshStandardMaterial,
  Texture,
  Vector2,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { patchMaskedGroundDetailMaterial } from "$lib/shared/3d/environments/primitives/masked-ground-detail-material";
import volcanicWorldR7 from "$lib/shared/3d/environments/domain/models/scene-configs/ember-volcanic-world-r7.json";
import {
  EMBER_GROUND_DETAIL_MASK,
  EMBER_GROUND_DETAIL_TEXTURES,
  EMBER_GROUND_SURFACE_TEXTURES,
  emberGroundDetailTier,
  inheritEmberGroundDetailPatch,
  isEmberGroundDetailSurface,
  patchEmberGroundDetailMaterial,
} from "$lib/shared/3d/environments/scenes/ember/ember-ground-detail";

function createShaderStub(): WebGLProgramParametersWithUniforms {
  return {
    uniforms: {},
    vertexShader:
      "#include <common>\n#include <defaultnormal_vertex>\n#include <begin_vertex>",
    // Chunk order matches three's meshphysical fragment shader: roughnessFactor
    // is declared before the normal blocks that grade it.
    fragmentShader:
      "#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>",
  } as WebGLProgramParametersWithUniforms;
}

function compileEmberGroundDetail(
  name = "Ember_R9_fresh-rift-synthesis_Blended_Terrain"
) {
  const material = new MeshStandardMaterial({
    name,
    color: "#354149",
  });
  const shader = createShaderStub();
  const patch = patchEmberGroundDetailMaterial(
    material,
    {
      youngLava: new Texture(),
      ironContact: new Texture(),
      fracturedBasalt: new Texture(),
      shelteredAsh: new Texture(),
    },
    new Texture(),
    { height: new Texture() },
    0.92,
    { preserveColor: material.color }
  );
  material.onBeforeCompile(shader, {} as never);
  return { material, shader, patch };
}

describe("Ember Fresh Rift ground detail", () => {
  it("publishes the four approved ecology families and world mask", () => {
    expect(EMBER_GROUND_DETAIL_TEXTURES).toEqual({
      youngLava: "/textures/ember-surface-r9/young-lava.png",
      ironContact: "/textures/ember-surface-r9/iron-contact.png",
      fracturedBasalt: "/textures/ember-midflank-r5/rock-ground-color.jpg",
      shelteredAsh: "/textures/ember-surface-r9/sheltered-ash.png",
    });
    expect(EMBER_GROUND_DETAIL_MASK).toBe(
      "/textures/ember-midflank-r5/family-mask.png"
    );
    expect(EMBER_GROUND_SURFACE_TEXTURES).toEqual({
      height: "/textures/ember-surface-r11/rock-ground-height.jpg",
    });
  });

  it("targets production ground roles without touching hero formations", () => {
    const r9 = new MeshStandardMaterial({
      name: "Ember_R9_fresh-rift-synthesis_roped-pahoehoe",
    });
    const legacy = new MeshStandardMaterial({
      name: "Ember_Ground_Blackglass_PBR",
    });

    expect(isEmberGroundDetailSurface("volcanic-basin", r9)).toBe(true);
    expect(isEmberGroundDetailSurface("playable-shelf", r9)).toBe(true);
    expect(isEmberGroundDetailSurface("meshy-hero-geology", r9)).toBe(false);
    expect(isEmberGroundDetailSurface("volcanic-basin", legacy)).toBe(false);
  });

  it("reaches the upcountry terrain the performer bowl used to leave bare", () => {
    const r9 = new MeshStandardMaterial({
      name: "Ember_R9_fresh-rift-synthesis_windborne-ash",
    });

    // The pale family: two meshes the gate never covered, so they rendered
    // their baked beige map with no synthesised crust on it at all.
    expect(isEmberGroundDetailSurface("meshy-distant-caldera", r9)).toBe(true);
    expect(isEmberGroundDetailSurface("meshy-fumarole-talus", r9)).toBe(true);
    // Covered before only because GLTFLoader shares material instances; named
    // now so the reach is deliberate rather than incidental.
    expect(isEmberGroundDetailSurface("caldera-bank", r9)).toBe(true);
    expect(isEmberGroundDetailSurface("perimeter-talus-cluster", r9)).toBe(true);
    expect(isEmberGroundDetailSurface("meshy-lava-bank", r9)).toBe(true);
    // The hero escarpment keeps its authored columnar normals.
    expect(isEmberGroundDetailSurface("meshy-hero-geology", r9)).toBe(false);
  });

  it("splits the palette into a bowl tier and an upcountry tier", () => {
    expect(
      emberGroundDetailTier(
        new MeshStandardMaterial({
          name: "Ember_R9_fresh-rift-synthesis_roped-pahoehoe",
        })
      )
    ).toBe("stage");
    expect(
      emberGroundDetailTier(
        new MeshStandardMaterial({
          name: "Ember_R9_fresh-rift-synthesis_iron-contact-crust",
        })
      )
    ).toBe("stage");
    expect(
      emberGroundDetailTier(
        new MeshStandardMaterial({
          name: "Ember_R9_fresh-rift-synthesis_Blended_Terrain",
        })
      )
    ).toBe("upcountry");
    expect(
      emberGroundDetailTier(
        new MeshStandardMaterial({
          name: "Ember_R9_fresh-rift-synthesis_windborne-ash",
        })
      )
    ).toBe("upcountry");

    const stage = compileEmberGroundDetail(
      "Ember_R9_fresh-rift-synthesis_roped-pahoehoe"
    );
    const upcountry = compileEmberGroundDetail();

    // preserveColor parks material.color at white, so an atmosphere tint lerp
    // cannot reach a patched surface. The upcountry profile is what pulls the
    // pale baked terrain into the volcanic family instead: the synthesised
    // detail carries most of the albedo, and the macro range runs darker and
    // warmer than the bowl's.
    expect(
      stage.shader.uniforms.uMaskedGroundAbsoluteColorStrength.value
    ).toBe(0.46);
    expect(
      upcountry.shader.uniforms.uMaskedGroundAbsoluteColorStrength.value
    ).toBeGreaterThan(
      stage.shader.uniforms.uMaskedGroundAbsoluteColorStrength.value
    );
    expect(
      upcountry.shader.uniforms.uMaskedGroundAbsoluteColorStrength.value
    ).toBe(0.82);
    expect(upcountry.shader.uniforms.uMaskedGroundFamilyContrast.value)
      .toBeGreaterThan(stage.shader.uniforms.uMaskedGroundFamilyContrast.value);
    expect(upcountry.shader.uniforms.uMaskedGroundMacroDark.value.r)
      .toBeLessThan(stage.shader.uniforms.uMaskedGroundMacroDark.value.r);
    expect(upcountry.shader.uniforms.uMaskedGroundMacroLight.value.r)
      .toBeLessThan(stage.shader.uniforms.uMaskedGroundMacroLight.value.r);
    // Warm-biased: the upcountry macro light has to fall off toward blue.
    expect(upcountry.shader.uniforms.uMaskedGroundMacroLight.value.b)
      .toBeLessThan(upcountry.shader.uniforms.uMaskedGroundMacroLight.value.r);

    // Both tiers share one compiled program; only uniforms differ.
    expect(stage.material.customProgramCacheKey()).toBe(
      upcountry.material.customProgramCacheKey()
    );

    stage.patch.dispose();
    upcountry.patch.dispose();
  });

  it("composes the shared world-space material owner and restores cleanly", () => {
    const material = new MeshStandardMaterial({
      name: "Ember_R9_fresh-rift-synthesis_Blended_Terrain",
      color: "#354149",
    });
    const detailMaps = {
      youngLava: new Texture(),
      ironContact: new Texture(),
      fracturedBasalt: new Texture(),
      shelteredAsh: new Texture(),
    };
    const familyMask = new Texture();
    const surfaceMaps = {
      height: new Texture(),
    };
    const shader = {
      uniforms: {},
      vertexShader:
        "#include <common>\n#include <defaultnormal_vertex>\n#include <begin_vertex>",
      // Chunk order matches three's meshphysical fragment shader: roughnessFactor
      // is declared before the normal blocks that grade it.
      fragmentShader:
        "#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>",
    } as WebGLProgramParametersWithUniforms;

    const patch = patchEmberGroundDetailMaterial(
      material,
      detailMaps,
      familyMask,
      surfaceMaps,
      0.92,
      { preserveColor: material.color }
    );
    expect(material.color.getHexString()).toBe("ffffff");
    material.onBeforeCompile(shader, {} as never);

    expect(shader.uniforms.uMaskedGroundRedMap.value).toBe(
      detailMaps.youngLava
    );
    expect(shader.uniforms.uMaskedGroundGreenMap.value).toBe(
      detailMaps.ironContact
    );
    expect(shader.uniforms.uMaskedGroundBlueMap.value).toBe(
      detailMaps.fracturedBasalt
    );
    expect(shader.uniforms.uMaskedGroundFourthMap.value).toBe(
      detailMaps.shelteredAsh
    );
    expect(shader.uniforms.uMaskedGroundFamilyMask.value).toBe(familyMask);
    expect(shader.uniforms.uMaskedGroundMaskOrigin.value.toArray()).toEqual([
      -190, -145,
    ]);
    expect(shader.uniforms.uMaskedGroundMaskSize.value.toArray()).toEqual([
      380, 335,
    ]);
    expect(shader.uniforms.uMaskedGroundWorldAxisSign.value.toArray()).toEqual([
      1, 1,
    ]);
    // Blended_Terrain is the basin, so this compiles the upcountry profile.
    expect(shader.uniforms.uMaskedGroundAbsoluteColorStrength.value).toBe(0.82);
    expect(shader.uniforms.uMaskedGroundRoughnessFloor.value).toBe(0.68);
    expect(shader.uniforms.uMaskedGroundFamilyContrast.value).toBe(2.05);
    expect(shader.uniforms.uMaskedGroundHeightResponse.value).toBe(0.34);
    expect(shader.uniforms.uMaskedGroundMacroScale.value).toBe(42);
    expect(shader.uniforms.uMaskedGroundMacroDetailScale.value).toBe(12);
    expect(shader.uniforms.uMaskedGroundSlopeFamilyStrength.value).toBe(0.65);
    expect(shader.uniforms.uMaskedGroundSurfaceHeightMap.value).toBe(
      surfaceMaps.height
    );
    expect(shader.uniforms.uMaskedGroundSurfaceScale.value).toBe(1.55);
    expect(shader.uniforms.uMaskedGroundSurfaceNormalStrength.value).toBe(0.72);
    expect(shader.vertexShader).toContain("vMaskedGroundWorldNormal");
    expect(shader.fragmentShader).toContain("uMaskedGroundFamilyMask");
    expect(shader.fragmentShader).toContain("maskedGroundSurfaceHeight");
    expect(shader.fragmentShader).toContain("maskedGroundSlopeWeight");
    expect(shader.fragmentShader).toContain("maskedGroundSurfaceGradient");

    const clone = material.clone();
    inheritEmberGroundDetailPatch(material, clone);
    expect(clone.customProgramCacheKey()).toContain(
      "ember-ground-detail-r13-upcountry-reach-v1"
    );
    expect(clone.userData.emberGroundDetailPatch).toBeDefined();

    patch.dispose();
    expect(material.color.getHexString()).toBe("354149");
    expect(material.userData.emberGroundDetailPatch).toBeUndefined();
  });

  it("dissolves the repeat lattice and grades detail out of the far field", () => {
    const { shader, patch } = compileEmberGroundDetail();

    // Warp displacement must clear the 1.55m micro-surface tile, or the basin
    // still repeats its own phase.
    expect(shader.uniforms.uMaskedGroundWarpStrength.value).toBeGreaterThan(
      shader.uniforms.uMaskedGroundSurfaceScale.value
    );
    expect(shader.uniforms.uMaskedGroundWarpScale.value).toBe(26);
    expect(shader.uniforms.uMaskedGroundLatticeScale.value).toBe(34);
    // The mix has to cross 0.5 so neither detail lattice dominates everywhere.
    expect(shader.uniforms.uMaskedGroundLatticeMixLow.value).toBeLessThan(0.5);
    expect(shader.uniforms.uMaskedGroundLatticeMixHigh.value).toBeGreaterThan(
      0.5
    );
    // Second micro-surface lattice must stay irrational against the first.
    expect(shader.uniforms.uMaskedGroundSurfaceBreakupScale.value).toBe(2.63);
    expect(shader.uniforms.uMaskedGroundSurfaceBreakupBlendScale.value).toBe(19);
    expect(shader.fragmentShader).toContain("maskedGroundDetailPoint");
    expect(shader.fragmentShader).toContain("maskedGroundLatticeNorm");
    expect(shader.fragmentShader).toContain("maskedGroundSurfaceBreakupMix");

    // The volcanic plain is ash, not meadow — the shared blade ripple is off.
    expect(shader.uniforms.uMaskedGroundBladeSignal.value).toBe(0);

    // The grade has to survive to the far rim: at 210m the 2.4m primary
    // lattice still covers ten-plus pixels, so fading detail out at 90 was
    // throwing away grain the textures could resolve, and leaving the upcountry
    // slopes as smooth clay under every orbit camera.
    expect(shader.uniforms.uMaskedGroundGradeStart.value).toBe(18);
    expect(shader.uniforms.uMaskedGroundGradeEnd.value).toBe(210);
    expect(shader.uniforms.uMaskedGroundGradeEnd.value).toBeGreaterThan(
      volcanicWorldR7.terrain.middleMaterialEndsAtDistance
    );
    expect(shader.uniforms.uMaskedGroundFarDetailNormal.value).toBe(0.3);
    expect(shader.uniforms.uMaskedGroundFarDetailAlbedo.value).toBe(0.78);
    expect(
      shader.uniforms.uMaskedGroundFarRoughnessFloor.value
    ).toBeGreaterThan(shader.uniforms.uMaskedGroundRoughnessFloor.value);
    expect(
      shader.uniforms.uMaskedGroundGrazingRoughnessFloor.value
    ).toBeGreaterThan(shader.uniforms.uMaskedGroundRoughnessFloor.value);
    expect(shader.fragmentShader).toContain("maskedGroundNormalFade");
    expect(shader.fragmentShader).toContain("maskedGroundGrazing");

    // Filtered roughness folds residual normal aliasing into the BRDF instead
    // of letting far slopes sparkle.
    expect(shader.uniforms.uMaskedGroundSpecularVariance.value).toBe(0.25);
    expect(shader.uniforms.uMaskedGroundSpecularThreshold.value).toBe(0.18);
    expect(shader.fragmentShader).toContain("maskedGroundKernelRoughness");

    // Every grading term is read after roughnessFactor exists and before the
    // lighting model consumes it.
    const roughnessDeclaration = shader.fragmentShader.indexOf(
      "#include <roughnessmap_fragment>"
    );
    expect(roughnessDeclaration).toBeGreaterThan(-1);
    expect(shader.fragmentShader.indexOf("maskedGroundKernelRoughness")).
      toBeGreaterThan(roughnessDeclaration);

    patch.dispose();
  });

  it("declares every uniform it binds, so no sampler falls back to unit 0", () => {
    // A hand-migration codemod once renamed the JS side of the red/blue
    // samplers (red→right, blue→left) without touching the GLSL. WebGL binds
    // an undeclared sampler to nothing and reads texture unit 0 instead, which
    // flooded the whole ember basin with whatever texture happened to sit
    // there. Every bound uniform must have a matching GLSL declaration.
    const { shader, patch } = compileEmberGroundDetail();
    const glsl = `${shader.vertexShader}\n${shader.fragmentShader}`;
    const bound = Object.keys(shader.uniforms).filter((name) =>
      name.startsWith("uMaskedGround")
    );
    expect(bound.length).toBeGreaterThan(10);
    const undeclared = bound.filter(
      (name) => !new RegExp(`uniform\\s+\\w+\\s+${name}\\s*;`).test(glsl)
    );
    expect(undeclared).toEqual([]);

    // And the reverse: nothing the shader reads may be left unbound.
    const declared = Array.from(
      glsl.matchAll(/uniform\s+\w+\s+(uMaskedGround\w+)\s*;/g),
      (match) => match[1]!
    );
    const unbound = declared.filter((name) => !(name in shader.uniforms));
    expect(unbound).toEqual([]);
    patch.dispose();
  });

  it("keeps the shared owner's de-tiling opt-in, so other scenes pay nothing", () => {
    const material = new MeshStandardMaterial({ name: "Shared_Ground" });
    const shader = createShaderStub();

    patchMaskedGroundDetailMaterial(
      material,
      {
        red: new Texture(),
        green: new Texture(),
        blue: new Texture(),
        fourth: new Texture(),
      },
      new Texture(),
      0.9,
      {
        storageKey: "sharedGroundDetailPatch",
        cacheKey: "shared-ground-detail-test",
        maskOrigin: new Vector2(0, 0),
        maskSize: new Vector2(100, 100),
        worldAxisSign: new Vector2(1, 1),
        familyBaselines: [
          new Color(0.1, 0.1, 0.1),
          new Color(0.1, 0.1, 0.1),
          new Color(0.1, 0.1, 0.1),
          new Color(0.1, 0.1, 0.1),
        ],
        macroDark: new Color(0.9, 0.9, 0.9),
        macroLight: new Color(1.1, 1.1, 1.1),
      }
    );
    material.onBeforeCompile(shader, {} as never);

    expect(shader.uniforms.uMaskedGroundWarpScale).toBeUndefined();
    expect(shader.uniforms.uMaskedGroundGradeStart).toBeUndefined();
    expect(shader.uniforms.uMaskedGroundSpecularVariance).toBeUndefined();
    expect(shader.fragmentShader).not.toContain("maskedGroundKernelRoughness");
    expect(shader.fragmentShader).not.toContain("maskedGroundWarpSeed");
    // The de-tiling and grading terms are substituted as generated identifiers.
    // A reference left behind without its declaration is a GLSL compile error
    // in forest and cherry-blossom that no assertion on ember would reach.
    for (const graded of [
      "maskedGroundDetailPoint",
      "maskedGroundDistanceT",
      "maskedGroundAlbedoFade",
      "maskedGroundNormalFade",
      "maskedGroundDetailStrengthGraded",
    ]) {
      expect(shader.fragmentShader).not.toContain(graded);
    }
    // Blade ripple keeps its historical amplitude for the meadow scenes.
    expect(shader.uniforms.uMaskedGroundBladeSignal.value).toBe(0.025);
  });
});
