/**
 * The Overture's drawing: a real mandala traced as the boot's progress.
 *
 * Pure math and frame composition against a minimal 2D context, so the boot
 * worker (overture.worker.ts) and the unit tests run the same code. No DOM,
 * no worker globals, no calculator: a scene arrives already compacted (see
 * overture-snapshot.ts and static/boot/overture-pool.json).
 *
 * Design: docs/superpowers/specs/2026-10-26-boot-overture-design.md
 */
import {
  BLUE_STROKE,
  LIGHT_MOTION_BLUE_STROKE,
  LIGHT_MOTION_PURPLE_STROKE,
  LIGHT_MOTION_RED_STROKE,
  MANDALA_GRID_RADIUS,
  PURPLE_STROKE,
  RED_STROKE,
} from "../../mandala/domain/mandala-constants";
import { mixColors } from "../../mandala/domain/mandala-palette";
import { compositeMandalaOverlap } from "../../mandala/services/mandala-overlap-compositor";

export type OverturePoint = [number, number];

/** One traced sequence: four tip polylines in grid units, letters per beat. */
export interface OvertureScene {
  v: 1;
  /** The pool entry this came from; absent on a user snapshot. */
  id?: string;
  word: string;
  /** One glyph string per beat of the full sequence, TKA font. */
  letters: string[];
  /** Beats in the repeating unit (equals `beats` when the word has none). */
  unit: number;
  beats: number;
  left: OverturePoint[][];
  right: OverturePoint[][];
}

export type OvertureSurface = "dark" | "light";

/** The user's prop colours (settings `primaryPropColors`), `#rrggbb` each. */
export interface OvertureColors {
  left: string;
  right: string;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** The pair when both are six-digit hex colours, else null (the defaults). */
export function overtureColors(value: unknown): OvertureColors | null {
  if (!value || typeof value !== "object") return null;
  const { left, right } = value as { left?: unknown; right?: unknown };
  if (typeof left !== "string" || typeof right !== "string") return null;
  if (!HEX_COLOR.test(left) || !HEX_COLOR.test(right)) return null;
  return { left: left.toLowerCase(), right: right.toLowerCase() };
}

/** The subset of CanvasRenderingContext2D the Overture draws with. */
export interface OvertureContext {
  globalAlpha: number;
  globalCompositeOperation: string;
  strokeStyle: unknown;
  fillStyle: unknown;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  shadowColor: string;
  shadowBlur: number;
  save(): void;
  restore(): void;
  setTransform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number
  ): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: unknown, x: number, y: number): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  stroke(): void;
  fill(): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number
  ): { addColorStop(offset: number, color: string): void };
}

// ---------------------------------------------------------------------------
// Scene validation (shared by the worker and the snapshot reader)
// ---------------------------------------------------------------------------

function isPath(value: unknown): value is OverturePoint[] {
  if (!Array.isArray(value) || value.length < 2) return false;
  for (const point of value) {
    if (
      !Array.isArray(point) ||
      typeof point[0] !== "number" ||
      typeof point[1] !== "number" ||
      !Number.isFinite(point[0]) ||
      !Number.isFinite(point[1])
    ) {
      return false;
    }
  }
  return true;
}

/** Whether a parsed value is a drawable version-1 scene. */
export function isOvertureScene(value: unknown): value is OvertureScene {
  if (!value || typeof value !== "object") return false;
  const scene = value as Partial<OvertureScene>;
  if (scene.v !== 1) return false;
  if (typeof scene.word !== "string") return false;
  if (!Number.isInteger(scene.beats) || (scene.beats as number) < 1)
    return false;
  if (!Number.isInteger(scene.unit) || (scene.unit as number) < 1) return false;
  if ((scene.unit as number) > (scene.beats as number)) return false;
  if (!Array.isArray(scene.letters) || scene.letters.length !== scene.beats) {
    return false;
  }
  if (!scene.letters.every((letter) => typeof letter === "string"))
    return false;
  if (!Array.isArray(scene.left) || !Array.isArray(scene.right)) return false;
  if (scene.left.length + scene.right.length === 0) return false;
  return scene.left.every(isPath) && scene.right.every(isPath);
}

