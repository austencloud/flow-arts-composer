import { CanvasTexture, SRGBColorSpace } from "three";
import type { SmokePalette } from "#lib/shared/effects/domain/smoke-palettes.js";

const COLUMNS = 8;
const CELL_SIZE = 128;
export const SMOKE_ATLAS_FRAME_COUNT = 8;
let canvas: HTMLCanvasElement | null = null;
let context: CanvasRenderingContext2D | null = null;
let atlas: CanvasTexture | null = null;
const slots = new Map<string, number>();

export interface SmokeAtlasFrame {
  texture: CanvasTexture;
  x: number;
  width: number;
  frameHeight: number;
}

export function getSmokeTextureAtlas(): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  ensureAtlas();
  return atlas;
}

/** One scene-independent atlas, including a bounded slot for a custom palette. */
export function getSmokeAtlasFrame(
  palette: SmokePalette
): SmokeAtlasFrame | null {
  if (typeof document === "undefined") return null;
  ensureAtlas();
  if (!canvas || !context || !atlas) return null;

  const key = `${palette.core}:${palette.edge}`;
  let slot = slots.get(key);
  if (slot === undefined) {
    slot = Math.min(slots.size, COLUMNS - 1);
    slots.set(key, slot);
    drawPalette(context, slot * CELL_SIZE, palette.core, palette.edge, slot);
    atlas.needsUpdate = true;
  }
  return {
    texture: atlas,
    x: slot / COLUMNS,
    width: 1 / COLUMNS,
    frameHeight: 1 / SMOKE_ATLAS_FRAME_COUNT,
  };
}

function ensureAtlas(): void {
  if (atlas) return;
  canvas = document.createElement("canvas");
  canvas.width = COLUMNS * CELL_SIZE;
  canvas.height = SMOKE_ATLAS_FRAME_COUNT * CELL_SIZE;
  context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  atlas = new CanvasTexture(canvas);
  atlas.colorSpace = SRGBColorSpace;
  atlas.needsUpdate = true;
}

function drawPalette(
  target: CanvasRenderingContext2D,
  x: number,
  core: string,
  edge: string,
  seed: number
): void {
  for (let frame = 0; frame < SMOKE_ATLAS_FRAME_COUNT; frame++) {
    drawTurbulentFrame(target, x, frame * CELL_SIZE, core, edge, seed, frame);
  }
}

function drawTurbulentFrame(
  target: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  core: string,
  edge: string,
  seed: number,
  frame: number
): void {
  const image = target.createImageData(CELL_SIZE, CELL_SIZE);
  const coreRgb = parseHex(core);
  const edgeRgb = parseHex(edge);
  const phase = (frame / SMOKE_ATLAS_FRAME_COUNT) * Math.PI * 2;
  for (let y = 0; y < CELL_SIZE; y++) {
    for (let x = 0; x < CELL_SIZE; x++) {
      const nx = ((x + 0.5) / CELL_SIZE) * 2 - 1;
      const ny = ((y + 0.5) / CELL_SIZE) * 2 - 1;
      const warpX = nx + Math.sin(ny * 5.3 + phase + seed * 1.7) * 0.09;
      const warpY = ny + Math.sin(nx * 4.7 - phase * 0.7 + seed * 2.3) * 0.08;
      const noise = fbm(
        warpX * 2.05 + phase * 0.18,
        warpY * 2.05 - phase * 0.12,
        seed * 13.7
      );
      const fineNoise = fbm(
        warpX * 4.2 - phase * 0.2,
        warpY * 4.2 + phase * 0.16,
        seed * 29.1 + 7.4
      );
      const radius = Math.hypot(warpX * 0.9, warpY * 1.04);
      const tornRadius = radius + (0.52 - noise) * 0.46;
      const silhouette = 1 - smoothstep(0.48, 1.02, tornRadius);
      const billow = smoothstep(0.18, 0.82, noise * 0.72 + fineNoise * 0.28);
      const erosion = smoothstep(0.13, 0.44, fineNoise + silhouette * 0.2);
      const alpha = Math.max(0, Math.min(1, silhouette * billow * erosion));
      const coreMix = smoothstep(0.18, 0.82, alpha * 0.72 + noise * 0.38);
      const pixel = (x + y * CELL_SIZE) * 4;
      image.data[pixel] = Math.round(
        edgeRgb[0] + (coreRgb[0] - edgeRgb[0]) * coreMix
      );
      image.data[pixel + 1] = Math.round(
        edgeRgb[1] + (coreRgb[1] - edgeRgb[1]) * coreMix
      );
      image.data[pixel + 2] = Math.round(
        edgeRgb[2] + (coreRgb[2] - edgeRgb[2]) * coreMix
      );
      image.data[pixel + 3] = Math.round(alpha ** 1.15 * 220);
    }
  }
  target.putImageData(image, offsetX, offsetY);
}

function fbm(x: number, y: number, seed: number): number {
  let value = 0;
  let amplitude = 0.56;
  let frequency = 1;
  let normalization = 0;
  for (let octave = 0; octave < 4; octave++) {
    value +=
      valueNoise(x * frequency, y * frequency, seed + octave * 19.19) *
      amplitude;
    normalization += amplitude;
    frequency *= 2.03;
    amplitude *= 0.48;
  }
  return value / normalization;
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smoothstep(0, 1, x - x0);
  const fy = smoothstep(0, 1, y - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  const low = a + (b - a) * fx;
  const high = c + (d - c) * fx;
  return low + (high - low) * fy;
}

function hash2(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function parseHex(hex: string): readonly [number, number, number] {
  const normalized = hex.replace(/^#/, "").padEnd(6, "0").slice(0, 6);
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}
