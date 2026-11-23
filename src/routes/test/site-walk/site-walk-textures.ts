/**
 * The site's surface pictures, drawn once on small canvases.
 *
 * No file is fetched for these: worn gravel, asphalt, pavers with joints and
 * the chain-link mesh are all made here from seeded noise, so the same plan
 * always looks the same and nothing waits on the network. Every texture tiles
 * (the noise wraps), carries mipmaps and anisotropy, and is built the first time
 * it is asked for and kept for the page's life. Two canvases per surface where
 * it needs them: the colour, and a grey roughness map so wet-looking and dry
 * patches differ.
 */

import { CanvasTexture, LinearSRGBColorSpace, RepeatWrapping, SRGBColorSpace } from "three";

export interface SurfaceMaps {
  albedo: CanvasTexture;
  roughness?: CanvasTexture;
}

export const SIZE = 512;
const ANISOTROPY = 8;

/** A small seeded generator. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Value noise on a wrapping lattice, 0 to 1, so the picture tiles with no seam. */
function wrappedNoise(size: number, cells: number, random: () => number): Float32Array {
  const lattice = new Float32Array(cells * cells);
  for (let i = 0; i < lattice.length; i++) lattice[i] = random();
  const out = new Float32Array(size * size);
  const scale = cells / size;
  for (let y = 0; y < size; y++) {
    const fy = y * scale;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < size; x++) {
      const fx = x * scale;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const sx = tx * tx * (3 - 2 * tx);
      const at = (cx: number, cy: number) => lattice[(cy % cells) * cells + (cx % cells)]!;
      const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
      const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
      out[y * size + x] = top + (bottom - top) * sy;
    }
  }
  return out;
}

/** Several octaves of wrapped noise, 0 to 1. */
export function fractal(size: number, random: () => number, cells = 4, octaves = 4): Float32Array {
  const out = new Float32Array(size * size);
  let amplitude = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const layer = wrappedNoise(size, cells << o, random);
    for (let i = 0; i < out.length; i++) out[i]! += layer[i]! * amplitude;
    total += amplitude;
    amplitude *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i]! /= total;
  return out;
}

export function canvasOf(size: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("A canvas is needed to draw the site's surfaces.");
  return { canvas, ctx };
}

export function textureOf(canvas: HTMLCanvasElement, colour: boolean): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = colour ? SRGBColorSpace : LinearSRGBColorSpace;
  texture.anisotropy = ANISOTROPY;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** A speckle dot drawn again across each edge it crosses, so it tiles. */
export function wrapDot(ctx: CanvasRenderingContext2D, size: number, x: number, y: number, r: number): void {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      const px = x + dx;
      const py = y + dy;
      if (px + r < 0 || px - r > size || py + r < 0 || py - r > size) continue;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

interface GrainOptions {
  seed: number;
  /** Base colour, 0 to 255. */
  base: readonly [number, number, number];
  /** How far the broad patches swing the brightness, in 0 to 255 steps. */
  patches: number;
  /** How far the fine grain swings it. */
  grain: number;
  /** Pebbles: how many, how big, and how far from the base they sit. */
  pebbles: { count: number; radius: [number, number]; spread: number };
  /** Roughness range, 0 to 1. */
  roughness: readonly [number, number];
}

/** Worn ground: broad patches, fine grain and scattered pebbles. */
function grainSurface(options: GrainOptions): SurfaceMaps {
  const random = seeded(options.seed);
  const broad = fractal(SIZE, random, 3, 4);
  const fine = fractal(SIZE, random, 64, 2);
  const colour = canvasOf(SIZE);
  const grey = canvasOf(SIZE);
  const image = colour.ctx.createImageData(SIZE, SIZE);
  const rough = grey.ctx.createImageData(SIZE, SIZE);
  const [rLow, rHigh] = options.roughness;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const shift = (broad[i]! - 0.5) * options.patches + (fine[i]! - 0.5) * options.grain;
    for (let c = 0; c < 3; c++) image.data[i * 4 + c] = Math.max(0, Math.min(255, options.base[c]! + shift));
    image.data[i * 4 + 3] = 255;
    const r = Math.round((rLow + (rHigh - rLow) * (0.35 * (1 - broad[i]!) + 0.65 * fine[i]!)) * 255);
    rough.data[i * 4] = rough.data[i * 4 + 1] = rough.data[i * 4 + 2] = r;
    rough.data[i * 4 + 3] = 255;
  }
  colour.ctx.putImageData(image, 0, 0);
  grey.ctx.putImageData(rough, 0, 0);
  const { count, radius, spread } = options.pebbles;
  for (let i = 0; i < count; i++) {
    const lift = (random() - 0.5) * 2 * spread;
    const r = radius[0] + random() * (radius[1] - radius[0]);
    colour.ctx.fillStyle = `rgb(${options.base.map((v) => Math.max(0, Math.min(255, Math.round(v + lift)))).join(",")})`;
    wrapDot(colour.ctx, SIZE, random() * SIZE, random() * SIZE, r);
  }
  return {
    albedo: textureOf(colour.canvas, true),
    roughness: textureOf(grey.canvas, false),
  };
}