// ---------------------------------------------------------------------------
// Path math
// ---------------------------------------------------------------------------

/** Running arc length at each point; `cum[0]` is 0, never decreasing. */
export function cumulativeLengths(points: readonly OverturePoint[]): number[] {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i]![0] - points[i - 1]![0];
    const dy = points[i]![1] - points[i - 1]![1];
    cum.push(cum[i - 1]! + Math.hypot(dx, dy));
  }
  return cum;
}

/** A polyline ready to trace: its points, running lengths and beat layout. */
export interface TracePath {
  pts: readonly OverturePoint[];
  cum: number[];
  /**
   * Beats the polyline is split into, each with the same number of
   * segments (`spb`). A beat then finishes tracing exactly at t = (i+1)/beats,
   * and all four tips keep the sequence's own beat timing. One beat means
   * plain arc length over the whole line.
   */
  beats: number;
  spb: number;
  /** Ends where it starts, so a head can lap it without a jump. */
  closed: boolean;
}

export function preparePath(
  points: readonly OverturePoint[],
  beats = 1
): TracePath {
  const segments = points.length - 1;
  const even = beats > 1 && segments % beats === 0;
  const first = points[0];
  const last = points[segments];
  return {
    pts: points,
    cum: cumulativeLengths(points),
    beats: even ? beats : 1,
    spb: even ? segments / beats : segments,
    closed:
      segments > 1 &&
      first !== undefined &&
      last !== undefined &&
      Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.5,
  };
}

export interface TracePoint {
  x: number;
  y: number;
  /** Index of the segment's end point: points before it are fully traced. */
  i: number;
  /** Unit tangent along the path at this point. */
  tx: number;
  ty: number;
}

/**
 * The point a fraction t (0 to 1) along the path. With beats, t picks the
 * beat (t·beats) and the remainder is arc length within that beat.
 */
export function pointAt(path: TracePath, t: number): TracePoint {
  const { pts, cum } = path;
  const f = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const u = f * path.beats;
  const beat = Math.min(path.beats - 1, Math.floor(u));
  const first = beat * path.spb;
  const last = first + path.spb;
  const target = cum[first]! + (u - beat) * (cum[last]! - cum[first]!);
  let lo = first + 1;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid]! < target) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(1, lo);
  const a = pts[i - 1]!;
  const b = pts[i]!;
  const seg = cum[i]! - cum[i - 1]!;
  const k = seg > 0 ? (target - cum[i - 1]!) / seg : 0;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: a[0] + dx * k,
    y: a[1] + dy * k,
    i,
    tx: dx / len,
    ty: dy / len,
  };
}

/** Where a head is, at what fraction of its line, and which way it runs. */
export interface HeadPoint {
  point: TracePoint;
  t: number;
  /** Running back along the line (an open line's return leg). */
  back: boolean;
}

/**
 * A tip's head at progress p. Up to 1 it is the trace's front. Past 1 the
 * figure is whole and the head keeps lapping it at the same speed: round
 * and round a closed line, back and forth along an open one. So a boot that
 * runs long never leaves the heads standing still.
 */
export function headAt(path: TracePath, p: number): HeadPoint {
  if (!(p > 1)) {
    const t = p <= 0 ? 0 : p;
    return { point: pointAt(path, t), t, back: false };
  }
  const f = p - 1;
  if (path.closed) {
    const t = f - Math.floor(f);
    return { point: pointAt(path, t), t, back: false };
  }
  const u = f - 2 * Math.floor(f / 2);
  const back = u < 1;
  const t = back ? 1 - u : u - 1;
  const point = pointAt(path, t);
  if (back) {
    point.tx = -point.tx;
    point.ty = -point.ty;
  }
  return { point, t, back };
}

// ---------------------------------------------------------------------------
// Scene preparation
// ---------------------------------------------------------------------------

export interface OvertureTip {
  path: TracePath;
  hand: "left" | "right";
  color: string;
  rgb: [number, number, number];
}

