<script lang="ts">
  /**
   * Fumaroles.
   *
   * The vents used to run through the shared box emitter as `type="smoke"`,
   * which draws a soft round sprite with additive blending. Additive smoke over
   * a saturated sky lifts green and blue while red is already clipped, so the
   * columns desaturated to pale discs rising in straight lines — carbonation,
   * not ash. Real smoke occludes: normal blending lets one column darken the
   * bright horizon band and, where its base is underlit by the vent, lighten
   * the near-black zenith, from the same material.
   *
   * Every vent in a look shares one Points object, so four fumaroles cost one
   * draw call. Silhouette and interior are procedural per puff rather than one
   * sampled stamp, which is what keeps a column from reading as one sprite
   * repeated up the screen.
   */

  import { T, useTask } from "@threlte/core";
  import { onMount, onDestroy } from "svelte";
  import {
    BufferGeometry,
    Color,
    Float32BufferAttribute,
    NormalBlending,
    ShaderMaterial,
  } from "three";
  import type { EmberPlumeConfig } from "../../domain/models/scene-configs";
  import {
    prefersReducedMotion,
    resolveMotionScale,
  } from "../../primitives/motion-preference";
  import {
    advancePlumePuff,
    createPlumePuff,
    plumeLitFraction,
    PLUME_FOG_ALPHA_BITE,
    PLUME_FOG_BLEND_CAP,
    type PlumePuff,
  } from "./ember-plume-motion";

  interface Props {
    plumes: EmberPlumeConfig[];
    /** Runtime height of the performer ground plane. */
    groundY?: number;
    /** Scene fog, so a distant column softens into the same haze the terrain does. */
    fogColor: string;
    fogDensity: number;
  }

  let { plumes, groundY = 0, fogColor, fogDensity }: Props = $props();

  interface PlumeRuntime {
    spec: EmberPlumeConfig;
    origin: [number, number, number];
    lit: Color;
    ash: Color;
    puffs: PlumePuff[];
    offset: number;
  }

  /**
   * The box emitter spawned inside a group centred on `position`, so a column's
   * mouth sat four tenths of its height below that point. Puffs now climb from
   * the mouth upward, so the same offset keeps every vent attached to exactly
   * the terrain it was composed against. The crown does reach higher than the
   * old hard ceiling, because a dissolving column has no ceiling to wrap at.
   */
  const MOUTH_DROP = 0.4;

  let runtimes: PlumeRuntime[] = [];
  let geometry = $state<BufferGeometry | null>(null);
  let material = $state<ShaderMaterial | null>(null);

  const reducedMotion = $derived(prefersReducedMotion());

  const vertexShader = `
    attribute float size;
    attribute float alpha;
    attribute float rotation;
    attribute float seed;
    attribute vec3 puffColor;

    uniform float uMinPointSize;
    uniform float uMaxPointSize;
    uniform float uFogDensity;
    uniform vec3 uFogColor;
    uniform float uFogBlendCap;

    varying float vAlpha;
    varying float vRotation;
    varying float vSeed;
    varying vec3 vColor;

    void main() {
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      float dist = max(-mvPosition.z, 0.001);
      float projected = size * (1000.0 / dist);
      gl_PointSize = clamp(projected, uMinPointSize, uMaxPointSize);

      // A point below the driver's size floor is still rasterised a whole pixel
      // wide, so its coverage has to come off the alpha or a far puff reads as
      // a hot speck instead of a wisp.
      float subPixel = clamp(projected / uMinPointSize, 0.0, 1.0);

      float depth = uFogDensity * dist;
      float fog = 1.0 - exp(-depth * depth);

      // A column is denser than the air around it, so it never converges all
      // the way onto the haze. Mixing to a full 1.0 did exactly that: at 300m
      // the ash sat at the fog's own luminance and the vent vanished. Capping
      // the mix keeps a far column reading as a darker body inside the haze.
      vColor = mix(puffColor, uFogColor, fog * uFogBlendCap);
      // The colour mix above already carries aerial perspective. Charging the
      // same fog term against coverage a second time threw away what little
      // contrast survived, so this term only softens the edge.
      vAlpha = alpha * subPixel * (1.0 - fog * ${PLUME_FOG_ALPHA_BITE.toFixed(2)});

      vRotation = rotation;
      vSeed = seed;
      gl_Position = projectionMatrix * mvPosition;
    }
  `;

  const fragmentShader = `
    precision mediump float;

    varying float vAlpha;
    varying float vRotation;
    varying float vSeed;
    varying vec3 vColor;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float valueNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    void main() {
      vec2 centered = gl_PointCoord - 0.5;
      float c = cos(vRotation);
      float s = sin(vRotation);
      vec2 p = vec2(centered.x * c - centered.y * s, centered.x * s + centered.y * c);

      float r = length(p);
      float a = atan(p.y, p.x);

      // Three harmonics phased off the puff's own seed. No two puffs share a
      // silhouette, so a column never reads as one stamp repeated up its height.
      float phase = vSeed * 6.2831853;
      float edge = 0.44
        + 0.070 * sin(a * 3.0 + phase)
        + 0.045 * sin(a * 5.0 - phase * 1.7)
        + 0.028 * sin(a * 8.0 + phase * 2.3);

      float body = 1.0 - smoothstep(edge * 0.40, edge, r);
      if (body <= 0.0) discard;

      // Entrained air curdles a real puff into cells. Without the mottling a
      // soft-edged disc still reads as a bubble however ragged its outline is.
      vec2 np = p * 5.6 + vec2(vSeed * 31.0, vSeed * 17.0);
      float mottle = valueNoise(np) * 0.62 + valueNoise(np * 2.3) * 0.38;
      body = clamp(body * (0.40 + 0.76 * mottle), 0.0, 1.0);

      float alpha = body * vAlpha;
      if (alpha < 0.004) discard;

      gl_FragColor = vec4(vColor, alpha);
    }
  `;

  /**
   * Runs a fresh field forward by a random slice of each puff's life, so the
   * columns open already flowing instead of firing one synchronised volley.
   * The slice stops short of dissolution so no puff starts the first frame
   * already spent, which a reduced-motion viewer would see as a hole.
   */
  function warmPuff(puff: PlumePuff, spec: EmberPlumeConfig) {
    const steps = 12;
    const dt = (Math.random() * 0.85 * puff.maxAge) / steps;
    for (let step = 0; step < steps; step += 1) {
      advancePlumePuff(puff, dt, spec);
    }
  }

  onMount(() => {
    const total = plumes.reduce((sum, plume) => sum + plume.count, 0);
    if (total <= 0) return;

    let offset = 0;
    runtimes = plumes.map((spec) => {
      const puffs: PlumePuff[] = [];
      for (let i = 0; i < spec.count; i += 1) {
        const puff = createPlumePuff(spec);
        warmPuff(puff, spec);
        puffs.push(puff);
      }
      const runtime: PlumeRuntime = {
        spec,
        origin: spec.position,
        lit: new Color(spec.litColor),
        ash: new Color(spec.ashColor),
        puffs,
        offset,
      };
      offset += spec.count;
      return runtime;
    });

    geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(new Float32Array(total * 3), 3)
    );
    geometry.setAttribute(
      "puffColor",
      new Float32BufferAttribute(new Float32Array(total * 3), 3)
    );
    geometry.setAttribute(
      "size",
      new Float32BufferAttribute(new Float32Array(total), 1)
    );
    geometry.setAttribute(
      "alpha",
      new Float32BufferAttribute(new Float32Array(total), 1)
    );
    geometry.setAttribute(
      "rotation",
      new Float32BufferAttribute(new Float32Array(total), 1)
    );
    geometry.setAttribute(
      "seed",
      new Float32BufferAttribute(new Float32Array(total), 1)
    );

    material = new ShaderMaterial({
      uniforms: {
        uMinPointSize: { value: 1 },
        uMaxPointSize: { value: 512 },
        uFogColor: { value: new Color(fogColor) },
        uFogDensity: { value: fogDensity },
        uFogBlendCap: { value: PLUME_FOG_BLEND_CAP },
      },
      vertexShader,
      fragmentShader,
      blending: NormalBlending,
      depthWrite: false,
      transparent: true,
    });
  });

  onDestroy(() => {
    geometry?.dispose();
    material?.dispose();
    runtimes = [];
  });

  $effect(() => {
    if (!material) return;
    (material.uniforms.uFogColor?.value as Color | undefined)?.set(fogColor);
    if (material.uniforms.uFogDensity) {
      material.uniforms.uFogDensity.value = fogDensity;
    }
  });

  const scratch = new Color();

  useTask((rawDelta) => {
    if (!geometry || !material) return;

    const posAttr = geometry.attributes.position;
    const colorAttr = geometry.attributes.puffColor;
    const sizeAttr = geometry.attributes.size;
    const alphaAttr = geometry.attributes.alpha;
    const rotAttr = geometry.attributes.rotation;
    const seedAttr = geometry.attributes.seed;
    if (
      !posAttr ||
      !colorAttr ||
      !sizeAttr ||
      !alphaAttr ||
      !rotAttr ||
      !seedAttr
    ) {
      return;
    }

    const posArray = posAttr.array as Float32Array;
    const colorArray = colorAttr.array as Float32Array;
    const sizeArray = sizeAttr.array as Float32Array;
    const alphaArray = alphaAttr.array as Float32Array;
    const rotArray = rotAttr.array as Float32Array;
    const seedArray = seedAttr.array as Float32Array;

    for (const runtime of runtimes) {
      const { spec, origin, offset } = runtime;
      // A vent's pace is a look decision, but reduced motion overrides it —
      // the shared emitter let an explicit scale win over the preference. At
      // zero the field still uploads, so the viewer gets a still column rather
      // than an empty sky.
      const delta = reducedMotion
        ? 0
        : rawDelta * resolveMotionScale(false, spec.motionScale);

      for (let i = 0; i < runtime.puffs.length; i += 1) {
        const puff = runtime.puffs[i];
        if (!puff) continue;

        let sample = advancePlumePuff(puff, delta, spec);
        if (!sample) {
          Object.assign(puff, createPlumePuff(spec));
          sample = advancePlumePuff(puff, delta, spec);
          if (!sample) continue;
        }

        const index = offset + i;
        posArray[index * 3] = origin[0] + puff.x;
        posArray[index * 3 + 1] =
          groundY + origin[1] - spec.area.height * MOUTH_DROP + puff.y;
        posArray[index * 3 + 2] = origin[2] + puff.z;

        scratch
          .copy(runtime.ash)
          .lerp(runtime.lit, plumeLitFraction(sample.rise));
        colorArray[index * 3] = scratch.r;
        colorArray[index * 3 + 1] = scratch.g;
        colorArray[index * 3 + 2] = scratch.b;

        sizeArray[index] = sample.size;
        alphaArray[index] = sample.alpha * spec.opacity;
        rotArray[index] = puff.rotation;
        seedArray[index] = puff.seed;
      }
    }

    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    rotAttr.needsUpdate = true;
    seedAttr.needsUpdate = true;
  });
</script>

{#if geometry && material}
  <T.Points {geometry} {material} frustumCulled={false} />
{/if}
