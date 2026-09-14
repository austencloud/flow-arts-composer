import type {
  Color,
  MeshStandardMaterial,
  Texture,
  Vector2,
  WebGLProgramParametersWithUniforms,
  WebGLRenderer,
} from "three";

/**
 * Keyed by the family-mask channel each map is weighted by (`red` = mask.r,
 * `green` = mask.g, `blue` = mask.b, `fourth` = mask.a). These are texture
 * channels, not prop hands: the GLSL below declares the samplers under the
 * same names, and a rename on one side only leaves the sampler unbound.
 */
export interface MaskedGroundDetailMaps {
  red: Texture;
  green: Texture;
  blue: Texture;
  fourth: Texture;
}

export interface MaskedGroundSurfaceDetailMaps {
  height: Texture;
}

/**
 * Second, decorrelated sampling of the same micro-surface height map. The two
 * lattices must stay mutually irrational in both scale and orientation — a
 * rational ratio re-aligns them into a coarser grid instead of dissolving one.
 */
export interface MaskedGroundSurfaceBreakup {
  scale: number;
  rotation: number;
  blendScale: number;
}

export interface MaskedGroundSurfaceDetail {
  maps: MaskedGroundSurfaceDetailMaps;
  scale: number;
  albedoStrength: number;
  normalStrength: number;
  breakup?: MaskedGroundSurfaceBreakup;
}

/**
 * Dissolves the visible repeat lattice of the detail layers. `warpStrength`
 * must stay well under `warpScale` so the warp's own gradient never approaches
 * 1.0; past that the detail smears instead of shifting.
 */
export interface MaskedGroundDeTiling {
  warpScale: number;
  warpStrength: number;
  latticeScale: number;
  latticeMixLow: number;
  latticeMixHigh: number;
}

/**
 * View-distance and grazing-angle grading. Detail normals derived from screen
 * derivatives decay into noise once one pixel spans several texture tiles, so
 * they are faded out before that band rather than left to sparkle.
 */
export interface MaskedGroundDistanceGrading {
  start: number;
  end: number;
  detailAlbedo: number;
  detailNormal: number;
  roughnessFloor: number;
  grazingRoughnessFloor: number;
  grazingStart: number;
}

/** Tokuyoshi & Kaplanyan 2019 filtered roughness, Filament's formulation. */
export interface MaskedGroundSpecularAntiAliasing {
  variance: number;
  threshold: number;
}

export interface MaskedGroundContactZone {
  center: Vector2;
  halfSize: Vector2;
  feather: number;
  noise: number;
  strength: number;
}

export interface MaskedGroundDetailOptions {
  storageKey: string;
  cacheKey: string;
  maskOrigin: Vector2;
  maskSize: Vector2;
  worldAxisSign: Vector2;
  familyBaselines: [Color, Color, Color, Color];
  macroDark: Color;
  macroLight: Color;
  preserveColor?: Color;
  normalResponse?: number;
  roughnessFloor?: number;
  absoluteColorStrength?: number;
  primaryScale?: number;
  secondaryScale?: number;
  familyContrast?: number;
  heightResponse?: number;
  macroScale?: number;
  macroDetailScale?: number;
  macroDetailStrength?: number;
  slopeFamilyStrength?: number;
  slopeStart?: number;
  bladeSignal?: number;
  surfaceDetail?: MaskedGroundSurfaceDetail;
  contactZone?: MaskedGroundContactZone;
  deTiling?: MaskedGroundDeTiling;
  distanceGrading?: MaskedGroundDistanceGrading;
  specularAntiAliasing?: MaskedGroundSpecularAntiAliasing;
}

export interface MaskedGroundDetailPatch {
  dispose: () => void;
}

function rotation2(radians: number): string {
  const c = Math.cos(radians).toFixed(5);
  const s = Math.sin(radians).toFixed(5);
  return `mat2(${c}, -${s}, ${s}, ${c})`;
}

