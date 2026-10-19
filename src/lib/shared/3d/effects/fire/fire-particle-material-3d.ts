/**
 * FireParticleMaterial3D - velocity-stretched, noise-eroded flame-lick shader
 * for the Lagrangian fire renderer.
 *
 * Point sprites read as "particley" because they are screen-aligned squares
 * that can neither rotate nor elongate. This material instead renders each
 * particle as an instanced quad that is billboarded and *stretched along its
 * own velocity* entirely in the vertex shader (GPU view-space billboarding -
 * no per-instance CPU matrix). A particle streaking sideways with the tip
 * becomes a sideways streak; one rising on buoyancy becomes a vertical tongue.
 *
 * The fragment shader carves a flame-lick silhouette out of the quad - wide
 * rounded base tapering to a frayed tip - then erodes its edges with scrolling
 * value-noise fBm so the outline is torn, not elliptical. Dense overlap of
 * these licks under additive blending reads as continuous wispy flame rather
 * than a cloud of blobs.
 *
 * Per-instance attributes (set by FireRenderer3D):
 *   aCenter (vec3) - world-space (rig-local) particle position
 *   aVel    (vec3) - world-space velocity (stretch axis + magnitude)
 *   aLife   (float) - normalized age 0..1 (drives blackbody color + size curve)
 *   aSeed   (float) - per-particle random for noise decorrelation
 *   aSize   (float) - base size in world units
 *
 * Age drives the blackbody ramp: white-hot core (HDR for bloom) -> orange ->
 * deep red -> smoke faded to nothing.
 */

import { ShaderMaterial, AdditiveBlending, DoubleSide, Color } from "three";
import type { FireColorSet } from "./fire-color-curve-3d";