export interface PreparedScene {
  scene: OvertureScene;
  tips: OvertureTip[];
  /** Where a left tip crosses a right one: the two hands' colours mixed. */
  overlap: string;
  /** Farthest point from the centre, in grid units. */
  extent: number;
  /** The glyphs drawn: the first `unit` beats' letters. */
  slots: string[];
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Prepares a scene's tips. With the user's prop colours the left hand takes
 * `left` and the right `right` on either surface, as the app's mandalas do
 * (applyMandalaHandColors); without them, the surface's blue and red.
 */
export function prepareScene(
  scene: OvertureScene,
  surface: OvertureSurface,
  colors: OvertureColors | null = null
): PreparedScene {
  const light = surface === "light";
  const blue =
    colors?.left ?? (light ? LIGHT_MOTION_BLUE_STROKE : BLUE_STROKE);
  const red = colors?.right ?? (light ? LIGHT_MOTION_RED_STROKE : RED_STROKE);
  const overlap = colors
    ? mixColors(colors.left, colors.right)
    : light
      ? LIGHT_MOTION_PURPLE_STROKE
      : PURPLE_STROKE;
  const tips: OvertureTip[] = [];
  for (const points of scene.left) {
    tips.push({
      path: preparePath(points, scene.beats),
      hand: "left",
      color: blue,
      rgb: hexRgb(blue),
    });
  }
  for (const points of scene.right) {
    tips.push({
      path: preparePath(points, scene.beats),
      hand: "right",
      color: red,
      rgb: hexRgb(red),
    });
  }
  let extent = MANDALA_GRID_RADIUS;
  for (const tip of tips) {
    for (const p of tip.path.pts)
      extent = Math.max(extent, Math.hypot(p[0], p[1]));
  }
  return {
    scene,
    tips,
    overlap,
    extent,
    slots: scene.letters.slice(0, scene.unit),
  };
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export interface OvertureLayout {
  /** Centre of the mandala square, CSS px. */
  cx: number;
  cy: number;
  /** Side of the square, CSS px. */
  size: number;
  /** Baseline of the letter row, CSS px. */
  lettersY: number;
  fontPx: number;
  phone: boolean;
}

/**
 * The square is min(72vmin, 560px), centred horizontally, its centre at 44 %
 * of the height on tall viewports and 46 % on wide ones. Letters sit under
 * it, kept clear of the capsule (bottom 9 %, 48 px tall).
 */
export function overtureLayout(width: number, height: number): OvertureLayout {
  const size = Math.min(0.72 * Math.min(width, height), 560);
  const cx = width / 2;
  const cy = height * (height > width ? 0.44 : 0.46);
  const phone = Math.min(width, height) < 600;
  const fontPx = phone ? 18 : 22;
  const capsuleTop = height * 0.91 - 48;
  const lettersY = Math.min(cy + size / 2 + fontPx, capsuleTop - 14);
  return { cx, cy, size, lettersY, fontPx, phone };
}

// ---------------------------------------------------------------------------
// Frame composition
// ---------------------------------------------------------------------------

export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  r: number;
  rgb: [number, number, number];
}

/** A scratch canvas and its context, the size of the main canvas's backing. */
export interface OvertureMaskLayer {
  canvas: unknown;
  ctx: OvertureContext;
}

/**
 * Two scratch layers for the overlap pass: each hand's traced strokes go on
 * its own layer, and where both have ink the main canvas gets the mixed
 * colour. The worker owns them (OffscreenCanvas) and keeps them the backing
 * size; without them the crossings keep the colour drawn last.
 */
export interface OvertureOverlapLayers {
  left: OvertureMaskLayer;
  right: OvertureMaskLayer;
  /** Backing size, device px. */
  width: number;
  height: number;
}

/** What persists between frames: sparks and the letter row's timing. */
export interface FrameState {
  sparks: Spark[];
  maxSparks: number;
  glow: boolean;
  overlap: OvertureOverlapLayers | null;
  /** When each slot first lit (fade-in start), or undefined. */
  litAt: (number | undefined)[];
  /** When each slot last pulsed. */
  pulseAt: (number | undefined)[];
  /** The beat being traced on the last frame, or -1. */
  beat: number;
  /**
   * How far a letter row too long for its window is slid left, CSS px, or
   * NaN before the first windowed frame. Eased toward the current beat.
   */
  rowShift: number;
  lastNow: number;
  random: () => number;
}

export function createFrameState(
  options: { phone?: boolean; random?: () => number } = {}
): FrameState {
  return {
    sparks: [],
    maxSparks: options.phone ? 48 : 96,
    glow: true,
    overlap: null,
    litAt: [],
    pulseAt: [],
    beat: -1,
    rowShift: Number.NaN,
    lastNow: Number.NaN,
    random: options.random ?? Math.random,
  };
}

export interface FrameView {
  width: number;
  height: number;
  dpr: number;
  surface: OvertureSurface;
  layout: OvertureLayout;
  /** Whole-layer opacity (entrance, fly-through, reduced motion). */
  alpha: number;
  /** Extra scale about the centre (breath × fly-through). */
  zoom: number;
  rotation: number;
  /** Head flare, 0 (none) to 1 (peak): halo ×3, full alpha. */
  flare: number;
  sparks: boolean;
  /** The TKA font is installed under this family, or null: no letters. */
  fontFamily: string | null;
  /** Draw the letter row as finished (reduced motion). */
  lettersStill?: boolean;
}

const FADE_MS = 240;
const SPARK_MS = 500;
/** Smallest letter size, as a share of the layout's, before the row windows. */
const MIN_LETTER_SCALE = 0.62;
/** Time constant of the windowed row's slide toward the current beat. */
const ROW_SLIDE_MS = 140;

function rgba(rgb: readonly number[], a: number): string {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
}

function tracePolyline(
  ctx: OvertureContext,
  tip: OvertureTip,
  end: TracePoint
): void {
  const pts = tip.path.pts;
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < end.i; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
  ctx.lineTo(end.x, end.y);
}

function traceSpan(
  ctx: OvertureContext,
  tip: OvertureTip,
  from: TracePoint,
  to: TracePoint
): void {
  const pts = tip.path.pts;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  for (let i = from.i; i < to.i; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
  ctx.lineTo(to.x, to.y);
}

/**
 * Draws one frame at traced fraction p. Order per frame: clear, glow pass
 * for every tip, crisp pass, hot trail, heads, sparks, letters.
 */
export function composeFrame(
  ctx: OvertureContext,
  prepared: PreparedScene,
  p: number,
  now: number,
  view: FrameView,
  state: FrameState
): void {
  const dt = Number.isFinite(state.lastNow)
    ? Math.min(64, now - state.lastNow)
    : 16;
  state.lastNow = now;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.clearRect(0, 0, view.width, view.height);
  if (view.alpha <= 0) return;

  const light = view.surface === "light";
  const { layout } = view;
  const half = layout.size / 2;
  const scale = Math.min(
    (0.38 * half) / MANDALA_GRID_RADIUS,
    (0.94 * half) / prepared.extent
  );
  // A canvas with no size yet (styles still loading, a zero-width window):
  // skip the frame instead of handing the canvas Infinity; the next resize
  // brings it back.
  if (!(scale > 0) || !Number.isFinite(scale) || !(view.zoom > 0)) return;
  const unitPx = 1 / scale;
  const traced = p <= 0 ? 0 : p >= 1 ? 1 : p;

  // The stage: grid units about the centre, turned and zoomed. The overlap
  // masks copy it so their ink lands on the same pixels.
  const stage = (target: OvertureContext) => {
    target.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    target.translate(layout.cx, layout.cy);
    target.rotate(view.rotation);
    target.scale(scale * view.zoom, scale * view.zoom);
    target.lineCap = "round";
    target.lineJoin = "round";
  };
  ctx.save();
  ctx.globalAlpha = view.alpha;
  stage(ctx);

  const ends = prepared.tips.map((tip) => pointAt(tip.path, traced));
  // Past 1 the figure is whole and the heads lap it until the finish.
  const lapping = p > 1;
  const runners = lapping
    ? prepared.tips.map((tip) => headAt(tip.path, p))
    : ends.map((point) => ({ point, t: traced, back: false }));
  if (traced > 0) {
    if (state.glow) {
      prepared.tips.forEach((tip, k) => {
        tracePolyline(ctx, tip, ends[k]!);
        ctx.strokeStyle = rgba(tip.rgb, light ? 0.18 : 0.28);
        ctx.lineWidth = 7 * unitPx;
        ctx.stroke();
      });
    }
    prepared.tips.forEach((tip, k) => {
      tracePolyline(ctx, tip, ends[k]!);
      ctx.strokeStyle = tip.color;
      ctx.lineWidth = 2 * unitPx;
      ctx.stroke();
    });
    if (state.overlap) {
      drawOverlap(ctx, prepared, ends, state.overlap, stage, unitPx, view);
    }
  }

  // Hot trail and heads: the moving edge. They stay while the heads lap a
  // whole figure; only a trace finished exactly at 1 leaves them still.
  const moving = traced < 1 || lapping;
  const heads = traced > 0 && (moving || view.flare > 0);
  if (heads) {
    prepared.tips.forEach((tip, k) => {
      const runner = runners[k]!;
      const head = runner.point;
      if (moving) {
        if (runner.back) {
          traceSpan(
            ctx,
            tip,
            head,
            pointAt(tip.path, Math.min(1, runner.t + 0.012))
          );
        } else {
          traceSpan(
            ctx,
            tip,
            pointAt(tip.path, Math.max(0, runner.t - 0.012)),
            head
          );
        }
        ctx.strokeStyle = light ? tip.color : "rgba(255,255,255,0.9)";
        ctx.lineWidth = 3 * unitPx;
        ctx.stroke();
      }
      const halo = 14 * unitPx * (1 + 2 * view.flare);
      const g = ctx.createRadialGradient(
        head.x,
        head.y,
        0,
        head.x,
        head.y,
        halo
      );
      g.addColorStop(0, light ? rgba(tip.rgb, 1) : "rgba(255,255,255,1)");
      g.addColorStop(5 / 14 / (1 + 2 * view.flare), rgba(tip.rgb, 0.9));
      g.addColorStop(1, rgba(tip.rgb, 0));
      ctx.fillStyle = g;
      ctx.globalAlpha =
        view.alpha * Math.min(1, 0.85 + 0.15 * view.flare + 0.15);
      ctx.beginPath();
      ctx.arc(head.x, head.y, halo, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = view.alpha;

      if (view.sparks && moving && state.random() < 0.6) {
        if (state.sparks.length >= state.maxSparks) state.sparks.shift();
        const speed = (0.03 + state.random() * 0.06) * unitPx; // px per ms
        const jitter = (state.random() - 0.5) * 1.4;
        const c = Math.cos(jitter);
        const s = Math.sin(jitter);
        state.sparks.push({
          x: head.x,
          y: head.y,
          vx: (head.tx * c - head.ty * s) * speed,
          vy: (head.tx * s + head.ty * c) * speed,
          born: now,
          life: SPARK_MS * (0.7 + state.random() * 0.6),
          r: (0.8 + state.random() * 1.2) * unitPx,
          rgb: light ? [150, 134, 118] : tip.rgb,
        });
      }
    });
  }

  if (state.sparks.length) {
    const keep: Spark[] = [];
    for (const q of state.sparks) {
      const age = (now - q.born) / q.life;
      if (age >= 1 || age < 0) continue;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= 0.96;
      q.vy *= 0.96;
      ctx.fillStyle = rgba(q.rgb, 0.9 * (1 - age));
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r * (1 - age * 0.6), 0, Math.PI * 2);
      ctx.fill();
      keep.push(q);
    }
    state.sparks = keep;
  }
  ctx.restore();

  if (view.fontFamily)
    drawLetters(ctx, prepared, traced, now, dt, view, state);
}

/**
 * Fits a row of glyphs (widths measured at `fontPx`) under the mandala: never
 * wider than the mandala or the screen. A long row first shrinks, down to
 * MIN_LETTER_SCALE of the layout's size; past that it keeps that size and
 * shows a window that centres `focus` (a glyph index) and stops at the ends.
 */
export function fitLetterRow(
  widths: readonly number[],
  gapEm: number,
  focus: number,
  layout: OvertureLayout,
  screenWidth: number
): {
  fontPx: number;
  widths: number[];
  gap: number;
  total: number;
  maxWidth: number;
  target: number;
} {
  const maxWidth = Math.max(
    0,
    Math.min(layout.size, screenWidth - 2 * layout.fontPx)
  );
  const natural =
    widths.reduce((sum, w) => sum + w, 0) +
    gapEm * layout.fontPx * Math.max(0, widths.length - 1);
  const scale =
    natural > maxWidth && natural > 0
      ? Math.max(MIN_LETTER_SCALE, maxWidth / natural)
      : 1;
  const fontPx = layout.fontPx * scale;
  const scaled = widths.map((w) => w * scale);
  const gap = gapEm * fontPx;
  const total = natural * scale;
  // How far the row slides left so the focus glyph's centre sits mid-window,
  // held between the row's two ends.
  let target = 0;
  if (total > maxWidth && scaled.length > 0) {
    const k = Math.max(0, Math.min(scaled.length - 1, focus));
    let centre = 0;
    for (let i = 0; i < k; i++) centre += scaled[i]! + gap;
    centre += scaled[k]! / 2;
    target = Math.max(0, Math.min(total - maxWidth, centre - maxWidth / 2));
  }
  return { fontPx, widths: scaled, gap, total, maxWidth, target };
}

/**
 * The crossings, as the app's mandalas draw them (mandala-renderer.ts): each
 * hand's crisp strokes on their own mask, the masks intersected, and that
 * intersection laid over the strokes in the two colours' mix. Without it the
 * right hand, drawn last, covers every crossing in its own colour.
 */
function drawOverlap(
  ctx: OvertureContext,
  prepared: PreparedScene,
  ends: TracePoint[],
  layers: OvertureOverlapLayers,
  stage: (target: OvertureContext) => void,
  unitPx: number,
  view: FrameView
): void {
  let left = false;
  let right = false;
  for (const tip of prepared.tips) {
    if (tip.hand === "left") left = true;
    else right = true;
  }
  if (!left || !right) return;
  for (const layer of [layers.left, layers.right]) {
    const mask = layer.ctx;
    mask.setTransform(1, 0, 0, 1, 0, 0);
    mask.globalCompositeOperation = "source-over";
    mask.globalAlpha = 1;
    mask.clearRect(0, 0, layers.width, layers.height);
    stage(mask);
    mask.lineWidth = 2 * unitPx;
    mask.strokeStyle = "#000";
  }
  prepared.tips.forEach((tip, k) => {
    const mask = tip.hand === "left" ? layers.left.ctx : layers.right.ctx;
    tracePolyline(mask, tip, ends[k]!);
    mask.stroke();
  });
  // The compositor takes real canvas contexts; these layers are the worker's
  // OffscreenCanvases (or a test's stand-ins) and carry the members it uses.
  compositeMandalaOverlap({
    targetContext: ctx as unknown as OffscreenCanvasRenderingContext2D,
    overlapMaskContext: layers.left
      .ctx as unknown as OffscreenCanvasRenderingContext2D,
    overlapMaskCanvas: layers.left.canvas as OffscreenCanvas,
    otherMaskCanvas: layers.right.canvas as OffscreenCanvas,
    width: layers.width,
    height: layers.height,
    color: prepared.overlap,
    alpha: view.alpha,
  });
}

/**
 * The letter row: the simplified word only, fitted by fitLetterRow. A row
 * too long to fit slides so the beat being traced stays in view, its cut
 * ends fading out. During the first repetition a
 * slot fades in when its beat finishes tracing; on later repetitions the
 * slot of the beat being traced pulses once and a count (×2, ×3, …) reads
 * which repetition is being drawn.
 */
function drawLetters(
  ctx: OvertureContext,
  prepared: PreparedScene,
  traced: number,
  now: number,
  dt: number,
  view: FrameView,
  state: FrameState
): void {
  const { scene, slots } = prepared;
  const { beats, unit } = scene;
  const done = view.lettersStill ? beats : Math.floor(traced * beats + 1e-9);
  const beat = view.lettersStill ? beats : Math.min(beats - 1, done);
  const repeat = Math.floor(beat / unit);

  if (beat !== state.beat) {
    if (beat > state.beat && repeat >= 1 && done < beats) {
      state.pulseAt[beat % unit] = now;
    }
    state.beat = beat;
  }

  const light = view.surface === "light";
  const { layout } = view;
  ctx.save();
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.font = `${layout.fontPx}px ${view.fontFamily}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = light ? "rgba(255,255,255,0.95)" : "rgba(10,10,26,0.95)";
  ctx.shadowBlur = light ? 8 : 12;

  // The beat being traced keeps the window; reduced motion shows the start.
  const focus = view.lettersStill ? 0 : beat % unit;
  const fit = fitLetterRow(
    slots.map((glyph) => ctx.measureText(glyph).width),
    0.12,
    focus,
    layout,
    view.width
  );
  const { widths, gap, total, maxWidth } = fit;
  const windowed = total > maxWidth;
  if (fit.fontPx !== layout.fontPx) {
    ctx.font = `${fit.fontPx}px ${view.fontFamily}`;
  }
  if (!windowed || view.lettersStill || !Number.isFinite(state.rowShift)) {
    state.rowShift = fit.target;
  } else {
    state.rowShift +=
      (fit.target - state.rowShift) * (1 - Math.exp(-dt / ROW_SLIDE_MS));
  }
  const shown = Math.min(total, maxWidth);
  const left = layout.cx - shown / 2;
  const right = left + shown;
  let x = left - (windowed ? state.rowShift : 0);
  // Soft edges on a windowed row, only where letters run past them.
  const edge = fit.fontPx * 1.6;
  const fadeLeft = windowed && state.rowShift > 0.5;
  const fadeRight = windowed && state.rowShift < total - maxWidth - 0.5;
  const glyphRgb = light ? [30, 34, 53] : [255, 255, 255];

  for (let k = 0; k < slots.length; k++) {
    const w = widths[k]!;
    const lit = view.lettersStill || done >= k + 1;
    if (lit) {
      if (state.litAt[k] === undefined)
        state.litAt[k] = view.lettersStill ? now - FADE_MS : now;
    }
    const inside = x + w > left && x < right;
    if (lit && inside) {
      let reach = 1;
      if (windowed) {
        const mid = x + w / 2;
        if (fadeLeft) reach = Math.min(reach, (mid - left) / edge);
        if (fadeRight) reach = Math.min(reach, (right - mid) / edge);
        reach = Math.max(0, Math.min(1, reach));
      }
      const fade = Math.min(1, (now - state.litAt[k]!) / FADE_MS) * reach;
      const pulseStart = state.pulseAt[k];
      const pulse =
        pulseStart === undefined || now - pulseStart >= FADE_MS
          ? 0
          : Math.sin((Math.PI * (now - pulseStart)) / FADE_MS);
      if (reach > 0) {
        ctx.globalAlpha = view.alpha * fade;
        ctx.fillStyle = rgba(glyphRgb, 0.92);
        ctx.fillText(slots[k]!, x, layout.lettersY);
        if (pulse > 0) {
          // Brightness 1 → 1.5 → 1: a second, glowing pass on top.
          ctx.globalAlpha = view.alpha * fade * pulse;
          ctx.shadowColor = light
            ? "rgba(99,102,241,0.6)"
            : "rgba(255,255,255,0.9)";
          ctx.fillText(slots[k]!, x, layout.lettersY);
          ctx.shadowColor = light
            ? "rgba(255,255,255,0.95)"
            : "rgba(10,10,26,0.95)";
        }
      }
    }
    x += w + gap;
  }

  if (unit < beats && repeat >= 1) {
    const count = view.lettersStill ? Math.round(beats / unit) : repeat + 1;
    ctx.globalAlpha = view.alpha * 0.72;
    ctx.font = `600 ${Math.round(layout.fontPx * 0.62)}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = rgba(glyphRgb, 0.9);
    ctx.fillText(`×${count}`, right + layout.fontPx * 0.4, layout.lettersY);
  }
  ctx.restore();
}