const cache: {
  gravel?: SurfaceMaps;
  asphalt?: SurfaceMaps;
  dirt?: SurfaceMaps;
  pavers?: SurfaceMaps;
  chainLink?: CanvasTexture;
} = {};

/** Packed gravel for the lot: pale, with visible pebbles. */
export function gravelMaps(): SurfaceMaps {
  return (cache.gravel ??= grainSurface({
    seed: 4101,
    base: [150, 140, 118],
    patches: 46,
    grain: 40,
    pebbles: { count: 900, radius: [0.9, 2.4], spread: 55 },
    roughness: [0.82, 0.98],
  }));
}

/** Worn asphalt for the street: dark, fine grain, a few bright chips. */
export function asphaltMaps(): SurfaceMaps {
  return (cache.asphalt ??= grainSurface({
    seed: 5202,
    base: [58, 61, 68],
    patches: 26,
    grain: 30,
    pebbles: { count: 1400, radius: [0.6, 1.5], spread: 48 },
    roughness: [0.72, 0.95],
  }));
}

/** Bare dirt for outside the lot, until the photographed ground arrives. */
export function dirtMaps(): SurfaceMaps {
  return (cache.dirt ??= grainSurface({
    seed: 6303,
    base: [92, 84, 66],
    patches: 54,
    grain: 36,
    pebbles: { count: 500, radius: [0.8, 2], spread: 40 },
    roughness: [0.88, 1],
  }));
}

/** Concrete pavers: a 3 by 3 block with joints, each paver a slightly different grey. Tiles every 1.2 m. */
export function paverMaps(): SurfaceMaps {
  if (cache.pavers) return cache.pavers;
  const random = seeded(7404);
  const grain = fractal(SIZE, random, 32, 2);
  const colour = canvasOf(SIZE);
  const grey = canvasOf(SIZE);
  const per = 3;
  const cell = SIZE / per;
  const joint = 7;
  const image = colour.ctx.createImageData(SIZE, SIZE);
  const rough = grey.ctx.createImageData(SIZE, SIZE);
  const tints = Array.from({ length: per * per }, () => (random() - 0.5) * 34);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const cx = Math.floor(x / cell);
      const cy = Math.floor(y / cell);
      const lx = x - cx * cell;
      const ly = y - cy * cell;
      const inJoint = lx < joint / 2 || lx > cell - joint / 2 || ly < joint / 2 || ly > cell - joint / 2;
      const v = inJoint ? 70 + (grain[i]! - 0.5) * 30 : 176 + tints[cy * per + cx]! + (grain[i]! - 0.5) * 38;
      image.data[i * 4] = v;
      image.data[i * 4 + 1] = v * 0.99;
      image.data[i * 4 + 2] = v * 0.95;
      image.data[i * 4 + 3] = 255;
      const r = inJoint ? 255 : Math.round((0.7 + 0.25 * grain[i]!) * 255);
      rough.data[i * 4] = rough.data[i * 4 + 1] = rough.data[i * 4 + 2] = r;
      rough.data[i * 4 + 3] = 255;
    }
  }
  colour.ctx.putImageData(image, 0, 0);
  grey.ctx.putImageData(rough, 0, 0);
  return (cache.pavers = {
    albedo: textureOf(colour.canvas, true),
    roughness: textureOf(grey.canvas, false),
  });
}

/** Metres one repeat of each surface covers. */
export const TILE = { gravel: 4, asphalt: 3, dirt: 6, pavers: 1.2 } as const;

/**
 * Chain link: a diamond wire pattern on a transparent ground, for an
 * alpha-tested panel. One repeat is a 4 by 4 block of diamonds; the caller sets
 * how many repeat across a panel. Mipmaps with alpha-test would thin the wire
 * to nothing at distance, so the wire is drawn bold and the alpha is kept soft
 * for `alphaToCoverage` or a low alpha-test cut.
 */
export function chainLinkTexture(): CanvasTexture {
  if (cache.chainLink) return cache.chainLink;
  const { canvas, ctx } = canvasOf(SIZE);
  ctx.clearRect(0, 0, SIZE, SIZE);
  const diamonds = 4;
  const step = SIZE / diamonds;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgb(200,206,212)";
  ctx.lineWidth = 9;
  // Each wire runs corner to corner; drawn past the edges so it tiles.
  for (let i = -diamonds; i <= diamonds * 2; i++) {
    const offset = i * step;
    ctx.beginPath();
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset + SIZE, SIZE);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(offset, SIZE);
    ctx.lineTo(offset + SIZE, 0);
    ctx.stroke();
  }
  // A brighter core so the wire catches the light.
  ctx.strokeStyle = "rgb(240,244,248)";
  ctx.lineWidth = 3;
  for (let i = -diamonds; i <= diamonds * 2; i++) {
    const offset = i * step;
    ctx.beginPath();
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset + SIZE, SIZE);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(offset, SIZE);
    ctx.lineTo(offset + SIZE, 0);
    ctx.stroke();
  }
  return (cache.chainLink = textureOf(canvas, true));
}
