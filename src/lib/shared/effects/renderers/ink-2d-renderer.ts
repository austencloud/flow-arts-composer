import type { Ink2DParams } from "../translators/canvas2d-types";
import type { EmitterTip } from "./emitter-tip";
import { emitterId } from "./emitter-tip";

const STAMP_SIZE = 64;
const STAMP_HALF = STAMP_SIZE / 2;
const STAMP_R = STAMP_SIZE * 0.42;

// --- Hash noise for fiber texture (generated at cache time, not per frame) ---

function hashNoise(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1274126177) | 0;
  h = ((h ^ (h >> 13)) * 1103515245) | 0;
  return (h & 0x7fffffff) / 0x7fffffff;
}

function stableStringSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x1_0000_0000;
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

function mixWithWhite(hex: string, amount: number): string {
  const [r, g, b] = parseHex(hex);
  const mix = (channel: number) =>
    Math.round(channel + (255 - channel) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}

function mixHexColors(from: string, to: string, amount: number): string {
  const source = parseHex(from);
  const target = parseHex(to);
  const mix = (index: number) =>
    Math.round(source[index]! + (target[index]! - source[index]!) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${mix(0)}${mix(1)}${mix(2)}`;
}

function isDarkColor(hex: string): boolean {
  const [r, g, b] = parseHex(hex);
  return (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255 < 0.22;
}

// --- BrushStampCache ---

class BrushStampCache {
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

// --- Animated stroke state ---

interface InkPoint {
  x: number;
  y: number;
  vy: number;
  age: number;
  spawnSpeedPx: number;
  tangentAngle: number;
  sequence: number;
  materialSeed: number;
  jitterSeed: number;
}

interface TipState {
  points: InkPoint[];
  lastPos: { x: number; y: number } | null;
  smoothedVx: number;
  smoothedVy: number;
  previousVx: number;
  previousVy: number;
  emitAccumulator: number;
  splatterCooldown: number;
  splatterSequence: number;
  pointSequence: number;
  materialSeed: number;
}

interface DetachedStroke {
  id: string;
  points: InkPoint[];
}

interface InkDroplet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  maxAge: number;
  radius: number;
  jitterSeed: number;
  kind: "breakup" | "splatter";
}

interface RibbonPoint {
  x: number;
  y: number;
  nx: number;
  ny: number;
  width: number;
  fade: number;
  turnLoad: number;
  sequence: number;
  materialSeed: number;
  seed: number;
}

interface RibbonPassOptions {
  offsetFactor?: number;
  noiseChannel?: number;
  breakThreshold?: number;
  chunkSize?: number;
}

export interface Ink2DDiagnostics {
  tipCount: number;
  pointCount: number;
  maxPathLength: number;
  dropletCount: number;
  detachedStrokeCount: number;
  tips: Array<{
    id: string;
    pointCount: number;
    pathLength: number;
    oldestY: number | null;
    newestY: number | null;
  }>;
}

export interface InkFrameBoundary {
  loopDetected: boolean;
  isSeamlesslyLoopable: boolean;
}

const MOTION_VELOCITY_THRESHOLD_PX = 30;
const FADE_FRACTION = 0.6;
const DROPLET_DRIFT_PX = 30;
const MAX_ROTATION_JITTER = 0.12;
const MAX_SCALE_JITTER = 0.2;

function jitterHash(seed: number, channel: number): number {
  let h = ((seed * 1000000) | 0) + channel * 374761393;
  h = ((h ^ (h >> 13)) * 1103515245) | 0;
  return (h & 0x7fffffff) / 0x7fffffff;
}

function pointFade(age: number, lifetime: number): number {
  const ageT = lifetime > 0 ? age / lifetime : 1;
  return ageT > FADE_FRACTION
    ? Math.max(0, (1 - ageT) / (1 - FADE_FRACTION))
    : 1;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function pathLength(points: ArrayLike<{ x: number; y: number }>): number {
  let length = 0;
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1]!;
    const point = points[index]!;
    length += Math.hypot(point.x - previous.x, point.y - previous.y);
  }
  return length;
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

export class Ink2DRenderer {
  private tips = new Map<string, TipState>();
  private detachedStrokes: DetachedStroke[] = [];
  private visibleStrokeScratch: InkPoint[][] = [];
  private stampCache = new BrushStampCache();
  private droplets: InkDroplet[] = [];
  private activeEmitterCount = 0;

  render(
    ctx: CanvasRenderingContext2D,
    params: Ink2DParams,
    emitters: EmitterTip[],
    dt: number,
    scale: number = 1,
    boundary?: InkFrameBoundary
  ): void {
    const safeDt = Math.min(Math.max(dt, 0), 1 / 15);
    const safeScale = Math.max(scale, 0.01);

    // A freeform wrap teleports the props from their final pose back to the
    // start pose. Preserve the painted mark as a detached, fading stroke, but
    // break the live brush connection so the return cannot draw a diagonal
    // across the stage. A true LOOP ends at its start pose and keeps the live
    // stroke connected across the boundary.
    if (boundary?.loopDetected && !boundary.isSeamlesslyLoopable) {
      this.detachAllActiveStrokes();
    }

    // Every reflected tunnel prop is its own emitter. Keeping independent
    // histories prevents one mirrored path from snapping into another.
    const seen = new Set<string>();
    for (const emitter of emitters) {
      const id = emitterId(emitter.propIndex, emitter.tipIndex);
      seen.add(id);
      if (!this.isEndEnabled(emitter.end, params)) {
        const state = this.tips.get(id);
        if (state) state.lastPos = null;
        continue;
      }
      this.updateTip(
        id,
        { x: emitter.x, y: emitter.y },
        params,
        safeDt,
        safeScale
      );
    }

    for (const [id, state] of this.tips) {
      if (!seen.has(id)) state.lastPos = null;
    }
    this.activeEmitterCount = seen.size;

    this.applyGravityAndCull(safeDt, params, safeScale);
    this.detectBreakup(params, safeScale);
    this.advanceDroplets(safeDt, params, ctx.canvas.height, safeScale);
    const strokes = this.collectVisibleStrokes();
    this.drawInk(ctx, params, safeScale, strokes);
    this.drawDroplets(ctx, params);
  }

  private detachAllActiveStrokes(): void {
    for (const [id, state] of this.tips) {
      this.detachActiveStroke(id, state);
    }
  }

  private detachActiveStroke(id: string, state: TipState): void {
    if (state.points.length > 0) {
      this.detachedStrokes.push({ id, points: state.points });
      state.points = [];
    }
    state.lastPos = null;
    state.smoothedVx = 0;
    state.smoothedVy = 0;
    state.previousVx = 0;
    state.previousVy = 0;
    state.emitAccumulator = 0;
    state.splatterCooldown = 0;
  }

  private collectVisibleStrokes(): InkPoint[][] {
    const strokes = this.visibleStrokeScratch;
    strokes.length = 0;
    for (const stroke of this.detachedStrokes) strokes.push(stroke.points);
    for (const state of this.tips.values()) {
      if (state.points.length > 0) strokes.push(state.points);
    }
    return strokes;
  }

  private updateTip(
    id: string,
    pos: { x: number; y: number },
    params: Ink2DParams,
    dt: number,
    scale: number
  ): void {
    let state = this.tips.get(id);
    if (!state) {
      state = {
        points: [],
        lastPos: { x: pos.x, y: pos.y },
        smoothedVx: 0,
        smoothedVy: 0,
        previousVx: 0,
        previousVy: 0,
        emitAccumulator: 0,
        splatterCooldown: 0,
        splatterSequence: 0,
        pointSequence: 0,
        materialSeed: stableStringSeed(id),
      };
      this.tips.set(id, state);
      return;
    }

    let last = state.lastPos;
    if (last && Math.hypot(pos.x - last.x, pos.y - last.y) > 300 * scale) {
      // Defensive fallback for sequence swaps, HMR, and other unsignalled
      // teleports. Keep the existing material alive instead of erasing it.
      this.detachActiveStroke(id, state);
      last = null;
    }
    let vx = 0;
    let vy = 0;
    const movedDistance = last ? Math.hypot(pos.x - last.x, pos.y - last.y) : 0;
    if (last && dt > 0) {
      vx = (pos.x - last.x) / dt;
      vy = (pos.y - last.y) / dt;
    }

    const smoothing = 1 - Math.pow(0.6, dt * 60);
    state.previousVx = state.smoothedVx;
    state.previousVy = state.smoothedVy;
    state.smoothedVx += (vx - state.smoothedVx) * smoothing;
    state.smoothedVy += (vy - state.smoothedVy) * smoothing;
    const speedPx = Math.hypot(state.smoothedVx, state.smoothedVy);

    this.maybeSpawnSplatter(state, pos, params, dt, speedPx, scale);

    const pxPerWorld = 60 * scale;
    const refSpeed = params.motionReferenceSpeed * pxPerWorld;
    const speedScalar = refSpeed > 0 ? Math.min(1, speedPx / refSpeed) : 0;
    const motionRate =
      speedPx >= MOTION_VELOCITY_THRESHOLD_PX * scale
        ? params.motionEmission * speedScalar * params.motionSpawnRate
        : movedDistance >= 0.08 * scale
          ? params.motionEmission * params.motionSpawnRate * 0.18
          : 0;
    state.emitAccumulator +=
      (motionRate + params.effectiveAmbient * params.ambientSpawnRate) * dt;

    const tangent = Math.atan2(state.smoothedVy, state.smoothedVx);
    const brushWidth = resolveInkStrokeWidth(params, speedPx, scale);
    const minSpacing = Math.max(1.25 * scale, brushWidth * 0.15);

    while (state.emitAccumulator >= 1) {
      state.emitAccumulator -= 1;
      if (this.canEmit(state, pos.x, pos.y, minSpacing)) {
        if (params.resolvedPalette.id === "sumi") {
          this.pushSumiStrokeSegment(
            state,
            pos.x,
            pos.y,
            speedPx,
            tangent,
            brushWidth,
            scale,
            params
          );
        } else {
          this.pushPoint(state, pos.x, pos.y, speedPx, tangent, params);
        }
      }
    }

    this.trimPathToLength(state, params.strokeLengthPx * scale);

    state.lastPos = { x: pos.x, y: pos.y };
  }

  private maybeSpawnSplatter(
    state: TipState,
    pos: { x: number; y: number },
    params: Ink2DParams,
    dt: number,
    speedPx: number,
    scale: number
  ): void {
    state.splatterCooldown = Math.max(0, state.splatterCooldown - dt);
    if (
      params.splatterIntensity <= 0.01 ||
      state.splatterCooldown > 0 ||
      dt <= 0
    )
      return;

    const deltaVx = state.smoothedVx - state.previousVx;
    const deltaVy = state.smoothedVy - state.previousVy;
    const acceleration = Math.hypot(deltaVx, deltaVy) / dt;
    const referenceSpeed = Math.max(
      60 * scale,
      params.motionReferenceSpeed * 60 * scale
    );
    const threshold =
      referenceSpeed * 18 * (1.35 - params.splatterIntensity * 0.95);
    if (
      speedPx < MOTION_VELOCITY_THRESHOLD_PX * scale ||
      acceleration < threshold
    )
      return;

    const energy = Math.min(
      1,
      (acceleration - threshold) / Math.max(threshold * 1.5, 1)
    );
    const count = Math.max(
      1,
      Math.round((2 + params.splatterIntensity * 8) * (0.35 + energy * 0.65))
    );
    const flingAngle = Math.atan2(-deltaVy, -deltaVx);
    const cone = 0.45 + params.splatterIntensity * 1.7;
    const burstSpeed = (42 + params.splatterIntensity * 150) * scale;
    const sequenceSeed =
      state.materialSeed + ++state.splatterSequence * 0.61803398875;

    for (
      let i = 0;
      i < count && this.droplets.length < params.dropletPoolSize;
      i++
    ) {
      const seed = sequenceSeed + i * 0.17320508075;
      const angle = flingAngle + (jitterHash(seed, 0) - 0.5) * cone;
      const speed = burstSpeed * (0.55 + jitterHash(seed, 1) * 0.8);
      this.droplets.push({
        x: pos.x,
        y: pos.y,
        vx: state.smoothedVx * 0.12 + Math.cos(angle) * speed,
        vy: state.smoothedVy * 0.12 + Math.sin(angle) * speed,
        age: 0,
        maxAge:
          (0.35 + jitterHash(seed, 2) * 0.55) *
          (0.75 + params.splatterIntensity * 0.25) *
          (params.resolvedPalette.watercolor ? 0.7 : 1),
        radius:
          (1 + jitterHash(seed, 3) * 2.6) *
          scale *
          (params.resolvedPalette.watercolor ? 0.62 : 1),
        jitterSeed: seed,
        kind: "splatter",
      });
    }

    state.splatterCooldown = 0.13 + (1 - params.splatterIntensity) * 0.16;
  }

  private canEmit(
    state: TipState,
    x: number,
    y: number,
    minSpacing: number
  ): boolean {
    if (state.points.length === 0) return true;
    const last = state.points[state.points.length - 1]!;
    return Math.hypot(x - last.x, y - last.y) >= minSpacing;
  }

  private pushPoint(
    state: TipState,
    x: number,
    y: number,
    speedPx: number,
    tangentAngle: number,
    params: Ink2DParams
  ): void {
    const sequence = ++state.pointSequence;
    state.points.push({
      x,
      y,
      vy: 0,
      age: 0,
      spawnSpeedPx: speedPx,
      tangentAngle,
      sequence,
      materialSeed: state.materialSeed,
      jitterSeed: (state.materialSeed + sequence * 0.61803398875) % 1,
    });
    while (state.points.length > params.maxPointsPerTip) state.points.shift();
  }

  private pushSumiStrokeSegment(
    state: TipState,
    x: number,
    y: number,
    speedPx: number,
    tangentAngle: number,
    brushWidth: number,
    scale: number,
    params: Ink2DParams
  ): void {
    const last = state.points[state.points.length - 1];
    if (!last) {
      this.pushPoint(state, x, y, speedPx, tangentAngle, params);
      return;
    }

    const dx = x - last.x;
    const dy = y - last.y;
    const distance = Math.hypot(dx, dy);
    const maxSpacing = Math.max(
      3.5 * scale,
      Math.min(8 * scale, brushWidth * 0.38)
    );
    const steps = Math.min(
      params.maxPointsPerTip,
      Math.max(1, Math.ceil(distance / maxSpacing))
    );
    const angleDelta = Math.atan2(
      Math.sin(tangentAngle - last.tangentAngle),
      Math.cos(tangentAngle - last.tangentAngle)
    );

    // Playback and low-rate previews can move a prop farther than one brush
    // width between frames. A loaded brush still deposits a continuous mark,
    // so fill that swept interval before building the material silhouette.
    for (let step = 1; step <= steps; step++) {
      const progress = step / steps;
      this.pushPoint(
        state,
        last.x + dx * progress,
        last.y + dy * progress,
        last.spawnSpeedPx + (speedPx - last.spawnSpeedPx) * progress,
        last.tangentAngle + angleDelta * progress,
        params
      );
    }
  }

  private trimPathToLength(state: TipState, maxLength: number): void {
    if (state.points.length < 2 || maxLength <= 0) return;

    let retainedLength = 0;
    for (let index = state.points.length - 1; index > 0; index--) {
      const newer = state.points[index]!;
      const older = state.points[index - 1]!;
      const segmentLength = Math.hypot(newer.x - older.x, newer.y - older.y);
      if (retainedLength + segmentLength <= maxLength) {
        retainedLength += segmentLength;
        continue;
      }

      const remaining = Math.max(0, maxLength - retainedLength);
      const t = segmentLength > 0 ? remaining / segmentLength : 0;
      const boundary: InkPoint = {
        x: newer.x + (older.x - newer.x) * t,
        y: newer.y + (older.y - newer.y) * t,
        vy: newer.vy + (older.vy - newer.vy) * t,
        age: newer.age + (older.age - newer.age) * t,
        spawnSpeedPx:
          newer.spawnSpeedPx + (older.spawnSpeedPx - newer.spawnSpeedPx) * t,
        tangentAngle: newer.tangentAngle,
        sequence: older.sequence,
        materialSeed: older.materialSeed,
        jitterSeed: older.jitterSeed,
      };
      state.points = [boundary, ...state.points.slice(index)];
      return;
    }
  }

  private applyGravityAndCull(
    dt: number,
    params: Ink2DParams,
    scale: number
  ): void {
    const gravity = params.strokeGravityPx * scale;
    for (const state of this.tips.values()) {
      state.points = this.ageStroke(
        state.points,
        dt,
        gravity,
        params.lifetimeSeconds
      );
      this.trimPathToLength(state, params.strokeLengthPx * scale);
    }

    for (const stroke of this.detachedStrokes) {
      stroke.points = this.ageStroke(
        stroke.points,
        dt,
        gravity,
        params.lifetimeSeconds
      );
    }
    this.detachedStrokes = this.detachedStrokes.filter(
      (stroke) => stroke.points.length > 0
    );
  }

  private ageStroke(
    points: InkPoint[],
    dt: number,
    gravity: number,
    lifetimeSeconds: number
  ): InkPoint[] {
    const survivors: InkPoint[] = [];
    for (const point of points) {
      point.age += dt;
      point.vy += gravity * dt;
      point.y += point.vy * dt;
      if (point.age < lifetimeSeconds) survivors.push(point);
    }
    return survivors;
  }

  private detectBreakup(params: Ink2DParams, scale: number): void {
    // Sumi, custom pigment, Blood, and Watercolor are deposited by the brush
    // and remain attached to the gesture. Their acceleration-triggered chips
    // are still emitted separately; sparse samples must not convert the whole
    // painted mark into detached droplets.
    if (
      params.resolvedPalette.id === "sumi" ||
      params.resolvedPalette.id === "custom" ||
      params.resolvedPalette.id === "blood" ||
      params.resolvedPalette.watercolor
    )
      return;

    const threshold =
      (1 - params.viscosity) * params.breakStretchMax * scale;
    for (const state of this.tips.values()) {
      state.points = this.applyStrokeBreakup(
        state.points,
        params,
        scale,
        threshold
      );
    }
    for (const stroke of this.detachedStrokes) {
      stroke.points = this.applyStrokeBreakup(
        stroke.points,
        params,
        scale,
        threshold
      );
    }
    this.detachedStrokes = this.detachedStrokes.filter(
      (stroke) => stroke.points.length > 0
    );
  }

  private applyStrokeBreakup(
    points: InkPoint[],
    params: Ink2DParams,
    scale: number,
    threshold: number
  ): InkPoint[] {
    if (points.length < 2) return points;

    const dropletStride = params.resolvedPalette.watercolor
      ? 5
      : 2 + Math.round(params.splatterIntensity * 2);
    if (threshold <= 0) {
      const keep: InkPoint[] = [];
      for (let index = 0; index < points.length; index++) {
        const point = points[index]!;
        if (point.age > 0.05) {
          if (index % dropletStride === 0) {
            this.spawnDropletFromPoint(point, params, scale);
          }
        } else {
          keep.push(point);
        }
      }
      return keep;
    }

    let breakIndex = -1;
    for (let index = 0; index < points.length - 1; index++) {
      const current = points[index]!;
      const next = points[index + 1]!;
      if (Math.hypot(next.x - current.x, next.y - current.y) > threshold) {
        breakIndex = index;
        break;
      }
    }
    if (breakIndex < 0) return points;

    const detached = points.splice(0, breakIndex + 1);
    for (let index = 0; index < detached.length; index += dropletStride) {
      this.spawnDropletFromPoint(detached[index]!, params, scale);
    }
    return points;
  }

  private spawnDropletFromPoint(
    point: InkPoint,
    params: Ink2DParams,
    scale: number
  ): void {
    if (this.droplets.length >= params.dropletPoolSize) return;
    this.droplets.push({
      x: point.x,
      y: point.y,
      vx:
        (jitterHash(point.jitterSeed, 8) - 0.5) * DROPLET_DRIFT_PX * 2 * scale,
      vy: point.vy,
      age: 0,
      maxAge:
        params.dropletMaxAge *
        (0.7 + jitterHash(point.jitterSeed, 9) * 0.6) *
        (params.resolvedPalette.watercolor
          ? 0.42
          : 0.48 + (1 - params.splatterIntensity) * 0.18),
      radius:
        (params.resolvedPalette.watercolor
          ? 1.1 + jitterHash(point.jitterSeed, 10) * 2.2
          : 2 + jitterHash(point.jitterSeed, 10) * 4) * scale,
      jitterSeed: point.jitterSeed,
      kind: "breakup",
    });
  }

  private advanceDroplets(
    dt: number,
    params: Ink2DParams,
    canvasHeight: number,
    scale: number
  ): void {
    const gravity = params.gravityPx * scale;
    const survivors: InkDroplet[] = [];
    for (const droplet of this.droplets) {
      droplet.vy += gravity * dt;
      droplet.x += droplet.vx * dt;
      droplet.y += droplet.vy * dt;
      droplet.age += dt;
      if (
        droplet.age < droplet.maxAge &&
        droplet.y < canvasHeight + 50 * scale
      ) {
        survivors.push(droplet);
      }
    }
    this.droplets = survivors;
  }

  private drawInk(
    ctx: CanvasRenderingContext2D,
    params: Ink2DParams,
    scale: number,
    strokes: readonly InkPoint[][]
  ): void {
    const palette = params.resolvedPalette;
    const peakAlpha = Math.min(
      params.opacityMax * (0.48 + params.intensity * 0.52),
      1
    );
    const needsDarkStageContrast =
      !palette.watercolor && !palette.emissive && isDarkColor(palette.edge);
    const sumiDensity =
      palette.id === "sumi"
        ? Math.max(0.62, Math.sqrt(2 / Math.max(2, this.activeEmitterCount)))
        : 1;
    const materialScale = scale * sumiDensity;
    const materialPeakAlpha = peakAlpha * (0.45 + sumiDensity * 0.55);

    for (const points of strokes) {
      if (points.length === 0) continue;
      const visiblePoints =
        palette.id === "sumi" && sumiDensity < 1
          ? this.getStrokeTail(
              points,
              params.strokeLengthPx * sumiDensity * sumiDensity
            )
          : points;
      const ribbon = this.buildRibbon(visiblePoints, params, materialScale);

      if (palette.watercolor) {
        // A wash is one thin pigment field with a faint wet margin. Drawing
        // four complete nested ribbons created the bright concentric bands
        // that looked convincing in an empty demo and like a hose around real
        // choreography.
        this.drawSegmentedRibbonPass(
          ctx,
          ribbon,
          palette.edge,
          1.38,
          peakAlpha * 0.18,
          "source-over",
          18
        );
        this.drawSegmentedRibbonPass(
          ctx,
          ribbon,
          palette.pigment,
          0.94,
          peakAlpha * 0.74,
          "source-over",
          24
        );
        continue;
      }

      if (palette.id === "sumi") {
        this.drawSumiRibbon(
          ctx,
          ribbon,
          palette.pigment,
          palette.edge,
          materialPeakAlpha
        );
        continue;
      }

      if (palette.emissive) {
        this.drawNeonInkRibbon(
          ctx,
          ribbon,
          palette.pigment,
          palette.edge,
          peakAlpha
        );
        continue;
      }

      this.drawDenseInkRibbon(
        ctx,
        ribbon,
        palette.pigment,
        palette.edge,
        peakAlpha,
        needsDarkStageContrast
      );
    }

    this.drawGranulation(ctx, params, materialScale, strokes, sumiDensity);
    this.drawBristleBreakup(ctx, params, materialScale, strokes);
  }

  private getStrokeTail(points: InkPoint[], maxLength: number): InkPoint[] {
    let retainedLength = 0;
    let startIndex = points.length - 1;
    for (let index = points.length - 1; index > 0; index--) {
      const newer = points[index]!;
      const older = points[index - 1]!;
      retainedLength += Math.hypot(newer.x - older.x, newer.y - older.y);
      if (retainedLength > maxLength) break;
      startIndex = index - 1;
    }
    return startIndex === 0 ? points : points.slice(startIndex);
  }

  private drawSumiRibbon(
    ctx: CanvasRenderingContext2D,
    ribbon: RibbonPoint[],
    pigment: string,
    edge: string,
    peakAlpha: number
  ): void {
    // Sumi is painted onto a near-black stage, so literal black pigment would
    // disappear. Treat the stage as moonlight on wet ink: a clear cobalt body,
    // an almost-black loaded side, and a pale dry-bristle catch. The three
    // values stay matte and visibly separate without using additive blending.
    const moonlitBody = mixHexColors(pigment, "#63b7ff", 0.95);
    const loadedCarbon = mixHexColors(pigment, "#102a52", 0.96);
    const dryFiber = mixHexColors(edge, "#f7fcff", 0.88);

    // One matte body carries the silhouette. A broad outer outline recreated
    // the exact concentric hose this branch exists to remove.
    this.drawSumiStrokePass(
      ctx,
      ribbon,
      moonlitBody,
      0.98,
      peakAlpha * 1.1,
      "source-over",
      { noiseChannel: 31, chunkSize: 4 }
    );
    this.drawSumiStrokePass(
      ctx,
      ribbon,
      loadedCarbon,
      0.52,
      peakAlpha * 1.08,
      "source-over",
      {
        offsetFactor: -0.17,
        noiseChannel: 33,
        breakThreshold: 0.29,
        chunkSize: 4,
      }
    );

    // The dry side catches isolated fibers rather than forming another band.
    this.drawSumiStrokePass(
      ctx,
      ribbon,
      mixHexColors(moonlitBody, dryFiber, 0.46),
      0.18,
      peakAlpha * 0.56,
      "source-over",
      {
        offsetFactor: 0.34,
        noiseChannel: 35,
        breakThreshold: 0.46,
        chunkSize: 3,
      }
    );

    this.drawSumiTurnPools(ctx, ribbon, moonlitBody, peakAlpha);

    // Sparse dry fibers catch the stage light. Source-over keeps this matte;
    // screen blending made the edge read like metal or neon.
    this.drawSumiStrokePass(
      ctx,
      ribbon,
      dryFiber,
      0.065,
      peakAlpha * 0.32,
      "source-over",
      {
        offsetFactor: 0.39,
        noiseChannel: 37,
        breakThreshold: 0.58,
        chunkSize: 3,
      }
    );

    this.drawSumiEdgeFibers(ctx, ribbon, dryFiber, peakAlpha);
  }

  private drawSumiStrokePass(
    ctx: CanvasRenderingContext2D,
    ribbon: RibbonPoint[],
    color: string,
    widthFactor: number,
    alpha: number,
    composite: GlobalCompositeOperation,
    options: RibbonPassOptions = {}
  ): void {
    if (ribbon.length === 0 || alpha <= 0.003) return;
    const previousComposite = ctx.globalCompositeOperation;
    const previousAlpha = ctx.globalAlpha;
    const previousStroke = ctx.strokeStyle;
    const previousLineWidth = ctx.lineWidth;
    const previousLineCap = ctx.lineCap;
    const previousLineJoin = ctx.lineJoin;
    const previousFill = ctx.fillStyle;

    try {
      ctx.globalCompositeOperation = composite;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (ribbon.length === 1) {
        const point = ribbon[0]!;
        ctx.globalAlpha = alpha * point.fade;
        ctx.beginPath();
        ctx.arc(
          point.x,
          point.y,
          point.width * widthFactor * 0.5,
          0,
          Math.PI * 2
        );
        ctx.fill();
        return;
      }

      const offsetFactor = options.offsetFactor ?? 0;
      const noiseChannel = options.noiseChannel ?? 5;
      const breakThreshold = options.breakThreshold ?? 0;
      const chunkSize = Math.max(2, options.chunkSize ?? 4);
      const centerX = (point: RibbonPoint): number =>
        point.x + point.nx * point.width * offsetFactor;
      const centerY = (point: RibbonPoint): number =>
        point.y + point.ny * point.width * offsetFactor;
      const lastIndex = ribbon.length - 1;

      for (let startIndex = 0; startIndex < lastIndex; ) {
        const chunkId = Math.floor(ribbon[startIndex]!.sequence / chunkSize);
        let endIndex = startIndex + 1;
        while (
          endIndex < lastIndex &&
          Math.floor(ribbon[endIndex]!.sequence / chunkSize) === chunkId
        ) {
          endIndex++;
        }
        const start = ribbon[startIndex]!;
        const grain = jitterHash(
          chunkId + start.materialSeed * 4096,
          noiseChannel
        );
        if (grain < breakThreshold) {
          startIndex = endIndex;
          continue;
        }

        let localFade = 0;
        let localWidth = 0;
        for (let index = startIndex; index <= endIndex; index++) {
          localFade += ribbon[index]!.fade;
          localWidth += ribbon[index]!.width;
        }
        const pointCount = endIndex - startIndex + 1;
        localFade /= pointCount;
        localWidth /= pointCount;
        ctx.globalAlpha = alpha * localFade * (0.78 + grain * 0.22);
        if (ctx.globalAlpha <= 0.003) {
          startIndex = endIndex;
          continue;
        }

        ctx.lineWidth = localWidth * widthFactor;
        ctx.beginPath();
        ctx.moveTo(centerX(start), centerY(start));
        for (let index = startIndex; index < endIndex; index++) {
          const point0 = ribbon[Math.max(0, index - 1)]!;
          const point1 = ribbon[index]!;
          const point2 = ribbon[index + 1]!;
          const point3 = ribbon[Math.min(lastIndex, index + 2)]!;
          const p0x = centerX(point0);
          const p0y = centerY(point0);
          const p1x = centerX(point1);
          const p1y = centerY(point1);
          const p2x = centerX(point2);
          const p2y = centerY(point2);
          const p3x = centerX(point3);
          const p3y = centerY(point3);
          const segmentLength = Math.hypot(p2x - p1x, p2y - p1y);
          const controlLimit = segmentLength * 0.45;
          let control1X = (p2x - p0x) / 6;
          let control1Y = (p2y - p0y) / 6;
          let control2X = (p3x - p1x) / 6;
          let control2Y = (p3y - p1y) / 6;
          const control1Length = Math.hypot(control1X, control1Y);
          const control2Length = Math.hypot(control2X, control2Y);
          if (control1Length > controlLimit && control1Length > 0) {
            const controlScale = controlLimit / control1Length;
            control1X *= controlScale;
            control1Y *= controlScale;
          }
          if (control2Length > controlLimit && control2Length > 0) {
            const controlScale = controlLimit / control2Length;
            control2X *= controlScale;
            control2Y *= controlScale;
          }
          ctx.bezierCurveTo(
            p1x + control1X,
            p1y + control1Y,
            p2x - control2X,
            p2y - control2Y,
            p2x,
            p2y
          );
        }
        ctx.stroke();
        startIndex = endIndex;
      }
    } finally {
      ctx.globalCompositeOperation = previousComposite;
      ctx.globalAlpha = previousAlpha;
      ctx.strokeStyle = previousStroke;
      ctx.lineWidth = previousLineWidth;
      ctx.lineCap = previousLineCap;
      ctx.lineJoin = previousLineJoin;
      ctx.fillStyle = previousFill;
    }
  }

  private drawSumiTurnPools(
    ctx: CanvasRenderingContext2D,
    ribbon: RibbonPoint[],
    color: string,
    peakAlpha: number
  ): void {
    if (ribbon.length < 3) return;
    const previousComposite = ctx.globalCompositeOperation;
    const previousAlpha = ctx.globalAlpha;
    const previousFill = ctx.fillStyle;
    let lastSequence = Number.NEGATIVE_INFINITY;

    try {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = mixHexColors(color, "#d7e0ed", 0.24);
      for (let index = 1; index < ribbon.length - 1; index++) {
        const point = ribbon[index]!;
        if (
          point.turnLoad < 0.62 ||
          point.sequence - lastSequence < 12 ||
          jitterHash(point.seed, 111) < 0.74
        )
          continue;

        const radius = point.width * (0.2 + point.turnLoad * 0.08);
        ctx.globalAlpha =
          peakAlpha * (0.09 + point.turnLoad * 0.11) * point.fade;
        ctx.save();
        ctx.translate(
          point.x - point.nx * point.width * 0.08,
          point.y - point.ny * point.width * 0.08
        );
        ctx.rotate(Math.atan2(-point.nx, point.ny));
        ctx.scale(1.55, 0.72);
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        lastSequence = point.sequence;
      }
    } finally {
      ctx.globalCompositeOperation = previousComposite;
      ctx.globalAlpha = previousAlpha;
      ctx.fillStyle = previousFill;
    }
  }

  private drawSumiEdgeFibers(
    ctx: CanvasRenderingContext2D,
    ribbon: RibbonPoint[],
    color: string,
    peakAlpha: number
  ): void {
    if (ribbon.length < 3) return;
    const previousComposite = ctx.globalCompositeOperation;
    const previousAlpha = ctx.globalAlpha;
    const previousStroke = ctx.strokeStyle;
    const previousLineWidth = ctx.lineWidth;
    const previousLineCap = ctx.lineCap;
    const previousLineJoin = ctx.lineJoin;

    try {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let strand = 0; strand < 3; strand++) {
        const side = 1;
        const distance = 0.43 + strand * 0.065;
        ctx.lineWidth = 0.46 + strand * 0.09;
        ctx.globalAlpha = peakAlpha * 0.14;
        ctx.beginPath();
        let drawing = false;

        for (const point of ribbon) {
          const fiberContinues =
            point.fade > 0.03 && jitterHash(point.seed, 121 + strand) > 0.36;
          if (!fiberContinues) {
            drawing = false;
            continue;
          }

          const jitter =
            (jitterHash(point.seed, 137 + strand) - 0.5) * point.width * 0.12;
          const offset = point.width * distance * side + jitter;
          const x = point.x + point.nx * offset;
          const y = point.y + point.ny * offset;
          if (drawing) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
          drawing = true;
        }
        ctx.stroke();
      }
    } finally {
      ctx.globalCompositeOperation = previousComposite;
      ctx.globalAlpha = previousAlpha;
      ctx.strokeStyle = previousStroke;
      ctx.lineWidth = previousLineWidth;
      ctx.lineCap = previousLineCap;
      ctx.lineJoin = previousLineJoin;
    }
  }

  private drawNeonInkRibbon(
    ctx: CanvasRenderingContext2D,
    ribbon: RibbonPoint[],
    pigment: string,
    edge: string,
    peakAlpha: number
  ): void {
    this.drawRibbonPass(ctx, ribbon, edge, 1.04, peakAlpha * 0.12, "lighter", {
      noiseChannel: 39,
      chunkSize: 6,
    });
    this.drawRibbonPass(
      ctx,
      ribbon,
      pigment,
      0.68,
      peakAlpha * 0.74,
      "lighter",
      { noiseChannel: 41, chunkSize: 5 }
    );
    this.drawSegmentedRibbonPass(
      ctx,
      ribbon,
      mixWithWhite(edge, 0.55),
      0.32,
      peakAlpha * 0.72,
      "lighter",
      43
    );
  }

  private drawDenseInkRibbon(
    ctx: CanvasRenderingContext2D,
    ribbon: RibbonPoint[],
    pigment: string,
    edge: string,
    peakAlpha: number,
    needsDarkStageContrast: boolean
  ): void {
    this.drawRibbonPass(
      ctx,
      ribbon,
      needsDarkStageContrast ? mixWithWhite(edge, 0.22) : edge,
      1.02,
      peakAlpha * (needsDarkStageContrast ? 0.06 : 0.05),
      "source-over",
      { noiseChannel: 45, chunkSize: 7 }
    );
    this.drawRibbonPass(
      ctx,
      ribbon,
      needsDarkStageContrast ? mixWithWhite(pigment, 0.22) : pigment,
      0.72,
      peakAlpha * 0.82,
      "source-over",
      { noiseChannel: 47, chunkSize: 6 }
    );
    this.drawSegmentedRibbonPass(
      ctx,
      ribbon,
      pigment,
      0.52,
      peakAlpha * 0.5,
      "source-over",
      49
    );
    this.drawRibbonPass(
      ctx,
      ribbon,
      mixWithWhite(edge, needsDarkStageContrast ? 0.72 : 0.42),
      0.05,
      peakAlpha * (needsDarkStageContrast ? 0.36 : 0.24),
      "screen",
      {
        offsetFactor: 0.3,
        noiseChannel: 51,
        breakThreshold: 0.3,
        chunkSize: 3,
      }
    );
  }

  private buildRibbon(
    points: InkPoint[],
    params: Ink2DParams,
    scale: number
  ): RibbonPoint[] {
    const cumulativeLength = new Array<number>(points.length).fill(0);
    for (let index = 1; index < points.length; index++) {
      const previous = points[index - 1]!;
      const point = points[index]!;
      cumulativeLength[index] =
        cumulativeLength[index - 1]! +
        Math.hypot(point.x - previous.x, point.y - previous.y);
    }
    const totalLength = cumulativeLength[cumulativeLength.length - 1] ?? 0;
    const tailFadeLength = Math.min(72 * scale, totalLength * 0.24);

    const ribbon = points.map((point, index) => {
      const previous = points[Math.max(0, index - 1)]!;
      const next = points[Math.min(points.length - 1, index + 1)]!;
      const turnPrevious = points[Math.max(0, index - 4)]!;
      const turnNext = points[Math.min(points.length - 1, index + 4)]!;
      let dx = next.x - previous.x;
      let dy = next.y - previous.y;
      const length = Math.hypot(dx, dy);
      if (length < 0.001) {
        dx = Math.cos(point.tangentAngle);
        dy = Math.sin(point.tangentAngle);
      } else {
        dx /= length;
        dy /= length;
      }
      const sumi = params.resolvedPalette.id === "sumi";
      const widthNoise = sumi
        ? 0.68 + jitterHash(point.jitterSeed, 4) * 0.62
        : 0.84 + jitterHash(point.jitterSeed, 4) * 0.3;
      const turnLoad = resolveInkTurnLoad(turnPrevious, point, turnNext);
      const fade =
        pointFade(point.age, params.lifetimeSeconds) *
        smoothstep(0, tailFadeLength, cumulativeLength[index] ?? 0);
      return {
        x: point.x,
        y: point.y,
        nx: -dy,
        ny: dx,
        width:
          Math.max(
            0.75 * scale,
            resolveInkStrokeWidth(params, point.spawnSpeedPx, scale)
          ) *
          widthNoise *
          (1 + turnLoad * (sumi ? 0.64 : 0.42)),
        fade,
        turnLoad,
        sequence: point.sequence,
        materialSeed: point.materialSeed,
        seed: point.jitterSeed,
      };
    });

    if (params.resolvedPalette.id === "sumi" && ribbon.length > 0) {
      // Seed the dry side toward a stable stage-space light, then parallel
      // transport that side through the stroke. Retracing no longer swaps the
      // carbon and dry edges or crosses them into a cusp knot.
      const first = ribbon[0]!;
      if (first.nx * 0.62 + first.ny * -0.78 < 0) {
        first.nx *= -1;
        first.ny *= -1;
      }
      for (let index = 1; index < ribbon.length; index++) {
        const previous = ribbon[index - 1]!;
        const point = ribbon[index]!;
        if (previous.nx * point.nx + previous.ny * point.ny < 0) {
          point.nx *= -1;
          point.ny *= -1;
        }
      }
    }

    // Playback can go from still to fast in one frame. Real bristles cannot
    // collapse from a loaded mark to a hairline instantly, so cap the width
    // change between samples. This removes geometric wedges while keeping the
    // pressure envelope visibly responsive.
    for (let index = 1; index < ribbon.length; index++) {
      const previousWidth = ribbon[index - 1]!.width;
      ribbon[index]!.width = Math.max(
        previousWidth / 1.42,
        Math.min(previousWidth * 1.42, ribbon[index]!.width)
      );
    }

    if (params.resolvedPalette.id === "sumi" && ribbon.length >= 3) {
      const lastIndex = ribbon.length - 1;
      // The live brush lifts into the prop instead of ending in a marker cap.
      // The retained tail already has its own age taper below.
      ribbon[lastIndex]!.width *= 0.38;
      ribbon[lastIndex - 1]!.width *= 0.68;
    }

    // Fade owns both opacity and silhouette. Collapsing the old end to a
    // point prevents the retained history from ending as a blunt hose cap.
    for (const point of ribbon) {
      point.width *= Math.sqrt(Math.max(0, point.fade));
    }
    return ribbon;
  }

  private drawSegmentedRibbonPass(
    ctx: CanvasRenderingContext2D,
    ribbon: RibbonPoint[],
    color: string,
    widthFactor: number,
    alpha: number,
    composite: GlobalCompositeOperation,
    noiseChannel: number
  ): void {
    if (ribbon.length === 0 || alpha <= 0.003) return;
    const previousComposite = ctx.globalCompositeOperation;
    const previousAlpha = ctx.globalAlpha;
    const previousFill = ctx.fillStyle;

    try {
      ctx.globalCompositeOperation = composite;
      ctx.fillStyle = color;

      if (ribbon.length === 1) {
        const point = ribbon[0]!;
        ctx.globalAlpha = alpha * point.fade;
        ctx.beginPath();
        ctx.arc(
          point.x,
          point.y,
          point.width * widthFactor * 0.5,
          0,
          Math.PI * 2
        );
        ctx.fill();
        return;
      }

      for (let index = 0; index < ribbon.length - 1; index++) {
        const start = ribbon[index]!;
        const end = ribbon[index + 1]!;
        const startHalfWidth = start.width * widthFactor * 0.5;
        const endHalfWidth = end.width * widthFactor * 0.5;
        const localFade = (start.fade + end.fade) * 0.5;
        const opacityNoise =
          0.66 + jitterHash((start.seed + end.seed) * 0.5, noiseChannel) * 0.42;
        ctx.globalAlpha = alpha * localFade * opacityNoise;
        if (ctx.globalAlpha <= 0.003) continue;

        ctx.beginPath();
        ctx.moveTo(
          start.x + start.nx * startHalfWidth,
          start.y + start.ny * startHalfWidth
        );
        ctx.lineTo(
          end.x + end.nx * endHalfWidth,
          end.y + end.ny * endHalfWidth
        );
        ctx.lineTo(
          end.x - end.nx * endHalfWidth,
          end.y - end.ny * endHalfWidth
        );
        ctx.lineTo(
          start.x - start.nx * startHalfWidth,
          start.y - start.ny * startHalfWidth
        );
        ctx.closePath();
        ctx.fill();
      }

      const newest = ribbon[ribbon.length - 1]!;
      ctx.globalAlpha = alpha * newest.fade * 0.82;
      ctx.beginPath();
      ctx.arc(
        newest.x,
        newest.y,
        newest.width * widthFactor * 0.5,
        0,
        Math.PI * 2
      );
      ctx.fill();
    } finally {
      ctx.globalCompositeOperation = previousComposite;
      ctx.globalAlpha = previousAlpha;
      ctx.fillStyle = previousFill;
    }
  }

  private drawRibbonPass(
    ctx: CanvasRenderingContext2D,
    ribbon: RibbonPoint[],
    color: string,
    widthFactor: number,
    alpha: number,
    composite: GlobalCompositeOperation,
    options: RibbonPassOptions = {}
  ): void {
    if (ribbon.length === 0 || alpha <= 0.003) return;
    const previousComposite = ctx.globalCompositeOperation;
    const previousAlpha = ctx.globalAlpha;
    const previousFill = ctx.fillStyle;

    try {
      ctx.globalCompositeOperation = composite;
      ctx.fillStyle = color;

      const offsetFactor = options.offsetFactor ?? 0;
      const noiseChannel = options.noiseChannel ?? 5;
      const breakThreshold = options.breakThreshold ?? 0;
      const chunkSize = Math.max(2, options.chunkSize ?? 8);

      if (ribbon.length === 1) {
        const point = ribbon[0]!;
        ctx.globalAlpha = alpha * point.fade;
        const centerOffset = point.width * offsetFactor;
        ctx.beginPath();
        ctx.arc(
          point.x + point.nx * centerOffset,
          point.y + point.ny * centerOffset,
          point.width * widthFactor * 0.5,
          0,
          Math.PI * 2
        );
        ctx.fill();
        return;
      }

      const lastIndex = ribbon.length - 1;
      for (let startIndex = 0; startIndex < lastIndex; ) {
        // Anchor the material phase to immutable point sequences. Index-based
        // chunks repartitioned the entire retained stroke whenever the oldest
        // point was evicted, making grain crawl and broken reflections blink.
        const chunkId = Math.floor(ribbon[startIndex]!.sequence / chunkSize);
        let endIndex = startIndex + 1;
        while (
          endIndex < lastIndex &&
          Math.floor(ribbon[endIndex]!.sequence / chunkSize) === chunkId
        ) {
          endIndex++;
        }
        const start = ribbon[startIndex]!;
        const end = ribbon[endIndex]!;
        const grain = jitterHash(
          chunkId + start.materialSeed * 4096,
          noiseChannel
        );
        if (grain >= breakThreshold) {
          let localFade = 0;
          for (let index = startIndex; index <= endIndex; index++) {
            localFade += ribbon[index]!.fade;
          }
          localFade /= endIndex - startIndex + 1;
          ctx.globalAlpha = alpha * localFade * (0.82 + grain * 0.18);

          if (ctx.globalAlpha > 0.003) {
            const startCenter = start.width * offsetFactor;
            const startHalf = start.width * widthFactor * 0.5;
            ctx.beginPath();
            ctx.moveTo(
              start.x + start.nx * (startCenter + startHalf),
              start.y + start.ny * (startCenter + startHalf)
            );

            for (let index = startIndex + 1; index < endIndex; index++) {
              const point = ribbon[index]!;
              const next = ribbon[index + 1]!;
              const pointOffset =
                point.width * offsetFactor + point.width * widthFactor * 0.5;
              const nextOffset =
                next.width * offsetFactor + next.width * widthFactor * 0.5;
              const pointX = point.x + point.nx * pointOffset;
              const pointY = point.y + point.ny * pointOffset;
              const nextX = next.x + next.nx * nextOffset;
              const nextY = next.y + next.ny * nextOffset;
              ctx.quadraticCurveTo(
                pointX,
                pointY,
                (pointX + nextX) * 0.5,
                (pointY + nextY) * 0.5
              );
            }

            const endCenter = end.width * offsetFactor;
            const endHalf = end.width * widthFactor * 0.5;
            ctx.lineTo(
              end.x + end.nx * (endCenter + endHalf),
              end.y + end.ny * (endCenter + endHalf)
            );
            ctx.lineTo(
              end.x + end.nx * (endCenter - endHalf),
              end.y + end.ny * (endCenter - endHalf)
            );

            for (let index = endIndex - 1; index > startIndex; index--) {
              const point = ribbon[index]!;
              const next = ribbon[index - 1]!;
              const pointOffset =
                point.width * offsetFactor - point.width * widthFactor * 0.5;
              const nextOffset =
                next.width * offsetFactor - next.width * widthFactor * 0.5;
              const pointX = point.x + point.nx * pointOffset;
              const pointY = point.y + point.ny * pointOffset;
              const nextX = next.x + next.nx * nextOffset;
              const nextY = next.y + next.ny * nextOffset;
              ctx.quadraticCurveTo(
                pointX,
                pointY,
                (pointX + nextX) * 0.5,
                (pointY + nextY) * 0.5
              );
            }

            ctx.lineTo(
              start.x + start.nx * (startCenter - startHalf),
              start.y + start.ny * (startCenter - startHalf)
            );
            ctx.closePath();
            ctx.fill();
          }
        }
        startIndex = endIndex;
      }
    } finally {
      ctx.globalCompositeOperation = previousComposite;
      ctx.globalAlpha = previousAlpha;
      ctx.fillStyle = previousFill;
    }
  }

  private drawGranulation(
    ctx: CanvasRenderingContext2D,
    params: Ink2DParams,
    scale: number,
    strokes: readonly InkPoint[][],
    materialAlpha: number = 1
  ): void {
    const stamp = this.stampCache.get(params);
    const previousComposite = ctx.globalCompositeOperation;
    const previousAlpha = ctx.globalAlpha;
    const watercolor = !!params.resolvedPalette.watercolor;
    const sumi = params.resolvedPalette.id === "sumi";

    try {
      // The texture is clipped to the ribbon already on this transparent
      // overlay. It adds pigment grain without reintroducing visible circles.
      ctx.globalCompositeOperation = "source-atop";
      for (const points of strokes) {
        for (let index = 0; index < points.length; index += 2) {
          const point = points[index]!;
          const fade = pointFade(point.age, params.lifetimeSeconds);
          if (fade <= 0.01) continue;
          const width = resolveInkStrokeWidth(
            params,
            point.spawnSpeedPx,
            scale
          );
          const stampScale = Math.max(
            0.08,
            (width / (STAMP_R * 2)) * (watercolor ? 1.45 : sumi ? 1.28 : 1.1)
          );
          const scaleJitter =
            1 + (jitterHash(point.jitterSeed, 6) - 0.5) * MAX_SCALE_JITTER;
          const rotation =
            point.tangentAngle +
            (jitterHash(point.jitterSeed, 7) - 0.5) * MAX_ROTATION_JITTER;
          ctx.globalAlpha =
            fade * materialAlpha * (watercolor ? 0.24 : sumi ? 0.22 : 0.12);
          ctx.save();
          ctx.translate(point.x, point.y);
          ctx.rotate(rotation);
          ctx.scale(stampScale * scaleJitter * 1.7, stampScale * scaleJitter);
          ctx.drawImage(stamp, -STAMP_HALF, -STAMP_HALF);
          ctx.restore();
        }
      }
    } finally {
      ctx.globalCompositeOperation = previousComposite;
      ctx.globalAlpha = previousAlpha;
    }
  }

  private drawBristleBreakup(
    ctx: CanvasRenderingContext2D,
    params: Ink2DParams,
    scale: number,
    strokes: readonly InkPoint[][]
  ): void {
    const previousComposite = ctx.globalCompositeOperation;
    const previousAlpha = ctx.globalAlpha;
    const previousStroke = ctx.strokeStyle;
    const previousLineWidth = ctx.lineWidth;
    const previousLineCap = ctx.lineCap;
    const previousLineJoin = ctx.lineJoin;
    const watercolor = !!params.resolvedPalette.watercolor;
    const sumi = params.resolvedPalette.id === "sumi";

    try {
      // Dry bristles expose the stage below the mark. Sumi uses low-alpha,
      // discontinuous cuts: enough substrate shows through to read as starved
      // fibers without erasing the body into two outlines.
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(
        0.45,
        (watercolor ? 0.62 : sumi ? 0.76 : 0.8) * scale
      );
      ctx.globalAlpha = watercolor ? 0.075 : sumi ? 0.28 : 0.11;

      for (const points of strokes) {
        if (points.length < 3) continue;
        const strandFloor = sumi ? -2 : -1;
        const strandCeiling = sumi ? 2 : 1;
        for (let strand = strandFloor; strand <= strandCeiling; strand++) {
          ctx.beginPath();
          let drawing = false;
          points.forEach((point, index) => {
            if (sumi && jitterHash(point.jitterSeed, 163 + strand) < 0.46) {
              drawing = false;
              return;
            }
            const width = resolveInkStrokeWidth(
              params,
              point.spawnSpeedPx,
              scale
            );
            const offset =
              (strand - (sumi ? 0.5 : 0)) * width * 0.16 +
              (jitterHash(point.jitterSeed, 12 + strand) - 0.5) * width * 0.12;
            const normalAngle = point.tangentAngle + Math.PI / 2;
            const x = point.x + Math.cos(normalAngle) * offset;
            const y = point.y + Math.sin(normalAngle) * offset;
            if (!drawing || index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            drawing = true;
          });
          ctx.stroke();
        }
      }
    } finally {
      ctx.globalCompositeOperation = previousComposite;
      ctx.globalAlpha = previousAlpha;
      ctx.strokeStyle = previousStroke;
      ctx.lineWidth = previousLineWidth;
      ctx.lineCap = previousLineCap;
      ctx.lineJoin = previousLineJoin;
    }
  }

  private drawDroplets(
    ctx: CanvasRenderingContext2D,
    params: Ink2DParams
  ): void {
    if (this.droplets.length === 0) return;
    const palette = params.resolvedPalette;
    const previousComposite = ctx.globalCompositeOperation;
    const previousAlpha = ctx.globalAlpha;
    const previousFill = ctx.fillStyle;

    try {
      ctx.globalCompositeOperation = palette.emissive
        ? "lighter"
        : "source-over";
      const peakAlpha = Math.min(
        params.opacityMax * (0.48 + params.intensity * 0.52),
        1
      );
      const densityAlpha =
        palette.id === "sumi"
          ? Math.max(0.55, Math.sqrt(2 / Math.max(2, this.activeEmitterCount)))
          : 1;

      for (const droplet of this.droplets) {
        const fade = pointFade(droplet.age, droplet.maxAge);
        const speed = Math.hypot(droplet.vx, droplet.vy);
        const stretch = 1 + Math.min(1.7, speed / 190);
        const rotation = Math.atan2(droplet.vy, droplet.vx) - Math.PI / 2;
        const sumi = palette.id === "sumi";
        const blood = palette.id === "blood";
        const bodyColor = sumi
          ? mixHexColors(palette.pigment, "#7892b8", 0.62)
          : droplet.kind === "splatter"
            ? palette.splatterTint
            : palette.pigment;

        ctx.save();
        ctx.translate(droplet.x, droplet.y);
        ctx.rotate(rotation);

        ctx.globalAlpha =
          peakAlpha * fade * densityAlpha * (palette.watercolor ? 0.24 : 0.2);
        ctx.fillStyle = sumi
          ? mixHexColors(palette.edge, "#9eb1cb", 0.5)
          : palette.edge;
        if (blood) {
          this.drawBloodChip(
            ctx,
            droplet.radius * 1.14,
            stretch * 1.08,
            droplet.jitterSeed
          );
        } else {
          ctx.save();
          ctx.scale(1.45, stretch * 1.25);
          ctx.beginPath();
          ctx.arc(0, 0, droplet.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        ctx.globalAlpha =
          peakAlpha *
          fade *
          densityAlpha *
          (sumi ? 0.72 : droplet.kind === "splatter" ? 0.9 : 0.78);
        ctx.fillStyle = bodyColor;
        if (blood) {
          this.drawBloodChip(ctx, droplet.radius, stretch, droplet.jitterSeed);
        } else {
          ctx.scale(0.72, stretch);
          ctx.beginPath();
          ctx.arc(0, 0, droplet.radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    } finally {
      ctx.globalCompositeOperation = previousComposite;
      ctx.globalAlpha = previousAlpha;
      ctx.fillStyle = previousFill;
    }
  }

  private drawBloodChip(
    ctx: CanvasRenderingContext2D,
    radius: number,
    stretch: number,
    seed: number
  ): void {
    const tipOffset = (jitterHash(seed, 21) - 0.5) * radius * 0.46;
    const left = radius * (0.58 + jitterHash(seed, 22) * 0.28);
    const right = radius * (0.54 + jitterHash(seed, 23) * 0.32);
    const front = radius * stretch * (1.05 + jitterHash(seed, 24) * 0.24);
    const tail = radius * stretch * (0.72 + jitterHash(seed, 25) * 0.2);

    ctx.beginPath();
    ctx.moveTo(tipOffset, -front);
    ctx.bezierCurveTo(
      right * 0.72,
      -radius * 0.62,
      right,
      radius * 0.08,
      right * 0.52,
      tail * 0.58
    );
    ctx.quadraticCurveTo(0, tail, -left * 0.62, tail * 0.5);
    ctx.bezierCurveTo(
      -left,
      radius * 0.04,
      -left * 0.68,
      -radius * 0.58,
      tipOffset,
      -front
    );
    ctx.closePath();
    ctx.fill();
  }

  private isEndEnabled(end: "A" | "B", params: Ink2DParams): boolean {
    if (params.trackingMode === "both_ends") return true;
    return params.trackingMode === "left_end" ? end === "A" : end === "B";
  }

  getDiagnostics(): Ink2DDiagnostics {
    const strokesByTip = new Map<string, InkPoint[][]>();
    for (const stroke of this.detachedStrokes) {
      const strokes = strokesByTip.get(stroke.id) ?? [];
      strokes.push(stroke.points);
      strokesByTip.set(stroke.id, strokes);
    }
    for (const [id, state] of this.tips) {
      const strokes = strokesByTip.get(id) ?? [];
      if (state.points.length > 0) strokes.push(state.points);
      strokesByTip.set(id, strokes);
    }

    const tips = Array.from(strokesByTip.entries()).map(([id, strokes]) => {
      const points = strokes.flat();
      return {
        id,
        pointCount: points.length,
        pathLength: strokes.reduce(
          (total, stroke) => total + pathLength(stroke),
          0
        ),
        oldestY: points[0]?.y ?? null,
        newestY: points[points.length - 1]?.y ?? null,
      };
    });
    const visibleStrokes = this.collectVisibleStrokes();
    return {
      tipCount: tips.length,
      pointCount: tips.reduce((sum, tip) => sum + tip.pointCount, 0),
      maxPathLength: visibleStrokes.reduce(
        (maximum, stroke) => Math.max(maximum, pathLength(stroke)),
        0
      ),
      dropletCount: this.droplets.length,
      detachedStrokeCount: this.detachedStrokes.length,
      tips,
    };
  }

  dispose(): void {
    this.tips.clear();
    this.detachedStrokes = [];
    this.visibleStrokeScratch = [];
    this.stampCache.dispose();
    this.droplets = [];
    this.activeEmitterCount = 0;
  }
}
