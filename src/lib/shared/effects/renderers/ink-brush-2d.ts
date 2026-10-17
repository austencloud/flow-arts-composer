/**
 * Brush helpers kept from the stamp-based Ink renderer. The effects panel's
 * Ink thumbnail still paints its portrait with them; the live renderer
 * draws liquid from the shared ink sim instead (ink-2d-renderer).
 */
import type { Ink2DParams } from "../translators/canvas2d-types";

const STAMP_SIZE = 64;
const STAMP_HALF = STAMP_SIZE / 2;
const STAMP_R = STAMP_SIZE * 0.42;

// --- Hash noise for fiber texture (generated at cache time, not per frame) ---

function hashNoise(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1274126177) | 0;
  h = ((h ^ (h >> 13)) * 1103515245) | 0;
  return (h & 0x7fffffff) / 0x7fffffff;
}

function sampleNoise(
  x: number,
  y: number,
  gridScale: number,
  seed: number
): number {
  const gx = x / gridScale;
  const gy = y / gridScale;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const n00 = hashNoise(ix, iy, seed);
  const n10 = hashNoise(ix + 1, iy, seed);
  const n01 = hashNoise(ix, iy + 1, seed);
  const n11 = hashNoise(ix + 1, iy + 1, seed);
  const nx0 = n00 + (n10 - n00) * fx;
  const nx1 = n01 + (n11 - n01) * fx;
  return nx0 + (nx1 - nx0) * fy;
}

function twoOctaveNoise(px: number, py: number, seed: number): number {
  return (
    sampleNoise(px, py, 8, seed) * 0.6 + sampleNoise(px, py, 4, seed + 7) * 0.4
  );
}

