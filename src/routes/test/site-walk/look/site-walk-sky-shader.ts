/**
 * The evening sky, written once and used three ways: drawn as the dome, captured
 * as the light everything stands in, and read by the haze so the far ground
 * melts into exactly the sky behind it.
 */

import {
  Color,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  Vector3,
  type IUniform,
} from "three";
import {
  directionOf,
  radiance,
  type LookRecipe,
  type Radiance,
} from "./site-walk-look";

export type SkyUniforms = Record<string, IUniform>;

const NOISE_SIZE = 256;

function hash(x: number, y: number, s: number): number {
  let h =
    Math.imul(x + s * 1619, 374761393) + Math.imul(y + s * 31337, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const wrap = (v: number, n: number) => ((v % n) + n) % n;

/** Gradient noise on a wrapping lattice, so the picture tiles with no seam. */
function gradientNoise(
  u: number,
  v: number,
  cells: number,
  seed: number
): number {
  const x = u * cells;
  const y = v * cells;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const at = (ix: number, iy: number) => {
    const a = hash(wrap(ix, cells), wrap(iy, cells), seed) * Math.PI * 2;
    return Math.cos(a) * (x - ix) + Math.sin(a) * (y - iy);
  };
  const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
  const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
  return top + (bottom - top) * sy;
}

/** Inverted cell noise: round puffs. */
function puffNoise(u: number, v: number, cells: number, seed: number): number {
  const x = u * cells;
  const y = v * cells;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  let best = 9;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = wrap(x0 + i, cells);
      const cy = wrap(y0 + j, cells);
      const dx = x0 + i + hash(cx, cy, seed) - x;
      const dy = y0 + j + hash(cx, cy, seed + 7) - y;
      best = Math.min(best, dx * dx + dy * dy);
    }
  }
  return 1 - Math.min(1, Math.sqrt(best));
}

let noise: DataTexture | null = null;

/** Tiling noise: fractal, puffs, fine fractal, white. Built once and kept for the page's life. */
export function skyNoise(): DataTexture {
  if (noise) return noise;
  const N = NOISE_SIZE;
  const channels = [
    new Float32Array(N * N),
    new Float32Array(N * N),
    new Float32Array(N * N),
  ] as const;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const v = y / N;
      const i = y * N + x;
      let broad = 0;
      let amplitude = 0.5;
      for (let o = 0; o < 5; o++, amplitude *= 0.5)
        broad += gradientNoise(u, v, 4 << o, 3 + o) * amplitude;
      channels[0][i] = broad;
      channels[1][i] =
        puffNoise(u, v, 6, 21) * 0.6 +
        puffNoise(u, v, 13, 22) * 0.28 +
        puffNoise(u, v, 27, 23) * 0.12;
      let fine = 0;
      amplitude = 0.5;
      for (let o = 0; o < 4; o++, amplitude *= 0.55)
        fine += gradientNoise(u, v, 12 << o, 40 + o) * amplitude;
      channels[2][i] = fine;
    }
  }
  const data = new Uint8Array(N * N * 4);
  channels.forEach((list, c) => {
    // Stretched by its spread, not its extremes, so one threshold means one amount of cover.
    let mean = 0;
    for (const v of list) mean += v;
    mean /= list.length;
    let spread = 0;
    for (const v of list) spread += (v - mean) ** 2;
    spread = Math.sqrt(spread / list.length) || 1;
    for (let i = 0; i < list.length; i++) {
      const t = 0.5 + ((list[i]! - mean) / spread) * 0.19;
      data[i * 4 + c] = Math.round(Math.min(1, Math.max(0, t)) * 255);
    }
  });
  for (let i = 0; i < N * N; i++)
    data[i * 4 + 3] = Math.round(hash(i % N, Math.floor(i / N), 91) * 255);
  noise = new DataTexture(data, N, N, RGBAFormat);
  noise.colorSpace = NoColorSpace;
  noise.wrapS = noise.wrapT = RepeatWrapping;
  noise.magFilter = LinearFilter;
  noise.minFilter = LinearMipmapLinearFilter;
  noise.generateMipmaps = true;
  noise.needsUpdate = true;
  return noise;
}