export function patchMaskedGroundDetailMaterial(
  material: MeshStandardMaterial,
  detailMaps: MaskedGroundDetailMaps,
  familyMask: Texture,
  strength: number,
  options: MaskedGroundDetailOptions
): MaskedGroundDetailPatch {
  const existing = material.userData[options.storageKey] as
    | MaskedGroundDetailPatch
    | undefined;
  if (existing) return existing;

  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey;
  const previousColor = options.preserveColor?.clone() ?? null;
  const normalResponse = options.normalResponse ?? 0.3;
  const roughnessFloor = options.roughnessFloor ?? 0.98;
  const absoluteColorStrength = options.absoluteColorStrength ?? 0;
  const primaryScale = options.primaryScale ?? 2.8;
  const secondaryScale = options.secondaryScale ?? 7.4;
  const familyContrast = options.familyContrast ?? 1;
  const heightResponse = options.heightResponse ?? 0.18;
  const macroScale = options.macroScale ?? 10.526;
  const macroDetailScale = options.macroDetailScale ?? macroScale;
  const macroDetailStrength = options.macroDetailStrength ?? 0;
  const slopeFamilyStrength = options.slopeFamilyStrength ?? 0;
  const slopeStart = options.slopeStart ?? 0.35;
  const bladeSignal = options.bladeSignal ?? 0.025;
  const surfaceDetail = options.surfaceDetail;
  const contactZone = options.contactZone;
  const deTiling = options.deTiling;
  const distanceGrading = options.distanceGrading;
  const specularAntiAliasing = options.specularAntiAliasing;
  const surfaceBreakup = surfaceDetail?.breakup;
  if (previousColor) material.color.setRGB(1, 1, 1);

  material.onBeforeCompile = (
    shader: WebGLProgramParametersWithUniforms,
    renderer: WebGLRenderer
  ) => {
    previousCompile.call(material, shader, renderer);
    shader.uniforms.uMaskedGroundRedMap = { value: detailMaps.red };
    shader.uniforms.uMaskedGroundGreenMap = { value: detailMaps.green };
    shader.uniforms.uMaskedGroundBlueMap = { value: detailMaps.blue };
    shader.uniforms.uMaskedGroundFourthMap = { value: detailMaps.fourth };
    shader.uniforms.uMaskedGroundFamilyMask = { value: familyMask };
    shader.uniforms.uMaskedGroundDetailStrength = { value: strength };
    shader.uniforms.uMaskedGroundNormalResponse = { value: normalResponse };
    shader.uniforms.uMaskedGroundRoughnessFloor = { value: roughnessFloor };
    shader.uniforms.uMaskedGroundAbsoluteColorStrength = {
      value: absoluteColorStrength,
    };
    shader.uniforms.uMaskedGroundPrimaryScale = { value: primaryScale };
    shader.uniforms.uMaskedGroundSecondaryScale = { value: secondaryScale };
    shader.uniforms.uMaskedGroundFamilyContrast = { value: familyContrast };
    shader.uniforms.uMaskedGroundHeightResponse = { value: heightResponse };
    shader.uniforms.uMaskedGroundMacroScale = { value: macroScale };
    shader.uniforms.uMaskedGroundMacroDetailScale = {
      value: macroDetailScale,
    };
    shader.uniforms.uMaskedGroundMacroDetailStrength = {
      value: macroDetailStrength,
    };
    shader.uniforms.uMaskedGroundSlopeFamilyStrength = {
      value: slopeFamilyStrength,
    };
    shader.uniforms.uMaskedGroundSlopeStart = { value: slopeStart };
    shader.uniforms.uMaskedGroundMaskOrigin = {
      value: options.maskOrigin.clone(),
    };
    shader.uniforms.uMaskedGroundMaskSize = { value: options.maskSize.clone() };
    shader.uniforms.uMaskedGroundWorldAxisSign = {
      value: options.worldAxisSign.clone(),
    };
    shader.uniforms.uMaskedGroundBaselineRed = {
      value: options.familyBaselines[0].clone(),
    };
    shader.uniforms.uMaskedGroundBaselineGreen = {
      value: options.familyBaselines[1].clone(),
    };
    shader.uniforms.uMaskedGroundBaselineBlue = {
      value: options.familyBaselines[2].clone(),
    };
    shader.uniforms.uMaskedGroundBaselineFourth = {
      value: options.familyBaselines[3].clone(),
    };
    shader.uniforms.uMaskedGroundMacroDark = {
      value: options.macroDark.clone(),
    };
    shader.uniforms.uMaskedGroundMacroLight = {
      value: options.macroLight.clone(),
    };
    shader.uniforms.uMaskedGroundContactCenter = {
      value: contactZone?.center.clone() ?? options.maskOrigin.clone(),
    };
    shader.uniforms.uMaskedGroundContactHalfSize = {
      value: contactZone?.halfSize.clone() ?? options.maskSize.clone(),
    };
    shader.uniforms.uMaskedGroundContactFeather = {
      value: contactZone?.feather ?? 1,
    };
    shader.uniforms.uMaskedGroundContactNoise = {
      value: contactZone?.noise ?? 0,
    };
    shader.uniforms.uMaskedGroundContactStrength = {
      value: contactZone?.strength ?? 0,
    };
    shader.uniforms.uMaskedGroundBladeSignal = { value: bladeSignal };
    if (deTiling) {
      shader.uniforms.uMaskedGroundWarpScale = { value: deTiling.warpScale };
      shader.uniforms.uMaskedGroundWarpStrength = {
        value: deTiling.warpStrength,
      };
      shader.uniforms.uMaskedGroundLatticeScale = {
        value: deTiling.latticeScale,
      };
      shader.uniforms.uMaskedGroundLatticeMixLow = {
        value: deTiling.latticeMixLow,
      };
      shader.uniforms.uMaskedGroundLatticeMixHigh = {
        value: deTiling.latticeMixHigh,
      };
    }
    if (distanceGrading) {
      shader.uniforms.uMaskedGroundGradeStart = { value: distanceGrading.start };
      shader.uniforms.uMaskedGroundGradeEnd = { value: distanceGrading.end };
      shader.uniforms.uMaskedGroundFarDetailAlbedo = {
        value: distanceGrading.detailAlbedo,
      };
      shader.uniforms.uMaskedGroundFarDetailNormal = {
        value: distanceGrading.detailNormal,
      };
      shader.uniforms.uMaskedGroundFarRoughnessFloor = {
        value: distanceGrading.roughnessFloor,
      };
      shader.uniforms.uMaskedGroundGrazingRoughnessFloor = {
        value: distanceGrading.grazingRoughnessFloor,
      };
      shader.uniforms.uMaskedGroundGrazingStart = {
        value: distanceGrading.grazingStart,
      };
    }
    if (specularAntiAliasing) {
      shader.uniforms.uMaskedGroundSpecularVariance = {
        value: specularAntiAliasing.variance,
      };
      shader.uniforms.uMaskedGroundSpecularThreshold = {
        value: specularAntiAliasing.threshold,
      };
    }
    if (surfaceDetail) {
      shader.uniforms.uMaskedGroundSurfaceHeightMap = {
        value: surfaceDetail.maps.height,
      };
      shader.uniforms.uMaskedGroundSurfaceScale = {
        value: surfaceDetail.scale,
      };
      shader.uniforms.uMaskedGroundSurfaceAlbedoStrength = {
        value: surfaceDetail.albedoStrength,
      };
      shader.uniforms.uMaskedGroundSurfaceNormalStrength = {
        value: surfaceDetail.normalStrength,
      };
      if (surfaceBreakup) {
        shader.uniforms.uMaskedGroundSurfaceBreakupScale = {
          value: surfaceBreakup.scale,
        };
        shader.uniforms.uMaskedGroundSurfaceBreakupBlendScale = {
          value: surfaceBreakup.blendScale,
        };
      }
    }

    const surfaceDeclarations = surfaceDetail
      ? /* glsl */ `
          uniform sampler2D uMaskedGroundSurfaceHeightMap;
          uniform float uMaskedGroundSurfaceScale;
          uniform float uMaskedGroundSurfaceAlbedoStrength;
          uniform float uMaskedGroundSurfaceNormalStrength;${
            surfaceBreakup
              ? /* glsl */ `
          uniform float uMaskedGroundSurfaceBreakupScale;
          uniform float uMaskedGroundSurfaceBreakupBlendScale;`
              : ""
          }`
      : "";
    const deTilingDeclarations = deTiling
      ? /* glsl */ `
          uniform float uMaskedGroundWarpScale;
          uniform float uMaskedGroundWarpStrength;
          uniform float uMaskedGroundLatticeScale;
          uniform float uMaskedGroundLatticeMixLow;
          uniform float uMaskedGroundLatticeMixHigh;`
      : "";
    const distanceDeclarations = distanceGrading
      ? /* glsl */ `
          uniform float uMaskedGroundGradeStart;
          uniform float uMaskedGroundGradeEnd;
          uniform float uMaskedGroundFarDetailAlbedo;
          uniform float uMaskedGroundFarDetailNormal;
          uniform float uMaskedGroundFarRoughnessFloor;
          uniform float uMaskedGroundGrazingRoughnessFloor;
          uniform float uMaskedGroundGrazingStart;`
      : "";
    const specularDeclarations = specularAntiAliasing
      ? /* glsl */ `
          uniform float uMaskedGroundSpecularVariance;
          uniform float uMaskedGroundSpecularThreshold;`
      : "";

    // The warp displaces the detail lattice by a smooth aperiodic field, so the
    // repeat stops landing on a regular grid. The family mask, macro noise and
    // slope terms deliberately keep reading the unwarped world point — those
    // are authored world anchors, not tiled detail. Scenes that do not opt in
    // keep sampling `maskedGroundPoint` directly, so their generated shader is
    // unchanged.
    const detailPoint = deTiling
      ? "maskedGroundDetailPoint"
      : "maskedGroundPoint";
    const warpSampling = deTiling
      ? /* glsl */ `
          vec2 maskedGroundWarpSeed = maskedGroundPoint
            / uMaskedGroundWarpScale;
          vec2 maskedGroundDetailPoint = maskedGroundPoint
            + (
              vec2(
                maskedGroundNoise(maskedGroundWarpSeed),
                maskedGroundNoise(maskedGroundWarpSeed + vec2(19.3, 7.7))
              ) - 0.5
            ) * uMaskedGroundWarpStrength;`
      : "";
    // Two decorrelated lattices already exist; blending them by an aperiodic
    // field instead of a constant means neither one dominates anywhere. The
    // norm restores the contrast that averaging two samples would otherwise
    // remove (variance-preserving blend, Deliot & Heitz 2019).
    const latticeSampling = deTiling
      ? /* glsl */ `
          float maskedGroundLatticeMix = mix(
            uMaskedGroundLatticeMixLow,
            uMaskedGroundLatticeMixHigh,
            smoothstep(
              0.25,
              0.75,
              maskedGroundNoise(
                maskedGroundPoint / uMaskedGroundLatticeScale
                  + vec2(11.4, -6.2)
              )
            )
          );
          float maskedGroundLatticeNorm = inversesqrt(
            (1.0 - maskedGroundLatticeMix) * (1.0 - maskedGroundLatticeMix)
              + maskedGroundLatticeMix * maskedGroundLatticeMix
          );`
      : /* glsl */ `
          float maskedGroundLatticeMix = 0.28;
          float maskedGroundLatticeNorm = 1.0;`;
    // `vViewPosition` is declared unconditionally by three's fragment shader, so
    // its length is the view distance without adding a varying.
    const distanceSampling = distanceGrading
      ? /* glsl */ `
          float maskedGroundDistanceT = smoothstep(
            uMaskedGroundGradeStart,
            uMaskedGroundGradeEnd,
            length(vViewPosition)
          );
          float maskedGroundAlbedoFade = mix(
            1.0,
            uMaskedGroundFarDetailAlbedo,
            maskedGroundDistanceT
          );
          float maskedGroundNormalFade = mix(
            1.0,
            uMaskedGroundFarDetailNormal,
            maskedGroundDistanceT
          );`
      : "";
    const albedoFadeTerm = distanceGrading ? "\n              * maskedGroundAlbedoFade" : "";
    const normalFadeTerm = distanceGrading ? " * maskedGroundNormalFade" : "";
    const detailStrength = distanceGrading
      ? "maskedGroundDetailStrengthGraded"
      : "uMaskedGroundDetailStrength";
    const surfaceSampling = surfaceDetail
      ? /* glsl */ `
          vec2 maskedGroundSurfaceUv = ${detailPoint}
            / uMaskedGroundSurfaceScale;
          float maskedGroundSurfaceHeight = texture2D(
            uMaskedGroundSurfaceHeightMap,
            maskedGroundSurfaceUv
          ).r;${
            surfaceBreakup
              ? /* glsl */ `
          float maskedGroundSurfaceBreakupHeight = texture2D(
            uMaskedGroundSurfaceHeightMap,
            ${rotation2(surfaceBreakup.rotation)} * ${detailPoint}
              / uMaskedGroundSurfaceBreakupScale + vec2(3.3, -8.1)
          ).r;
          float maskedGroundSurfaceBreakupMix = smoothstep(
            0.28,
            0.72,
            maskedGroundNoise(
              maskedGroundPoint / uMaskedGroundSurfaceBreakupBlendScale
                + vec2(-4.4, 12.9)
            )
          );
          maskedGroundSurfaceHeight = 0.5 + (
            (maskedGroundSurfaceHeight - 0.5)
              * (1.0 - maskedGroundSurfaceBreakupMix)
            + (maskedGroundSurfaceBreakupHeight - 0.5)
              * maskedGroundSurfaceBreakupMix
          ) * inversesqrt(
            (1.0 - maskedGroundSurfaceBreakupMix)
              * (1.0 - maskedGroundSurfaceBreakupMix)
            + maskedGroundSurfaceBreakupMix * maskedGroundSurfaceBreakupMix
          );`
              : ""
          }
          float maskedGroundSurfaceValue = (
            smoothstep(0.12, 0.9, maskedGroundSurfaceHeight) - 0.5
          ) * 2.0;
          diffuseColor.rgb *= 1.0
            + maskedGroundSurfaceValue
              * uMaskedGroundSurfaceAlbedoStrength
              * uMaskedGroundDetailStrength${albedoFadeTerm};`
      : /* glsl */ `
          float maskedGroundSurfaceHeight = 0.5;`;
    const surfaceHeightContribution = surfaceDetail
      ? "(maskedGroundSurfaceHeight - 0.5) * uMaskedGroundSurfaceNormalStrength"
      : "0.0";
    // Screen-derivative bump breaks down once a pixel spans several tiles, so
    // the detail normal is faded out before it degenerates into sparkle, and
    // whatever residual normal variance survives is folded into roughness
    // (Tokuyoshi & Kaplanyan 2019) rather than left to alias.
    const roughnessGrading = distanceGrading
      ? /* glsl */ `
          float maskedGroundGrazing = 1.0 - smoothstep(
            0.0,
            max(0.001, uMaskedGroundGrazingStart),
            clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0)
          );
          roughnessFactor = max(
            roughnessFactor,
            max(
              mix(
                uMaskedGroundRoughnessFloor,
                uMaskedGroundFarRoughnessFloor,
                maskedGroundDistanceT
              ),
              mix(
                uMaskedGroundRoughnessFloor,
                uMaskedGroundGrazingRoughnessFloor,
                maskedGroundGrazing
              )
            )
          );`
      : "";
    const specularGrading = specularAntiAliasing
      ? /* glsl */ `
          vec3 maskedGroundNormalDx = dFdx(normal);
          vec3 maskedGroundNormalDy = dFdy(normal);
          float maskedGroundKernelRoughness = min(
            2.0 * uMaskedGroundSpecularVariance * (
              dot(maskedGroundNormalDx, maskedGroundNormalDx)
              + dot(maskedGroundNormalDy, maskedGroundNormalDy)
            ),
            uMaskedGroundSpecularThreshold
          );
          roughnessFactor = sqrt(clamp(
            roughnessFactor * roughnessFactor + maskedGroundKernelRoughness,
            0.0,
            1.0
          ));`
      : "";

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
          varying vec3 vMaskedGroundWorldPosition;
          varying vec3 vMaskedGroundWorldNormal;`
      )
      .replace(
        "#include <defaultnormal_vertex>",
        /* glsl */ `#include <defaultnormal_vertex>
          vMaskedGroundWorldNormal = normalize(
            mat3(modelMatrix) * transformedNormal
          );`
      )
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `#include <begin_vertex>
          vMaskedGroundWorldPosition = (
            modelMatrix * vec4(transformed, 1.0)
          ).xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
          uniform sampler2D uMaskedGroundRedMap;
          uniform sampler2D uMaskedGroundGreenMap;
          uniform sampler2D uMaskedGroundBlueMap;
          uniform sampler2D uMaskedGroundFourthMap;
          uniform sampler2D uMaskedGroundFamilyMask;
          uniform float uMaskedGroundDetailStrength;
          uniform float uMaskedGroundNormalResponse;
          uniform float uMaskedGroundRoughnessFloor;
          uniform float uMaskedGroundAbsoluteColorStrength;
          uniform float uMaskedGroundPrimaryScale;
          uniform float uMaskedGroundSecondaryScale;
          uniform float uMaskedGroundFamilyContrast;
          uniform float uMaskedGroundHeightResponse;
          uniform float uMaskedGroundMacroScale;
          uniform float uMaskedGroundMacroDetailScale;
          uniform float uMaskedGroundMacroDetailStrength;
          uniform float uMaskedGroundSlopeFamilyStrength;
          uniform float uMaskedGroundSlopeStart;
          uniform vec2 uMaskedGroundMaskOrigin;
          uniform vec2 uMaskedGroundMaskSize;
          uniform vec2 uMaskedGroundWorldAxisSign;
          uniform vec3 uMaskedGroundBaselineRed;
          uniform vec3 uMaskedGroundBaselineGreen;
          uniform vec3 uMaskedGroundBaselineBlue;
          uniform vec3 uMaskedGroundBaselineFourth;
          uniform vec3 uMaskedGroundMacroDark;
          uniform vec3 uMaskedGroundMacroLight;
          uniform vec2 uMaskedGroundContactCenter;
          uniform vec2 uMaskedGroundContactHalfSize;
          uniform float uMaskedGroundContactFeather;
          uniform float uMaskedGroundContactNoise;
          uniform float uMaskedGroundContactStrength;
          uniform float uMaskedGroundBladeSignal;
          varying vec3 vMaskedGroundWorldPosition;
          varying vec3 vMaskedGroundWorldNormal;
          ${surfaceDeclarations}${deTilingDeclarations}${distanceDeclarations}${specularDeclarations}

          float maskedGroundHash(vec2 point) {
            return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
          }

          float maskedGroundNoise(vec2 point) {
            vec2 cell = floor(point);
            vec2 blend = fract(point);
            blend = blend * blend * (3.0 - 2.0 * blend);
            return mix(
              mix(maskedGroundHash(cell), maskedGroundHash(cell + vec2(1.0, 0.0)), blend.x),
              mix(maskedGroundHash(cell + vec2(0.0, 1.0)), maskedGroundHash(cell + vec2(1.0)), blend.x),
              blend.y
            );
          }`
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `#include <map_fragment>
          vec2 maskedGroundPoint = vec2(
            vMaskedGroundWorldPosition.x,
            vMaskedGroundWorldPosition.z
          ) * uMaskedGroundWorldAxisSign;
          ${warpSampling}
          ${distanceSampling}
          vec2 detailUv = ${detailPoint} / uMaskedGroundPrimaryScale;
          vec2 secondaryUv = mat2(0.8192, -0.5736, 0.5736, 0.8192)
            * ${detailPoint} / uMaskedGroundSecondaryScale
            + vec2(4.7, -2.9);
          vec2 familyUv = (
            maskedGroundPoint - uMaskedGroundMaskOrigin
          ) / uMaskedGroundMaskSize;
          vec2 familyFeather = vec2(0.006);
          vec3 maskWeights = (
            texture2D(uMaskedGroundFamilyMask, familyUv).rgb * 2.0
            + texture2D(
              uMaskedGroundFamilyMask,
              familyUv + vec2(familyFeather.x, 0.0)
            ).rgb
            + texture2D(
              uMaskedGroundFamilyMask,
              familyUv - vec2(familyFeather.x, 0.0)
            ).rgb
            + texture2D(
              uMaskedGroundFamilyMask,
              familyUv + vec2(0.0, familyFeather.y)
            ).rgb
            + texture2D(
              uMaskedGroundFamilyMask,
              familyUv - vec2(0.0, familyFeather.y)
            ).rgb
          ) / 6.0;
          vec4 familyWeights = vec4(
            maskWeights,
            max(0.0, 1.0 - maskWeights.r - maskWeights.g - maskWeights.b)
          );
          familyWeights /= max(
            familyWeights.r + familyWeights.g + familyWeights.b + familyWeights.a,
            0.001
          );

          vec2 contactDelta = abs(
            maskedGroundPoint - uMaskedGroundContactCenter
          ) - uMaskedGroundContactHalfSize;
          float contactDistance = length(max(contactDelta, vec2(0.0)))
            + min(max(contactDelta.x, contactDelta.y), 0.0);
          float contactNoise = (
            maskedGroundNoise(maskedGroundPoint * 0.31) - 0.5
          ) * uMaskedGroundContactNoise;
          float contactWeight = (
            1.0 - smoothstep(
              0.1,
              max(0.11, uMaskedGroundContactFeather),
              contactDistance + contactNoise
            )
          ) * uMaskedGroundContactStrength;
          familyWeights = mix(
            familyWeights,
            vec4(1.0, 0.0, 0.0, 0.0),
            clamp(contactWeight, 0.0, 1.0)
          );

          float maskedGroundSlope = 1.0 - clamp(
            abs(vMaskedGroundWorldNormal.y),
            0.0,
            1.0
          );
          float maskedGroundSlopeWeight = smoothstep(
            uMaskedGroundSlopeStart,
            1.0,
            maskedGroundSlope
          );
          familyWeights = mix(
            familyWeights,
            vec4(0.0, 0.0, 1.0, 0.0),
            clamp(
              maskedGroundSlopeWeight * uMaskedGroundSlopeFamilyStrength,
              0.0,
              0.82
            )
          );

          vec3 detailColorPrimary =
            texture2D(uMaskedGroundRedMap, detailUv).rgb * familyWeights.r
            + texture2D(uMaskedGroundGreenMap, detailUv).rgb * familyWeights.g
            + texture2D(uMaskedGroundBlueMap, detailUv).rgb * familyWeights.b
            + texture2D(uMaskedGroundFourthMap, detailUv).rgb * familyWeights.a;
          vec3 detailColorSecondary =
            texture2D(uMaskedGroundRedMap, secondaryUv).rgb * familyWeights.r
            + texture2D(uMaskedGroundGreenMap, secondaryUv).rgb * familyWeights.g
            + texture2D(uMaskedGroundBlueMap, secondaryUv).rgb * familyWeights.b
            + texture2D(uMaskedGroundFourthMap, secondaryUv).rgb * familyWeights.a;
          ${latticeSampling}
          vec3 detailColor = mix(
            detailColorPrimary,
            detailColorSecondary,
            maskedGroundLatticeMix
          );
          float detailLuma = dot(detailColor, vec3(0.299, 0.587, 0.114));
          vec3 familyBaseline =
            uMaskedGroundBaselineRed * familyWeights.r
            + uMaskedGroundBaselineGreen * familyWeights.g
            + uMaskedGroundBaselineBlue * familyWeights.b
            + uMaskedGroundBaselineFourth * familyWeights.a;
          vec3 familyVariation = clamp(
            (detailColor - familyBaseline)
              * uMaskedGroundFamilyContrast
              * maskedGroundLatticeNorm,
            vec3(-0.12),
            vec3(0.12)
          );
          float baselineLuma = dot(familyBaseline, vec3(0.299, 0.587, 0.114));
          float microValue = clamp(
            (detailLuma - baselineLuma)
              * 0.82
              * uMaskedGroundFamilyContrast
              * maskedGroundLatticeNorm,
            -0.11,
            0.11
          );
${
            distanceGrading
              ? /* glsl */ `          float maskedGroundDetailStrengthGraded = uMaskedGroundDetailStrength
            * maskedGroundAlbedoFade;\n`
              : ""
          }          vec3 modulation = vec3(1.0)
            + familyVariation * (0.60 * ${detailStrength})
            + vec3(microValue * ${detailStrength});
          float macroBroad = maskedGroundNoise(
            maskedGroundPoint / uMaskedGroundMacroScale
          );
          float macroDetail = maskedGroundNoise(
            mat2(0.7071, -0.7071, 0.7071, 0.7071)
              * maskedGroundPoint / uMaskedGroundMacroDetailScale
              + vec2(-7.1, 5.3)
          );
          float macro = mix(
            macroBroad,
            macroBroad * 0.68 + macroDetail * 0.32,
            clamp(uMaskedGroundMacroDetailStrength, 0.0, 1.0)
          );
          float meadowBladeSignal = mix(
            sin(dot(${detailPoint}, vec2(8.4, 2.7))),
            sin(dot(${detailPoint}, vec2(-3.1, 10.6)) + 1.7),
            maskedGroundNoise(${detailPoint} * 0.37)
          ) * familyWeights.g;
          diffuseColor.rgb = mix(
            diffuseColor.rgb,
            detailColor,
            clamp(
              uMaskedGroundAbsoluteColorStrength * uMaskedGroundDetailStrength,
              0.0,
              0.92
            )
          );
          diffuseColor.rgb *= modulation;
          diffuseColor.rgb *= mix(
            uMaskedGroundMacroDark,
            uMaskedGroundMacroLight,
            macro
          );
          diffuseColor.rgb *= 1.0
            + meadowBladeSignal
              * uMaskedGroundBladeSignal${albedoFadeTerm};
          ${surfaceSampling}`
      )
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `vec3 maskedGroundBaseNormal = normal;
          #include <normal_fragment_maps>
          normal = normalize(mix(
            maskedGroundBaseNormal,
            normal,
            clamp(uMaskedGroundNormalResponse, 0.0, 0.32)
          ));
          vec3 maskedGroundPositionDx = dFdx(vViewPosition);
          vec3 maskedGroundPositionDy = dFdy(vViewPosition);
          float maskedGroundCombinedHeight = detailLuma
            + ${surfaceHeightContribution};
          float maskedGroundHeightDx = dFdx(maskedGroundCombinedHeight);
          float maskedGroundHeightDy = dFdy(maskedGroundCombinedHeight);
          vec3 maskedGroundCrossX = cross(maskedGroundPositionDy, normal);
          vec3 maskedGroundCrossY = cross(normal, maskedGroundPositionDx);
          float maskedGroundDeterminant = dot(
            maskedGroundPositionDx,
            maskedGroundCrossX
          );
          vec3 maskedGroundSurfaceGradient = sign(maskedGroundDeterminant) * (
            maskedGroundHeightDx * maskedGroundCrossX
            + maskedGroundHeightDy * maskedGroundCrossY
          );
          normal = normalize(
            abs(maskedGroundDeterminant) * normal
              - maskedGroundSurfaceGradient
                * (uMaskedGroundHeightResponse * uMaskedGroundDetailStrength${normalFadeTerm})
          );
          ${roughnessGrading}
          ${specularGrading}`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        /* glsl */ `#include <roughnessmap_fragment>
          roughnessFactor = max(
            roughnessFactor,
            uMaskedGroundRoughnessFloor
          );`
      );
  };
  material.customProgramCacheKey = () =>
    `${previousCacheKey.call(material)}|${options.cacheKey}`;

  const patch: MaskedGroundDetailPatch = {
    dispose: () => {
      if (material.userData[options.storageKey] !== patch) return;
      material.onBeforeCompile = previousCompile;
      material.customProgramCacheKey = previousCacheKey;
      if (previousColor) material.color.copy(previousColor);
      delete material.userData[options.storageKey];
      material.needsUpdate = true;
    },
  };
  material.userData[options.storageKey] = patch;
  material.needsUpdate = true;
  return patch;
}

export function inheritMaskedGroundDetailPatch(
  source: MeshStandardMaterial,
  target: MeshStandardMaterial,
  storageKey: string
): void {
  const patch = source.userData[storageKey] as
    | MaskedGroundDetailPatch
    | undefined;
  if (!patch) return;
  target.onBeforeCompile = source.onBeforeCompile;
  target.customProgramCacheKey = source.customProgramCacheKey;
  target.userData[storageKey] = patch;
  target.needsUpdate = true;
}