const vertexShader = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec3 aVel;
  attribute float aLife;
  attribute float aSeed;
  attribute float aSize;
  attribute vec3 aPropColor;

  uniform float uLenBase;
  uniform float uLenPerSpeed;
  uniform float uLenMax;
  uniform float uWidth;

  varying vec2 vUv;
  varying float vLife;
  varying float vSeed;
  varying vec3 vPropColor;

  void main() {
    vUv = uv;
    vLife = aLife;
    vSeed = aSeed;
    vPropColor = aPropColor;

    // aSize already widens with age as the gas mixes with air (fire-physics);
    // the last of the gas thins as it burns out.
    float sizeMul = 1.0 - smoothstep(0.6, 1.0, aLife) * 0.45;

    // View-space billboard: stretch axis = velocity projected to the screen.
    vec3 centerView = (modelViewMatrix * vec4(aCenter, 1.0)).xyz;
    vec3 velView = (modelViewMatrix * vec4(aVel, 0.0)).xyz;
    vec2 dir = velView.xy;
    float speed = length(dir);
    vec2 along = speed > 1e-4 ? dir / speed : vec2(0.0, 1.0);
    vec2 perp = vec2(-along.y, along.x);

    float lenFactor = min(uLenBase + speed * uLenPerSpeed, uLenMax);
    float halfLen = aSize * sizeMul * lenFactor;
    float halfWid = aSize * sizeMul * uWidth;

    vec2 local = uv - 0.5; // [-0.5, 0.5]
    vec2 offset = along * (local.y * 2.0 * halfLen) + perp * (local.x * 2.0 * halfWid);
    vec3 posView = centerView + vec3(offset, 0.0);

    gl_Position = projectionMatrix * vec4(posView, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform vec3 uHot;
  uniform vec3 uWarm;
  uniform vec3 uCool;
  uniform vec3 uSmoke;
  uniform float uEmissiveHot;
  uniform float uColorBlend;
  uniform float uTime;

  varying vec2 vUv;
  varying float vLife;
  varying float vSeed;
  varying vec3 vPropColor;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
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
    float s = 0.0;
    float a = 0.5;
    // 2 octaves: with thousands of overlapping sprites the density supplies the
    // fine detail, so we keep the per-fragment cost low under heavy overdraw.
    for (int i = 0; i < 2; i++) {
      s += a * vnoise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return s;
  }

  void main() {
    // No flame-shaped sprite: each particle is a soft, formless, eroded blob.
    // The flame is built by DENSITY + motion + color across thousands of these,
    // never by any single sprite's outline - so nothing reads as a triangle.
    float xc = vUv.x - 0.5; // -0.5 .. 0.5 across
    float yc = vUv.y - 0.5; // -0.5 .. 0.5 along (velocity)

    // Elongated Gaussian, tighter across than along so the velocity-stretched
    // quad reads as a tongue. The edge window takes it to zero before the quad
    // ends; a Gaussian alone still shows the quad's straight sides.
    float across = abs(xc) * 2.0;
    float along = abs(yc) * 2.0;
    float g = exp(-(across * across * 3.0 + along * along * 2.0));
    g *= (1.0 - smoothstep(0.7, 1.0, across)) * (1.0 - smoothstep(0.7, 1.0, along));

    // Scrolling fBm tears the blob into tongues. The luminous zone of a real
    // flame has a fairly defined edge, so the noise cuts it rather than only
    // dimming it, and thin areas vanish.
    float fray = fbm(vec2(xc * 5.0 + vSeed * 19.0,
                          vUv.y * 5.0 - uTime * 2.6 + vSeed * 8.0));
    float shape = smoothstep(0.12, 0.6, g * (0.25 + 1.0 * fray));
    if (shape < 0.004) discard;

    // Blackbody ramp across normalized age.
    vec3 color;
    if (vLife < 0.35) {
      color = mix(uHot, uWarm, vLife / 0.35);
    } else if (vLife < 0.7) {
      color = mix(uWarm, uCool, (vLife - 0.35) / 0.35);
    } else {
      color = mix(uCool, uSmoke, (vLife - 0.7) / 0.3);
    }

    // Color slider (uColorBlend): tint the natural fire hue toward the prop
    // color. propTinted reuses the ramp's luminance (lum) so the flame keeps
    // its bright-core/dim-edge structure even when fully prop-colored. Blend
    // ALL the way at uColorBlend=1 — a partial blend would leave residual
    // orange (high red channel) that, under additive blending, mixes with a
    // blue prop into purple. Full blend = clean prop-colored flame. Mirrors
    // the 2D fire's colorBlend, which also blends toward propColors.
    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    vec3 propTinted = vPropColor * lum * 1.15;
    color = mix(color, propTinted, uColorBlend);

    // Emission: a super-hot WICK spike on the youngest particles (the bright
    // point where the flame is born) that dampens fast, over a dimmer body that
    // cools as it ages. The whole curve scales with uEmissiveHot (the
    // brightness lever) so turning brightness down still tames it. The fray
    // term flickers the interior so the body churns instead of reading flat.
    //   wick: ~2.3x at birth, gone by 15% of life -> a hot, quickly-damping core
    //   body: full -> 12%, cooling over the first 45% of life
    float wick = (1.0 - smoothstep(0.0, 0.15, vLife)) * 1.3;
    float body = mix(1.0, 0.2, smoothstep(0.15, 0.9, vLife));
    float emis = uEmissiveHot * (body + wick);
    color *= emis * (0.7 + 0.55 * fray);

    // Lifetime alpha: quick flash-in, then a fade across the back half. Life
    // is the gas's real burn time (fire-physics), so the glow lasts all of it.
    float fadeIn = smoothstep(0.0, 0.05, vLife);
    float fadeOut = 1.0 - smoothstep(0.45, 1.0, vLife);
    float alpha = shape * fadeIn * fadeOut;
    if (alpha < 0.004) discard;

    gl_FragColor = vec4(color, alpha);
  }
`;

export interface FireParticleMaterialOptions {
  colors: FireColorSet;
  /** Core emissive multiplier (HDR, drives bloom). Default 0.53 (tamed). */
  emissiveHot?: number;
}

export function createFireParticleMaterial(
  options: FireParticleMaterialOptions,
): ShaderMaterial {
  const { colors, emissiveHot } = options;
  return new ShaderMaterial({
    uniforms: {
      uHot: { value: colors.hot.clone() },
      uWarm: { value: colors.warm.clone() },
      uCool: { value: colors.cool.clone() },
      uSmoke: { value: colors.smoke.clone() },
      // Lower per-particle emission: isolated blobs stay faint wisps; the bright
      // core comes from additive overlap where the flame is dense.
      uEmissiveHot: { value: emissiveHot ?? 0.53 },
      uColorBlend: { value: 0 },
      uTime: { value: 0 },
      // Stretch tuning (world-unit factors of aSize). Shorter + fatter than the
      // first pass so sprites read as soft tongues, not long spikes.
      uLenBase: { value: 0.9 },
      uLenPerSpeed: { value: 0.28 },
      uLenMax: { value: 2.2 },
      uWidth: { value: 0.8 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  });
}

/** Live-set the HDR core emissive (the bloom-blowout lever) on an existing material. */
export function setFireEmissive(material: ShaderMaterial, emissiveHot: number): void {
  material.uniforms.uEmissiveHot!.value = emissiveHot;
}

/** Live-set the prop-color tint amount (the Color slider) on an existing material. */
export function setFireColorBlend(material: ShaderMaterial, colorBlend: number): void {
  material.uniforms.uColorBlend!.value = colorBlend;
}

/** Push a new color set into an existing material's uniforms (preset switch). */
export function applyFireParticleColors(material: ShaderMaterial, colors: FireColorSet): void {
  (material.uniforms.uHot!.value as Color).copy(colors.hot);
  (material.uniforms.uWarm!.value as Color).copy(colors.warm);
  (material.uniforms.uCool!.value as Color).copy(colors.cool);
  (material.uniforms.uSmoke!.value as Color).copy(colors.smoke);
}