export function createSkyUniforms(): SkyUniforms {
  return {
    uSunDir: { value: new Vector3(0, 1, 0) },
    uZenith: { value: new Color() },
    uMidSun: { value: new Color() },
    uMidAnti: { value: new Color() },
    uHorizonSun: { value: new Color() },
    uHorizonAnti: { value: new Color() },
    uBelt: { value: new Color() },
    uGlow: { value: new Color() },
    uDisk: { value: new Color() },
    uDiskCos: { value: 1 },
    uLowFall: { value: 8 },
    uMidFall: { value: 2 },
    uGround: { value: new Color() },
    uNoise: { value: skyNoise() },
    uTime: { value: 0 },
    uCover: { value: 0.5 },
    uSoft: { value: 0.3 },
    uCloudAlpha: { value: 1 },
    uCloudLit: { value: new Color() },
    uCloudDark: { value: new Color() },
    uCloudRim: { value: new Color() },
    uCirrus: { value: 0 },
    uCirrusColour: { value: new Color() },
    uDrift: { value: 0 },
  };
}

export function applySky(u: SkyUniforms, r: LookRecipe): void {
  const set = (name: string, value: Radiance) =>
    radiance(value, u[name]!.value as Color);
  (u.uSunDir!.value as Vector3).copy(
    directionOf(r.key.azimuth, r.key.elevation)
  );
  set("uZenith", r.sky.zenith);
  set("uMidSun", r.sky.midSun);
  set("uMidAnti", r.sky.midAnti);
  set("uHorizonSun", r.sky.horizonSun);
  set("uHorizonAnti", r.sky.horizonAnti);
  set("uBelt", r.sky.belt);
  set("uGlow", r.sky.glow);
  set("uDisk", r.sky.disk);
  set("uGround", r.sky.ground);
  u.uDiskCos!.value = Math.cos(((r.sky.diskDegrees / 2) * Math.PI) / 180);
  u.uLowFall!.value = r.sky.lowFall;
  u.uMidFall!.value = r.sky.midFall;
  u.uCover!.value = r.clouds.coverage;
  u.uSoft!.value = r.clouds.softness;
  u.uCloudAlpha!.value = r.clouds.opacity;
  set("uCloudLit", r.clouds.lit);
  set("uCloudDark", r.clouds.dark);
  set("uCloudRim", r.clouds.rim);
  u.uCirrus!.value = r.clouds.cirrus;
  set("uCirrusColour", r.clouds.cirrusColour);
  u.uDrift!.value = r.clouds.drift;
}

/** The clear sky: gradient, the pink band, and the glow round the sun. */
export const SKY_BASE_GLSL = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uZenith;
  uniform vec3 uMidSun;
  uniform vec3 uMidAnti;
  uniform vec3 uHorizonSun;
  uniform vec3 uHorizonAnti;
  uniform vec3 uBelt;
  uniform vec3 uGlow;
  uniform float uLowFall;
  uniform float uMidFall;

  vec3 skyBase(vec3 d, float glowScale) {
    float h = max(d.y, 0.0);
    vec2 flat2 = d.xz / max(length(d.xz), 1e-4);
    vec2 sun2 = uSunDir.xz / max(length(uSunDir.xz), 1e-4);
    float c = dot(flat2, sun2) * 0.5 + 0.5;
    float side = mix(0.5, c * c * (3.0 - 2.0 * c), smoothstep(0.0, 0.25, length(d.xz)));
    vec3 horizon = mix(uHorizonAnti, uHorizonSun, side * side);
    vec3 mid = mix(uMidAnti, uMidSun, side);
    vec3 col = mix(uZenith, mid, exp(-h * uMidFall));
    col = mix(col, horizon, exp(-h * uLowFall));
    float belt = (h - 0.15) / 0.09;
    col += uBelt * exp(-belt * belt) * (1.0 - side);
    float mu = max(dot(d, uSunDir), 0.0);
    // The glow spreads along the horizon more than up it: a low sun shines a long way through haze.
    float wide = max(dot(normalize(vec3(d.x, d.y * 2.2, d.z)), normalize(vec3(uSunDir.x, uSunDir.y * 2.2, uSunDir.z))), 0.0);
    col += uGlow * glowScale * (0.2 * pow(wide, 7.0) + 0.5 * pow(mu, 40.0) + 1.3 * pow(mu, 380.0));
    return col;
  }
