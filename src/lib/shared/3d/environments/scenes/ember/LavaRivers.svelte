<script lang="ts">
  import { onDestroy } from "svelte";
  import { T, useTask } from "@threlte/core";
  import {
    AdditiveBlending,
    ShaderMaterial,
    DoubleSide,
    Color,
    UniformsLib,
    UniformsUtils,
    type BufferGeometry,
    type Object3D,
  } from "three";
  import type { LavaRiversConfig } from "../../domain/models/scene-configs";
  import { userProportionsState } from "@austencloud/scene-3d";
  import { QualityTier } from "../../../effects/types";
  import { tryGetAdaptiveQualityContext } from "../../../context/adaptive-quality-context";
  import {
    createLavaRiverStripGeometry,
    createLavaTerrainSampler,
    LAVA_RIVER_BANK_MARGIN_FRACTION,
  } from "./lava-river-geometry";

  interface Props {
    config: LavaRiversConfig;
    poolPosition: { x: number; z: number };
    /**
     * The loaded world asset. The run is draped onto its ground sheets once, at
     * build time; nothing here raycasts per frame.
     */
    terrain?: Object3D | null;
  }

  let { config, poolPosition, terrain = null }: Props = $props();
  const groundY = $derived(userProportionsState.groundY);
  const adaptiveQuality = tryGetAdaptiveQualityContext();

  const DEFAULT_BANK_LIGHT = {
    count: 3,
    intensity: 40,
    distance: 52,
    heightOffset: 3.4,
  } as const;

  /**
   * Point lights are the expensive part of this scene on mobile: every one of
   * them is another forward-render lighting term on every lit fragment. Three
   * across 271 metres is the authored maximum, and the renderer-capability tier
   * takes it down from there. The corridor stays lit at every tier because the
   * additive bank-glow skirt does that work with zero lights.
   */
  const TIER_LIGHT_BUDGET: Record<QualityTier, number> = {
    [QualityTier.HIGH]: 3,
    [QualityTier.MEDIUM]: 2,
    [QualityTier.LOW]: 1,
  };

  const noiseChunk = /* glsl */ `
    // sin() based hashes lose their gradient once the advected domain grows past
    // a few thousand, which on a long session turned the crust into banding, and
    // low-precision sin on mobile GPUs made it worse. This one stays stable.
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      mat2 rotation = mat2(0.8, 0.6, -0.6, 0.8);
      for (int i = 0; i < 5; i++) {
        value += amplitude * noise(p);
        p = rotation * p * 2.03 + vec2(17.0, 31.0);
        amplitude *= 0.5;
      }
      return value;
    }
  `;

  const vertexShader = /* glsl */ `
    uniform float uTime;
    uniform float uGradeRidges;
    attribute float aCross;
    attribute float aFlow;
    attribute float aRun;
    attribute float aGrade;
    varying float vCross;
    varying float vFlow;
    varying float vRun;
    varying float vGrade;
    varying vec3 vWorldPosition;
    #include <fog_pars_vertex>

    void main() {
      vCross = aCross;
      vFlow = aFlow;
      vRun = aRun;
      vGrade = aGrade;
      vec3 pos = position;
      // Metres, not curve parameter: the control points are spaced 8 to 31
      // apart, so a parameter-space wave stretched four-fold along the reach.
      float bankWeight = clamp(1.0 - aCross * aCross, 0.0, 1.0);
      // Steep reaches run faster and pile into transverse pressure ridges. This
      // is what carries the fifteen-metre fall to a side camera: the profile
      // itself only subtends about three degrees, but differential speed and
      // corrugation read as slope at any distance.
      float haste = 1.0 + aGrade * uGradeRidges * 1.6;
      float travellingFold = sin(
        aFlow * 0.51
        + sin(aCross * 3.14159265) * 0.8
        - uTime * 1.45 * haste
      ) * 0.034;
      float convectionRoll = sin(
        aFlow * 0.197
        - aCross * 2.5
        - uTime * 0.52
      ) * 0.018;
      float pressureRidge = sin(aFlow * 1.15 - uTime * 1.9 * haste)
        * aGrade * uGradeRidges * 0.055;
      pos.y += (travellingFold + convectionRoll + pressureRidge) * bankWeight;
      vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
      vWorldPosition = worldPosition.xyz;
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }
  `;

  const fragmentShader = /* glsl */ `
    uniform float uTime;
    uniform vec3 uBaseColor;
    uniform vec3 uHotColor;
    uniform vec3 uCrustColor;
    uniform vec3 uLeveeColor;
    uniform float uWarpIntensity;
    uniform float uCrustCoverage;
    uniform float uEdgeCooling;
    uniform float uBankRadiance;
    uniform float uMarginFraction;
    uniform float uThermalFalloff;
    uniform float uCrustGain;
    uniform float uGradeRidges;
    uniform float uSourceRadiance;
    uniform float uToeStart;
    uniform float uCapStart;
    varying float vCross;
    varying float vFlow;
    varying float vRun;
    varying float vGrade;
    varying vec3 vWorldPosition;
    #include <fog_pars_fragment>

    ${noiseChunk}

    void main() {
      // Derivatives are taken before any discard so the surviving fragments in a
      // quad never read a killed neighbour.
      vec3 surfaceNormal = normalize(cross(
        dFdx(vWorldPosition),
        dFdy(vWorldPosition)
      ));
      if (surfaceNormal.y < 0.0) surfaceNormal *= -1.0;
      float footprint = fwidth(vFlow);
      float lod = smoothstep(0.14, 1.3, footprint);

      float bank = abs(vCross);
      float side = vCross < 0.0 ? -1.0 : 1.0;

      // Where the chilled margin meets the molten channel, wandering on two
      // incommensurate world wavelengths: eleven-metre lobes and two-metre
      // scallops. The term this replaced ran on a lattice whose lateral period
      // matched the strip's column count, so its cells read as rectangular
      // bites out of the shore.
      float shoreLobe = fbm(vec2(vFlow * 0.091, side * 5.31 + 2.7));
      float shoreScallop = fbm(vec2(vFlow * 0.384, side * 11.13 + 41.0));
      float shoreContour = shoreLobe * 0.62 + shoreScallop * 0.38;

      // The toe is the last stretch before the tail: a spreading, crusting lobe
      // rather than the square chop the run used to end on mid-slope.
      float toe = smoothstep(uToeStart, 1.0, vRun);
      // The geometry rounds the lobe off over the cap, but its final rows
      // narrow to a spike that rendered as a dark slab sticking out past the
      // delta. The lobe is cut while it is still wide, on the same scallop
      // noise as the shore, so it ends ragged instead of on a row.
      float capT = clamp(
        (toe - uCapStart) / max(1.0 - uCapStart, 0.001),
        0.0,
        1.0
      );
      // Convex across the channel so the end is a lobe, not a chord.
      float tipCut = 0.76 - bank * bank * 0.34 + (shoreScallop - 0.5) * 0.36;
      if (capT > tipCut) discard;

      // Distance narrows the incandescent thread rather than letting the crust
      // pattern average out into one saturated band.
      float coolingReach = uEdgeCooling * mix(1.0, 1.34, lod);
      float shoreLine = 1.0 - coolingReach + (shoreContour - 0.5) * 0.46;
      float chill = smoothstep(shoreLine - 0.2, shoreLine + 0.3, bank);

      // The surface always terminates inside the margin the geometry reserved,
      // so its straight polygon edge is never the silhouette.
      float cut = 1.0 + uMarginFraction
        * (0.06 + 0.92 * (shoreScallop * 0.6 + shoreLobe * 0.4));
      if (bank > cut) discard;

      vec2 flowUv = vec2(vFlow * 0.199 - uTime * 0.22, vCross * 1.8);
      vec2 warp = vec2(
        fbm(flowUv * 0.78 + vec2(3.1, 7.7)),
        fbm(flowUv * 0.9 + vec2(11.2, 1.4))
      ) - 0.5;
      vec2 warpedUv = flowUv + warp * uWarpIntensity;

      // A reach is tens of metres long. Real channels skin over for a stretch
      // and tear open again at a bend; without that the ribbon reads as one
      // uniform band at every viewing distance.
      float reach = fbm(vec2(vFlow * 0.0281, 3.3));

      float broadFlow = fbm(warpedUv * vec2(0.24, 0.92));
      float plateField = fbm(warpedUv * vec2(0.72, 1.18) + vec2(uTime * 0.018, 0.0));
      // Crust accumulates downstream and piles up hard across the toe. Lowering
      // the threshold hands more of the plate field to the crust term, so the
      // terminus is visibly thicker-skinned than the source.
      float crustThreshold = 0.705
        - uCrustCoverage * 0.09
        + (reach - 0.5) * 0.13
        - chill * 0.1
        - vRun * uCrustGain
        - toe * 0.14;
      float crustEdge = mix(0.045, 0.15, lod);
      float crust = smoothstep(
        crustThreshold - crustEdge,
        crustThreshold + crustEdge * 0.8,
        plateField
      );
      float fracture = (1.0 - smoothstep(0.018, 0.058, abs(plateField - crustThreshold)))
        * (1.0 - lod * 0.75);

      float center = 1.0 - smoothstep(0.0, 1.0, bank);
      float heat = clamp(broadFlow * 0.82 + fbm(warpedUv * 0.46 + 8.3) * 0.18, 0.0, 1.0);
      float convectionCell = smoothstep(
        0.68,
        0.92,
        fbm(warpedUv * vec2(0.3, 0.74) + vec2(uTime * 0.035, 19.0))
      );

      // A skin forms and tears continuously over open lava. It carries the
      // internal value range that keeps the molten field from resolving to a
      // single saturated colour once the plates are too small to see.
      float skin = smoothstep(
        0.4,
        0.8,
        fbm(warpedUv * vec2(1.35, 2.1) + vec2(-uTime * 0.05, 63.0))
      );
      float skinDepth = skin * (0.42 + chill * 0.34) * (1.0 - lod * 0.45);

      vec3 molten = mix(
        uBaseColor,
        uHotColor,
        pow(heat, 1.85) * (0.22 + center * 0.38)
          + convectionCell * (0.06 + center * 0.06)
      );
      molten *= mix(1.0, 0.34, skinDepth);
      // Emission falls off across the channel: an axial thread with cooling
      // shoulders, not a slab held at one temperature edge to edge.
      molten *= mix(1.0, 0.2, chill) * (0.78 + reach * 0.4);
      // And along it. The source is the hottest point of the run and the toe is
      // the coolest, which is the whole reason a lava river reads as directional.
      float thermal = mix(1.0, uThermalFalloff, smoothstep(0.0, 1.0, vRun));
      molten *= thermal;

      vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
      vec3 skyDirection = normalize(vec3(-0.42, 0.82, 0.38));
      float coolSky = 0.68 + max(dot(surfaceNormal, skyDirection), 0.0) * 0.34;
      float crustFresnel = pow(
        1.0 - max(dot(surfaceNormal, viewDirection), 0.0),
        4.0
      );

      // Open channels raft dark crust downstream. Brightness survives in the
      // seams between plates. Their cooled faces still catch the cold sky, so
      // they read as moving slabs instead of holes punched into an orange map.
      vec3 cooledCrust = mix(
        uCrustColor,
        vec3(0.062, 0.068, 0.07),
        0.72
      ) * (0.76 + broadFlow * 0.22) * coolSky;
      cooledCrust += vec3(0.055, 0.072, 0.078)
        * crustFresnel
        * (0.12 + broadFlow * 0.08);
      vec3 color = mix(molten, cooledCrust, crust * 0.91);

      // Everything incandescent below is damped across the toe, so the lobe
      // keeps its shape without keeping the source's brightness.
      float open = (1.0 - chill) * thermal * (1.0 - toe * 0.72);
      color += uHotColor * fracture * (0.28 + center * 0.22) * open;
      float medialLead = smoothstep(0.72, 0.92, fbm(warpedUv * vec2(0.38, 0.76) + 13.4));
      float travellingLead = smoothstep(
        0.68,
        0.9,
        fbm(warpedUv * vec2(0.46, 0.82) + vec2(-uTime * 0.09, 27.0))
      );
      color += uHotColor * medialLead * pow(center, 2.4) * (1.0 - crust) * 0.18 * open;
      color += uHotColor * travellingLead * fracture * (0.08 + center * 0.1) * open;
      color += uHotColor
        * convectionCell
        * (1.0 - crust)
        * (0.028 + center * 0.035)
        * open;

      // Pressure ridges on the steep reaches catch light on their upstream
      // faces. The vertex stage lifts them; this is the same wave shading them.
      float pressure = max(sin(vFlow * 1.15 - uTime * 1.9), 0.0);
      color += uHotColor
        * pressure
        * vGrade
        * uGradeRidges
        * (1.0 - crust)
        * 0.07
        * open;

      // The breach at the head, and the first metres out of it, run hotter than
      // anything downstream. vRun is zero across the whole vent mouth, so the
      // same term serves both without a second material.
      float sourceHeat = pow(clamp(1.0 - vRun, 0.0, 1.0), 6.0);
      color += uHotColor
        * uSourceRadiance
        * sourceHeat
        * (0.18 + center * 0.42)
        * (1.0 - chill)
        * (1.0 - crust * 0.55);

      // Static levee: solid rock the channel is running between, not a painted
      // border. It carries the radiance the channel throws onto it, falling off
      // outward, which is what makes the shore read as a lit surface rather than
      // a cut edge.
      float leveeGrain = fbm(vec2(vFlow * 0.62, side * 7.7 + 19.0));
      vec3 levee = mix(uLeveeColor, vec3(0.032, 0.028, 0.026), 0.42)
        * (0.72 + leveeGrain * 0.5)
        * coolSky;
      // Radiance integrates over a stretch of channel, so it follows the
      // reach-scale openness rather than whichever plate happens to sit under
      // this fragment — and the levee is heavily crusted by definition.
      float openness = clamp(0.25 + reach * 0.75 + (broadFlow - 0.5) * 0.4, 0.0, 1.0)
        * thermal;
      float outward = clamp(
        (bank - shoreLine) / max(uMarginFraction + coolingReach, 0.001),
        0.0,
        1.0
      );
      float spill = uBankRadiance * openness * pow(1.0 - outward, 2.2);
      levee += uBaseColor * spill * 0.9 + uHotColor * spill * spill * 0.35;
      color = mix(color, levee, chill);

      // The contact itself is the brightest thing on the bank.
      float contactOffset = (bank - shoreLine) * 7.0;
      float contact = exp(-contactOffset * contactOffset);
      color += uHotColor
        * contact
        * openness
        * (0.1 + uBankRadiance * 0.16)
        * (1.0 - lod * 0.4);

      gl_FragColor = vec4(color, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }
  `;

  const glowVertexShader = /* glsl */ `
    attribute float aCross;
    attribute float aFlow;
    attribute float aRun;
    varying float vCross;
    varying float vFlow;
    varying float vRun;
    #include <fog_pars_vertex>

    void main() {
      vCross = aCross;
      vFlow = aFlow;
      vRun = aRun;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }
  `;

  const glowFragmentShader = /* glsl */ `
    uniform float uTime;
    uniform vec3 uBaseColor;
    uniform vec3 uHotColor;
    uniform float uReach;
    uniform float uIntensity;
    uniform float uSoftness;
    uniform float uThermalFalloff;
    uniform float uToeStart;
    varying float vCross;
    varying float vFlow;
    varying float vRun;
    #include <fog_pars_fragment>

    ${noiseChunk}

    void main() {
      float bank = abs(vCross);
      // Nothing inside the channel: the ribbon is drawn over that ground, and
      // doubling the emission there would blow out the axial thread.
      float inner = smoothstep(0.7, 1.1, bank);
      // The lava crusts over and ends in the delta; a skirt that ran on to the
      // authored tail lit ground past the last molten lobe as a flat sheet.
      float toeFade = 1.0 - smoothstep(uToeStart, mix(uToeStart, 1.0, 0.6), vRun);
      float outer = pow(
        clamp((uReach - bank) / max(uReach - 1.0, 0.001), 0.0, 1.0),
        uSoftness
      );
      // Radiance on rough basalt is blotchy, not a clean falloff ramp.
      float grain = fbm(vec2(vFlow * 0.085, vCross * 0.85 + 4.2)) * 0.55 + 0.62;
      float breathe = 0.9 + 0.1 * sin(vFlow * 0.06 - uTime * 0.35);
      float thermal = mix(1.0, uThermalFalloff, smoothstep(0.0, 1.0, vRun));

      float strength =
        inner * outer * grain * breathe * thermal * toeFade * uIntensity;
      vec3 color = mix(uBaseColor, uHotColor, 0.3 + 0.45 * outer) * strength;

      #ifdef USE_FOG
        // Additive geometry must fade toward black with distance. Mixing toward
        // fogColor the way the stock chunk does would ADD fog to the scene.
        #ifdef FOG_EXP2
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        #else
          float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
        #endif
        color *= 1.0 - fogFactor;
      #endif

      gl_FragColor = vec4(color, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;

  interface RiverInstance {
    geometry: BufferGeometry;
    ventGeometry: BufferGeometry | null;
    glowGeometry: BufferGeometry | null;
    material: ShaderMaterial;
    glowMaterial: ShaderMaterial | null;
    lightPositions: { x: number; y: number; z: number }[];
  }

  let rivers = $state<RiverInstance[]>([]);

  interface RiverMaterials {
    material: ShaderMaterial;
    glowMaterial: ShaderMaterial;
  }

  // Materials outlive geometry rebuilds on purpose. The world asset arrives
  // while the boot warm-up's compileAsync is still polling these programs, and
  // disposing a material mid-poll dereferences a program three has already
  // released (`currentProgram` is undefined → `.isReady()` throws inside a
  // timer, so the warm-up promise never settles and the curtain never lifts).
  // Rebuilds now only replace geometry; uniforms are refreshed in place.
  const materialCache = new Map<number, RiverMaterials>();

  function createRiverMaterials(): RiverMaterials {
    const material = new ShaderMaterial({
      side: DoubleSide,
      depthWrite: true,
      fog: true,
      extensions: { derivatives: true },
      // The strip lies in a carved bed that is close to coplanar with it, so
      // single terrain triangles could win the depth test and punch blocky
      // holes in the surface.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
      uniforms: {
        // fog: true makes the renderer refresh fogColor/fogDensity on this
        // material, so the fog uniform set must exist or the render crashes.
        ...UniformsUtils.clone(UniformsLib.fog),
        uTime: { value: 0 },
        uBaseColor: { value: new Color() },
        uHotColor: { value: new Color() },
        uCrustColor: { value: new Color() },
        uLeveeColor: { value: new Color() },
        uWarpIntensity: { value: 0 },
        uCrustCoverage: { value: 0 },
        uEdgeCooling: { value: 0 },
        uBankRadiance: { value: 0 },
        uMarginFraction: { value: 0 },
        uThermalFalloff: { value: 0 },
        uCrustGain: { value: 0 },
        uGradeRidges: { value: 0 },
        uSourceRadiance: { value: 0 },
        uToeStart: { value: 0 },
        uCapStart: { value: 0 },
      },
      vertexShader,
      fragmentShader,
    });
    const glowMaterial = new ShaderMaterial({
      side: DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
      uniforms: {
        ...UniformsUtils.clone(UniformsLib.fog),
        uTime: { value: 0 },
        uBaseColor: { value: new Color() },
        uHotColor: { value: new Color() },
        uReach: { value: 0 },
        uToeStart: { value: 1 },
        uIntensity: { value: 0 },
        uSoftness: { value: 0 },
        uThermalFalloff: { value: 0 },
      },
      vertexShader: glowVertexShader,
      fragmentShader: glowFragmentShader,
    });
    return { material, glowMaterial };
  }

  function materialsForChannel(index: number): RiverMaterials {
    let cached = materialCache.get(index);
    if (!cached) {
      cached = createRiverMaterials();
      materialCache.set(index, cached);
    }
    return cached;
  }

  onDestroy(() => {
    for (const { material, glowMaterial } of materialCache.values()) {
      material.dispose();
      glowMaterial.dispose();
    }
    materialCache.clear();
  });

  const bankLight = $derived({ ...DEFAULT_BANK_LIGHT, ...config.bankLight });
  const lightBudget = $derived(
    Math.min(
      bankLight.count,
      TIER_LIGHT_BUDGET[adaptiveQuality?.contentTier ?? QualityTier.HIGH]
    )
  );

  /**
   * Positions are baked for the authored maximum so a tier change never rebuilds
   * the draped geometry. Trimming picks a spread rather than a prefix, so two
   * lights straddle the run instead of clustering at its head.
   */
  function selectLights<T>(positions: T[], budget: number): T[] {
    if (budget >= positions.length) return positions;
    if (budget <= 0) return [];
    if (budget === 1) return [positions[Math.floor(positions.length / 2)]!];
    return Array.from(
      { length: budget },
      (_, index) =>
        positions[Math.round((index / (budget - 1)) * (positions.length - 1))]!
    );
  }

  $effect(() => {
    if (!config.enabled) {
      rivers = [];
      return;
    }

    const marginFraction =
      config.bankMarginFraction ?? LAVA_RIVER_BANK_MARGIN_FRACTION;
    const drape = config.drape ?? {};
    const thermal = config.thermal ?? {};
    const terminus = config.terminus ?? {};
    const source = config.source ?? {};
    const bankGlow = config.bankGlow ?? {};

    const glowReach = bankGlow.reach ?? 5.2;
    const toeFraction = terminus.fraction ?? 0.085;
    // One sampler per build, shared by the strip, its margins, the vent mouth,
    // and the glow skirt. Null when the world asset has not arrived yet, in
    // which case every height falls back to the authored polyline.
    const sampler =
      drape.enabled === false ? null : createLavaTerrainSampler(terrain);

    const created = config.channels.map((channel, index) => {
      const { geometry, ventGeometry, glowGeometry, lightPositions } =
        createLavaRiverStripGeometry({
          channel,
          poolPosition,
          groundY,
          width: config.width,
          terrain: sampler,
          surfaceOffset: drape.surfaceOffset,
          bankMarginFraction: marginFraction,
          bankPlunge: config.bankPlunge,
          marginBury: drape.marginBury,
          maxMarginDrop: drape.maxMarginDrop,
          longitudinalSegments: drape.longitudinalSegments,
          lateralSegments: drape.lateralSegments,
          terminus,
          source: {
            ...source,
            enabled: source.enabled ?? true,
          },
          glow: {
            enabled: bankGlow.enabled ?? true,
            reach: glowReach,
          },
          lightCount: bankLight.count,
        });

      const { material, glowMaterial } = materialsForChannel(index);
      const u = material.uniforms;
      (u.uBaseColor!.value as Color).set(config.baseColor);
      (u.uHotColor!.value as Color).set(config.hotColor);
      (u.uCrustColor!.value as Color).set(config.crustColor);
      (u.uLeveeColor!.value as Color).set(config.leveeColor ?? config.crustColor);
      u.uWarpIntensity!.value = config.warpIntensity;
      u.uCrustCoverage!.value = config.crustCoverage;
      u.uEdgeCooling!.value = config.edgeCooling ?? 0.34;
      u.uBankRadiance!.value = config.bankRadiance ?? 0.5;
      u.uMarginFraction!.value = marginFraction;
      u.uThermalFalloff!.value = thermal.falloff ?? 0.42;
      u.uCrustGain!.value = thermal.crustGain ?? 0.1;
      u.uGradeRidges!.value = thermal.gradeRidges ?? 0.55;
      u.uSourceRadiance!.value = source.radiance ?? 1;
      u.uToeStart!.value = 1 - toeFraction;
      u.uCapStart!.value = terminus.capStart ?? 0.55;

      const g = glowMaterial.uniforms;
      (g.uBaseColor!.value as Color).set(config.baseColor);
      (g.uHotColor!.value as Color).set(config.hotColor);
      g.uReach!.value = glowReach;
      g.uIntensity!.value = bankGlow.intensity ?? 0.85;
      g.uSoftness!.value = bankGlow.softness ?? 2.1;
      g.uThermalFalloff!.value = thermal.falloff ?? 0.42;
      g.uToeStart!.value = 1 - toeFraction;

      return {
        geometry,
        ventGeometry,
        glowGeometry,
        material,
        glowMaterial: glowGeometry ? glowMaterial : null,
        lightPositions,
      };
    });
    rivers = created;

    return () => {
      for (const river of created) {
        river.geometry.dispose();
        river.ventGeometry?.dispose();
        river.glowGeometry?.dispose();
      }
    };
  });

  useTask((delta) => {
    const step = delta * config.flowSpeed * 10;
    for (const river of rivers) {
      river.material.uniforms.uTime!.value += step;
      if (river.glowMaterial) {
        river.glowMaterial.uniforms.uTime!.value += step;
      }
    }
  });
</script>

{#if config.enabled}
  {#each rivers as river}
    <!-- The corridor skirt is drawn first: it is additive and depth-tested, so
         the ribbon and the vent composite over it in the same pass order every
         frame regardless of camera distance. -->
    {#if river.glowGeometry && river.glowMaterial}
      <T.Mesh geometry={river.glowGeometry} material={river.glowMaterial} />
    {/if}
    <T.Mesh geometry={river.geometry} material={river.material} />
    {#if river.ventGeometry}
      <!-- Same material as the ribbon. The mouth's aRun is zero, which is what
           puts it at the hot end of the downstream gradient. -->
      <T.Mesh geometry={river.ventGeometry} material={river.material} />
    {/if}
    {#each selectLights(river.lightPositions, lightBudget) as light, index}
      <!-- These sit well above the channel on purpose. Close to the surface a
           point light lays a hard disc on the flat bank, which reads as a
           flashlight rather than as radiance off the lava. -->
      <T.PointLight
        position={[light.x, light.y + bankLight.heightOffset, light.z]}
        color={index % 2 === 0 ? config.hotColor : config.baseColor}
        intensity={bankLight.intensity}
        distance={bankLight.distance}
        decay={2}
      />
    {/each}
  {/each}
{/if}
