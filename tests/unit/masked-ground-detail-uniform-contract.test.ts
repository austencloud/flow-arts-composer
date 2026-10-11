import { describe, expect, it } from "vitest";
import {
  Color,
  MeshStandardMaterial,
  Texture,
  Vector2,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
} from "three";
import { patchMaskedGroundDetailMaterial } from "#lib/shared/3d/environments/primitives/masked-ground-detail-material.js";

/**
 * A 2026-08-31 identifier sweep renamed the JS side of the red/blue detail
 * samplers to right/left without touching the GLSL that declares and samples
 * them. WebGL silently left those samplers on texture unit 0 and the baseline
 * colours at zero, which rendered the Flow Fest far ground salmon. Every
 * uniform the patch assigns has to be declared by the shader it builds.
 */
function compileWithPatch(
  options: Partial<Parameters<typeof patchMaskedGroundDetailMaterial>[4]> = {}
): WebGLProgramParametersWithUniforms {
  const material = new MeshStandardMaterial();
  const texture = new Texture();
  patchMaskedGroundDetailMaterial(
    material,
    { red: texture, green: texture, blue: texture, fourth: texture },
    texture,
    0.9,
    {
      storageKey: "test",
      cacheKey: "test",
      maskOrigin: new Vector2(),
      maskSize: new Vector2(1, 1),
      worldAxisSign: new Vector2(1, -1),
      familyBaselines: [new Color(), new Color(), new Color(), new Color()],
      macroDark: new Color(),
      macroLight: new Color(),
      ...options,
    }
  );
  const shader = {
    uniforms: {},
    vertexShader:
      "#include <common>\n#include <defaultnormal_vertex>\n#include <begin_vertex>\n",
    fragmentShader:
      "#include <common>\n#include <map_fragment>\n#include <normal_fragment_maps>\n#include <roughnessmap_fragment>\n",
  } as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader;
}

function declaredUniforms(source: string): Set<string> {
  return new Set(
    [...source.matchAll(/uniform\s+\w+\s+(\w+)\s*;/g)].map((match) => match[1]!)
  );
}

describe("masked ground detail uniform contract", () => {
  it("declares every uniform the patch assigns, in the fullest option set", () => {
    const shader = compileWithPatch({
      surfaceDetail: {
        maps: { height: new Texture() },
        scale: 1,
        albedoStrength: 0.2,
        normalStrength: 0.2,
        breakup: { scale: 1.3, rotation: 0.7, blendScale: 4 },
      },
      contactZone: {
        center: new Vector2(),
        halfSize: new Vector2(1, 1),
        feather: 1,
        noise: 0.1,
        strength: 0.5,
      },
      deTiling: {
        warpScale: 10,
        warpStrength: 1,
        latticeScale: 20,
        latticeMixLow: 0.2,
        latticeMixHigh: 0.4,
      },
      distanceGrading: {
        start: 10,
        end: 100,
        detailAlbedo: 0.3,
        detailNormal: 0,
        roughnessFloor: 0.9,
        grazingRoughnessFloor: 0.95,
        grazingStart: 0.3,
      },
      specularAntiAliasing: { variance: 0.2, threshold: 0.2 },
    });
    const declared = new Set([
      ...declaredUniforms(shader.vertexShader),
      ...declaredUniforms(shader.fragmentShader),
    ]);
    const assigned = Object.keys(shader.uniforms).filter((name) =>
      name.startsWith("uMaskedGround")
    );
    expect(assigned.length).toBeGreaterThan(30);
    const missing = assigned.filter((name) => !declared.has(name));
    expect(missing).toEqual([]);
  });

  it("samples all four family maps and baselines by their channel names", () => {
    const shader = compileWithPatch();
    for (const name of [
      "uMaskedGroundRedMap",
      "uMaskedGroundGreenMap",
      "uMaskedGroundBlueMap",
      "uMaskedGroundFourthMap",
      "uMaskedGroundBaselineRed",
      "uMaskedGroundBaselineGreen",
      "uMaskedGroundBaselineBlue",
      "uMaskedGroundBaselineFourth",
    ]) {
      expect(shader.uniforms[name]?.value, name).toBeDefined();
      // Declared once, then read at least once in the family blend.
      const uses = shader.fragmentShader.split(name).length - 1;
      expect(uses, name).toBeGreaterThanOrEqual(2);
    }
  });
});