`;

export const SKY_CLOUD_GLSL = /* glsl */ `
  uniform sampler2D uNoise;
  uniform float uTime;
  uniform float uCover;
  uniform float uSoft;
  uniform float uCloudAlpha;
  uniform float uCirrus;
  uniform float uDrift;
  uniform vec3 uCloudLit;
  uniform vec3 uCloudDark;
  uniform vec3 uCloudRim;
  uniform vec3 uCirrusColour;

  const mat2 TURN = mat2(0.8, -0.6, 0.6, 0.8);

  // Big weather, then billows, then frayed edges; turned against each other so the tile never shows.
  float density(vec2 p) {
    vec2 t = TURN * p;
    float d = texture2D(uNoise, p * 0.031 + 0.17).r * 0.36;
    d += texture2D(uNoise, t * 0.083 + 0.43).r * 0.27;
    d += texture2D(uNoise, p * 0.19).g * 0.2;
    d += texture2D(uNoise, t * 0.47 + 0.61).g * 0.11;
    d += texture2D(uNoise, p * 1.3).b * 0.06;
    return d;
  }

  float puff(vec2 p) { return smoothstep(uCover, uCover + uSoft, density(p)); }

  // The same cloud without its fine edges, for the light's path through it.
  float bulk(vec2 p) {
    vec2 t = TURN * p;
    float d = texture2D(uNoise, p * 0.031 + 0.17).r * 0.36 + texture2D(uNoise, t * 0.083 + 0.43).r * 0.27;
    d += texture2D(uNoise, p * 0.19).g * 0.2 + 0.085;
    return smoothstep(uCover, uCover + uSoft, d);
  }

  // Premultiplied cloud colour and cover along a direction.
  vec4 cloudsAt(vec3 d, vec3 base) {
    if (d.y < 0.01) return vec4(0.0);
    vec2 plane = d.xz / (d.y + 0.09);
    vec2 p = plane * 1.25 + vec2(uTime * uDrift * 14.0, uTime * uDrift * 5.0);
    float cover = puff(p);
    float mu = max(dot(d, uSunDir), 0.0);
    // March toward the sun: cloud in the way is shade, an open edge is fire.
    vec2 toSun = uSunDir.xz / max(length(uSunDir.xz), 1e-4);
    float shade = 0.0;
    for (int i = 1; i <= 5; i++) shade += bulk(p + toSun * float(i) * float(i) * 0.06) * 0.30;
    float light = exp(-shade * 1.35);
    float thick = smoothstep(0.15, 0.95, cover);
    vec3 body = mix(uCloudDark, uCloudLit, light * (0.42 + 0.58 * mu * mu));
    body = mix(body, uCloudLit, 0.18 * (1.0 - thick));
    float edge = (1.0 - thick) * light;
    body += uCloudRim * edge * (0.10 * mu * mu + 0.8 * pow(mu, 14.0));
    float alpha = cover * uCloudAlpha;
    // Low on the horizon clouds lose themselves in the haze.
    float far = smoothstep(0.02, 0.2, d.y);
    body = mix(base, body, 0.25 + 0.75 * far);
    alpha *= smoothstep(0.012, 0.09, d.y);
    vec4 outColour = vec4(body * alpha, alpha);

    // High streaks above them, drawn out by the wind up there.
    vec2 c2 = d.xz / (d.y + 0.22);
    c2 = mat2(0.82, -0.57, 0.57, 0.82) * c2;
    c2.y += (texture2D(uNoise, c2 * 0.05).r - 0.5) * 0.5;
    vec2 q2 = c2 * vec2(0.09, 0.36) + vec2(uTime * uDrift * 2.0, 0.0);
    float streak = texture2D(uNoise, q2).r * 0.5 + texture2D(uNoise, q2 * vec2(2.2, 2.7) + 0.4).r * 0.3 + texture2D(uNoise, q2 * vec2(5.0, 6.0)).b * 0.2;
    streak *= 0.6 + 0.8 * texture2D(uNoise, c2 * 0.06 + 0.3).r;
    float veil = smoothstep(0.46, 0.85, streak) * uCirrus * smoothstep(0.05, 0.28, d.y);
    vec3 veilColour = uCirrusColour * (0.55 + 0.9 * mu * mu);
    outColour += (1.0 - outColour.a) * vec4(veilColour * veil, veil);
    return outColour;
  }
`;