function parseHex(hex: string): [number, number, number] {
  const s = hex.trim().replace(/^#/, "");
  const norm =
    s.length === 3
      ? s
          .split("")
          .map((c) => c + c)
          .join("")
      : s.length >= 6
        ? s.slice(0, 6)
        : "0a0a0a";
  return [
    parseInt(norm.slice(0, 2), 16),
    parseInt(norm.slice(2, 4), 16),
    parseInt(norm.slice(4, 6), 16),
  ];
}

// --- BrushStampCache ---

export class BrushStampCache {
  private canvas: OffscreenCanvas | HTMLCanvasElement | null = null;
  private signature = "";
  private readonly noiseSeed = 0x51f15e;

  get(params: Ink2DParams): OffscreenCanvas | HTMLCanvasElement {
    const palette = params.resolvedPalette;
    const sig = `${palette.pigment}|${palette.edge}|${params.intensity.toFixed(2)}|${palette.watercolor ? "w" : ""}|${palette.emissive ? "e" : ""}`;
    if (sig === this.signature && this.canvas) return this.canvas;

    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(STAMP_SIZE, STAMP_SIZE)
        : typeof document !== "undefined"
          ? document.createElement("canvas")
          : ({
              width: STAMP_SIZE,
              height: STAMP_SIZE,
              getContext: () => null,
            } as unknown as HTMLCanvasElement);
    if ("width" in canvas) {
      canvas.width = STAMP_SIZE;
      canvas.height = STAMP_SIZE;
    }
    const ctx = canvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D;
    if (!ctx) {
      this.canvas = canvas;
      this.signature = sig;
      return canvas;
    }

    const cx = STAMP_HALF;
    const cy = STAMP_HALF;
    const R = STAMP_R;
    const [pr, pg, pb] = parseHex(palette.pigment);
    const [er, eg, eb] = parseHex(palette.edge);

    ctx.clearRect(0, 0, STAMP_SIZE, STAMP_SIZE);

    // Layer 1: Core pigment. Watercolor granulation should tint an existing
    // wash, not stamp an opaque blue coin into it.
    const coreAlpha = palette.watercolor ? 0.46 : 0.95;
    const shoulderAlpha = palette.watercolor ? 0.24 : 0.7;
    const grad1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad1.addColorStop(0, `rgba(${pr},${pg},${pb},${coreAlpha})`);
    grad1.addColorStop(0.55, `rgba(${pr},${pg},${pb},${shoulderAlpha})`);
    grad1.addColorStop(1, `rgba(${pr},${pg},${pb},0)`);
    ctx.fillStyle = grad1;
    ctx.fillRect(0, 0, STAMP_SIZE, STAMP_SIZE);

    // Layer 2: Wet edge ring. Watercolor needs this most: pigment migrates
    // toward the edge of a wet mark, which is what makes a wash read as paint
    // instead of a soft blue light.
    const ringAlpha = palette.emissive ? 0.58 : palette.watercolor ? 0.16 : 0.4;
    const grad2 = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R);
    grad2.addColorStop(0, `rgba(${pr},${pg},${pb},0)`);
    grad2.addColorStop(0.42, `rgba(${pr},${pg},${pb},${ringAlpha * 0.45})`);
    grad2.addColorStop(0.72, `rgba(${pr},${pg},${pb},${ringAlpha})`);
    grad2.addColorStop(1, `rgba(${pr},${pg},${pb},0)`);
    ctx.fillStyle = grad2;
    ctx.fillRect(0, 0, STAMP_SIZE, STAMP_SIZE);

    // Layer 3: Edge bleed
    const grad3 = ctx.createRadialGradient(cx, cy, R * 0.62, cx, cy, R * 1.12);
    grad3.addColorStop(0, `rgba(${er},${eg},${eb},0)`);
    grad3.addColorStop(
      0.58,
      `rgba(${er},${eg},${eb},${palette.watercolor ? 0.1 : 0.18})`
    );
    grad3.addColorStop(
      0.82,
      `rgba(${er},${eg},${eb},${palette.watercolor ? 0.04 : 0.08})`
    );
    grad3.addColorStop(1, `rgba(${er},${eg},${eb},0)`);
    ctx.fillStyle = grad3;
    ctx.fillRect(0, 0, STAMP_SIZE, STAMP_SIZE);

    // Layer 4: Fiber noise
    const noiseStrength = palette.watercolor
      ? 0.62
      : palette.emissive
        ? 0.2
        : 1.0;
    if (noiseStrength > 0.05) {
      const imgData = ctx.getImageData(0, 0, STAMP_SIZE, STAMP_SIZE);
      const data = imgData.data;
      for (let py = 0; py < STAMP_SIZE; py++) {
        for (let px = 0; px < STAMP_SIZE; px++) {
          const idx = (py * STAMP_SIZE + px) * 4;
          if (data[idx + 3]! === 0) continue;
          const n = twoOctaveNoise(px, py, this.noiseSeed);
          const factor = 0.5 + 0.5 * n;
          const blend = 1.0 - noiseStrength + noiseStrength * factor;
          data[idx + 3] = Math.round(data[idx + 3]! * blend);
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }

    this.canvas = canvas;
    this.signature = sig;
    return canvas;
  }

  dispose(): void {
    this.canvas = null;
    this.signature = "";
  }
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Translate speed into loaded-brush pressure. This is deliberately exported:
 * if pressure math regresses, the renderer still produces plausible output,
 * but the expressive thick-to-thin behavior silently disappears.
 */
export function resolveInkStrokeWidth(
  params: Ink2DParams,
  spawnSpeedPx: number,
  scale: number = 1
): number {
  const referenceSpeed = Math.max(
    1,
    params.motionReferenceSpeed * 60 * scale * 2
  );
  const speedT = Math.min(1, Math.max(0, spawnSpeedPx / referenceSpeed));
  const brushLift = Math.sqrt(speedT) * 0.72;
  const pressureWidth =
    params.strokeWidthMax +
    (params.strokeWidthMin - params.strokeWidthMax) * brushLift;
  return pressureWidth * (0.5 + params.intensity * 0.8) * scale;
}

/**
 * A brush pressed through a turn spreads before it lifts away. Without this
 * extra load, loops drawn at a steady playback speed become uniform tubes even
 * though the choreography changes direction sharply.
 */
export function resolveInkTurnLoad(
  previous: { x: number; y: number },
  point: { x: number; y: number },
  next: { x: number; y: number }
): number {
  const incomingX = point.x - previous.x;
  const incomingY = point.y - previous.y;
  const outgoingX = next.x - point.x;
  const outgoingY = next.y - point.y;
  const incomingLength = Math.hypot(incomingX, incomingY);
  const outgoingLength = Math.hypot(outgoingX, outgoingY);
  if (incomingLength < 0.001 || outgoingLength < 0.001) return 0;

  const dot = Math.min(
    1,
    Math.max(
      -1,
      (incomingX * outgoingX + incomingY * outgoingY) /
        (incomingLength * outgoingLength)
    )
  );
  const angle = Math.acos(dot);
  const reversalDamping = 1 - smoothstep(Math.PI * 0.72, Math.PI, angle);
  return smoothstep(0.06, 0.72, angle) * reversalDamping;
}

const NIB_HAIRLINE = 0.16;
// Mean of |sin| over a turn is 2/pi. Dividing by the mean keeps the ink's
// average weight where speed pressure put it; the nib only redistributes it.
const NIB_MEAN = NIB_HAIRLINE + (1 - NIB_HAIRLINE) * (2 / Math.PI);
const NIB_CENTER_REACH_PX = 28;

/**
 * Broad-nib width factor. Prop tips orbit at a nearly steady speed, so speed
 * pressure alone left dense ink a uniform tube. A flat nib swells and thins
 * with direction instead: wide while the tip sweeps around the stage, a
 * hairline while it travels toward or away from the center.
 *
 * The nib is held relative to the stage center rather than the screen.
 * Tunnel copies are rotations and mirrors about that center, and the angle
 * between motion and the radial line survives both, so every copy keeps the
 * same thick-and-thin rhythm as the prop it reflects. Near the center the
 * radial line is undefined, so the factor eases back to the average weight.
 */
export function resolveInkNibWidth(
  point: { x: number; y: number },
  tangentX: number,
  tangentY: number,
  center: { x: number; y: number },
  scale: number = 1
): number {
  const radialX = point.x - center.x;
  const radialY = point.y - center.y;
  const radius = Math.hypot(radialX, radialY);
  const tangentLength = Math.hypot(tangentX, tangentY);
  if (radius < 0.001 || tangentLength < 0.001) return 1;
  const sweep =
    Math.abs(radialX * tangentY - radialY * tangentX) /
    (radius * tangentLength);
  const nib = (NIB_HAIRLINE + (1 - NIB_HAIRLINE) * sweep) / NIB_MEAN;
  const reach = smoothstep(0, NIB_CENTER_REACH_PX * scale, radius);
  return 1 + (nib - 1) * reach;
}
