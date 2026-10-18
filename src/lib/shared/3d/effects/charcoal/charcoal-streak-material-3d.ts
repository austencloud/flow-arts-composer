/**
 * Motion-streak material for 3D Coal sparks.
 *
 * Each spark is one instanced quad stretched from where the spark is to where
 * it was one shutter-time ago, so a fast spark paints a line along its flight
 * and a slow one a round dot. The quad is built in screen space, which keeps
 * a streak the same thickness from any camera angle, and its width follows
 * the spark's glow in metres with a pixel floor so distant sparks never
 * vanish between pixels.
 */

import {
  AdditiveBlending,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  BufferAttribute,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
} from "three";

const vertexShader = /* glsl */ `
  attribute vec2 corner;
  attribute vec3 instanceHead;
  attribute vec3 instanceVelocity;
  attribute float instanceWidth;
  attribute float instanceHeat;
  attribute float instanceAlpha;

  uniform vec2 uViewport;
  uniform float uShutter;
  uniform float uMinWidth;
  uniform float uMaxWidth;

  varying vec2 vLocal;
  varying float vLength;
  varying float vWidth;
  varying float vHeat;
  varying float vAlpha;

  void main() {
    vHeat = instanceHeat;
    vAlpha = instanceAlpha;

    vec4 head = projectionMatrix * modelViewMatrix * vec4(instanceHead, 1.0);
    if (head.w <= 0.05) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      vLocal = vec2(0.0);
      vLength = 0.0;
      vWidth = 1.0;
      return;
    }
    vec4 tail = projectionMatrix * modelViewMatrix *
      vec4(instanceHead - instanceVelocity * uShutter, 1.0);
    if (tail.w <= 0.05) tail = head;

    vec2 halfViewport = 0.5 * uViewport;
    vec2 headPx = head.xy / head.w * halfViewport;
    vec2 tailPx = tail.xy / tail.w * halfViewport;
    vec2 span = headPx - tailPx;
    float spanLength = length(span);
    vec2 along = spanLength > 0.001 ? span / spanLength : vec2(1.0, 0.0);
    vec2 side = vec2(-along.y, along.x);

    float pixelsPerMetre = halfViewport.y * projectionMatrix[1][1] / head.w;
    float width = clamp(instanceWidth * pixelsPerMetre, uMinWidth, uMaxWidth);

    // corner.x: 0 at the head, 1 at the tail. Both ends grow past the
    // segment so the streak has round caps and a still spark is a dot, and
    // the quad reaches past the width so the glow fades out before its edge.
    // alongPx runs from the head toward the tail.
    float extent = width * 1.4;
    float alongPx = corner.x < 0.5 ? -extent : spanLength + extent;
    vec2 px = headPx - along * alongPx + side * corner.y * extent;
    vec4 base = corner.x < 0.5 ? head : tail;
    gl_Position = vec4(px / halfViewport * base.w, base.z, base.w);

    vLocal = vec2(alongPx, corner.y * extent);
    vLength = spanLength;
    vWidth = width;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform vec3 uCoreColor;
  uniform vec3 uMidColor;
  uniform vec3 uCoolColor;
  uniform float uEmissiveStrength;

  varying vec2 vLocal;
  varying float vLength;
  varying float vWidth;
  varying float vHeat;
  varying float vAlpha;

  vec3 heatColor(float temperature) {
    if (temperature > 0.5) {
      return mix(uMidColor, uCoreColor, (temperature - 0.5) * 2.0);
    }
    return mix(uCoolColor, uMidColor, temperature * 2.0);
  }

  void main() {
    float onSegment = clamp(vLocal.x, 0.0, vLength);
    float dist = length(vec2(vLocal.x - onSegment, vLocal.y)) /
      max(0.001, vWidth);
    float core = exp(-dist * dist * 2.6);
    if (core < 0.01) discard;

    // Brightest at the spark itself, fading toward where it was.
    float trail = 1.0 - 0.6 * (onSegment / max(1.0, vLength));
    // A long streak spreads the same light over more pixels.
    float exposure = mix(1.0, (2.0 * vWidth) / (vLength + 2.0 * vWidth), 0.45);

    vec3 color = heatColor(vHeat);
    float whiteHeat =
      smoothstep(0.86, 1.0, vHeat) * (1.0 - smoothstep(0.0, 0.3, dist));
    color = mix(color, mix(uCoreColor, vec3(1.0), 0.85), whiteHeat);

    float alpha = core * trail * exposure * vAlpha;
    gl_FragColor = vec4(color * uEmissiveStrength * (0.6 + vHeat * 0.9), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface CharcoalStreakMaterialOptions {
  coreColor?: [number, number, number];
  midColor?: [number, number, number];
  coolColor?: [number, number, number];
  emissiveStrength?: number;
  shutterSeconds: number;
}

function setRgb255(color: Color, rgb: [number, number, number]): void {
  color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, SRGBColorSpace);
}

export function updateCharcoalStreakMaterial(
  material: ShaderMaterial,
  options: Partial<CharcoalStreakMaterialOptions>
): void {
  const uniforms = material.uniforms;
  if (options.coreColor) setRgb255(uniforms.uCoreColor!.value, options.coreColor);
  if (options.midColor) setRgb255(uniforms.uMidColor!.value, options.midColor);
  if (options.coolColor) setRgb255(uniforms.uCoolColor!.value, options.coolColor);
  if (options.emissiveStrength !== undefined) {
    uniforms.uEmissiveStrength!.value = options.emissiveStrength;
  }
  if (options.shutterSeconds !== undefined) {
    uniforms.uShutter!.value = options.shutterSeconds;
  }
}

export function createCharcoalStreakMaterial(
  options: CharcoalStreakMaterialOptions
): ShaderMaterial {
  const material = new ShaderMaterial({
    uniforms: {
      uCoreColor: { value: new Color() },
      uMidColor: { value: new Color() },
      uCoolColor: { value: new Color() },
      uEmissiveStrength: { value: 1.5 },
      uShutter: { value: options.shutterSeconds },
      uViewport: { value: new Vector2(1920, 1080) },
      uMinWidth: { value: 1.1 },
      uMaxWidth: { value: 4.5 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    // The quad is built in screen space, so its winding says nothing about
    // which way it faces.
    side: DoubleSide,
  });
  updateCharcoalStreakMaterial(material, {
    coreColor: options.coreColor ?? [255, 242, 210],
    midColor: options.midColor ?? [255, 150, 35],
    coolColor: options.coolColor ?? [170, 45, 2],
    emissiveStrength: options.emissiveStrength ?? 1.5,
  });
  return material;
}

/** Per-instance buffers for `capacity` streaks, sharing one quad. */
export interface CharcoalStreakBuffers {
  geometry: InstancedBufferGeometry;
  heads: Float32Array;
  velocities: Float32Array;
  widths: Float32Array;
  heats: Float32Array;
  alphas: Float32Array;
}

export function createCharcoalStreakGeometry(
  capacity: number
): CharcoalStreakBuffers {
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute(
    "corner",
    new BufferAttribute(new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), 2)
  );
  geometry.setIndex([0, 2, 1, 1, 2, 3]);
  const heads = new Float32Array(capacity * 3);
  const velocities = new Float32Array(capacity * 3);
  const widths = new Float32Array(capacity);
  const heats = new Float32Array(capacity);
  const alphas = new Float32Array(capacity);
  const dynamic = 35048;
  geometry.setAttribute(
    "instanceHead",
    new InstancedBufferAttribute(heads, 3).setUsage(dynamic)
  );
  geometry.setAttribute(
    "instanceVelocity",
    new InstancedBufferAttribute(velocities, 3).setUsage(dynamic)
  );
  geometry.setAttribute(
    "instanceWidth",
    new InstancedBufferAttribute(widths, 1).setUsage(dynamic)
  );
  geometry.setAttribute(
    "instanceHeat",
    new InstancedBufferAttribute(heats, 1).setUsage(dynamic)
  );
  geometry.setAttribute(
    "instanceAlpha",
    new InstancedBufferAttribute(alphas, 1).setUsage(dynamic)
  );
  geometry.instanceCount = 0;
  return { geometry, heads, velocities, widths, heats, alphas };
}

export const STREAK_ATTRIBUTE_NAMES = [
  "instanceHead",
  "instanceVelocity",
  "instanceWidth",
  "instanceHeat",
  "instanceAlpha",
] as const;
