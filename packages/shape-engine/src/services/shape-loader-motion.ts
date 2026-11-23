/**
 * Geometry and pre-hydration motion for the Shape Engine's loading drawing.
 *
 * The page's script can arrive seconds after its HTML on a cold visit, and
 * the drawing has to be moving the whole time. So the server-rendered SVG
 * carries CSS keyframes that follow the same creep as `loaderProgress`; once
 * the component mounts it reads how far those keyframes got and drives the
 * same picture from script, which is what lets it close on "ready".
 */
import { LOADER_FLOWERS, LOADER_HAND_RING } from "./shape-loader-flowers.js";
import { CREEP_CEILING, CREEP_PACE_MS } from "./shape-loader-progress.js";

/** Each grid flower takes this share of the drawing; starts are staggered along the diagonal. */
export const GRID_FLOWER_SPAN = 0.42;
/** How far the red hand trails the blue on the stage. */
export const STAGE_RED_LAG = 0.03;
/** The stage traces these two flowers: blue, then red mirrored. */
export const STAGE_FLOWERS = [1, 2] as const;

/** Where the keyframes stop. Reached after about seven and a half minutes. */
const KEYFRAME_CEILING = 0.895;

/** The clock time at which the creep reaches `p` (the inverse of the creep curve). */
export function creepClockMs(p: number): number {
  const x = p / (CREEP_CEILING - p);
  return (x * CREEP_PACE_MS) / 2;
}

const KEYFRAME_END_MS = creepClockMs(KEYFRAME_CEILING);

export function gridCellStart(row: number, col: number): number {
  return ((row + col - 1) / 7) * (1 - GRID_FLOWER_SPAN);
}

export function gridLocal(p: number, start: number): number {
  return Math.max(0, Math.min(1, (p - start) / GRID_FLOWER_SPAN));
}

export function stageUpTo(p: number, hand: 0 | 1): number {
  return Math.max(0, Math.min(1, p - (hand === 1 ? STAGE_RED_LAG : 0)));
}

function round(n: number): string {
  const s = (Math.round(n * 10000) / 10000).toString();
  return s === "-0" ? "0" : s;
}

/** SVG path data for a flower centred on (cx, cy). */
export function flowerPathD(index: number, cx: number, cy: number, scale: number, mirror: boolean): string {
  const points = LOADER_FLOWERS[index]!;
  const sx = mirror ? -scale : scale;
  let d = "";
  for (let i = 0; i < points.length; i += 2) {
    d += `${i === 0 ? "M" : "L"}${round(cx + points[i]! * sx)} ${round(cy + points[i + 1]! * scale)}`;
  }
  return d;
}

const cumulative = LOADER_FLOWERS.map((points) => {
  const out = [0];
  for (let i = 2; i < points.length; i += 2) {
    out.push(out.at(-1)! + Math.hypot(points[i]! - points[i - 2]!, points[i + 1]! - points[i - 1]!));
  }
  const total = out.at(-1)!;
  return out.map((v) => v / total);
});

/** The share of the flower's length drawn after `u` of its time. */
export function flowerLengthAt(index: number, u: number): number {
  const lengths = cumulative[index]!;
  const at = (lengths.length - 1) * Math.max(0, Math.min(1, u));
  const whole = Math.floor(at);
  if (whole >= lengths.length - 1) return 1;
  return lengths[whole]! + (lengths[whole + 1]! - lengths[whole]!) * (at - whole);
}

/** The tip's spot after `u` of the flower's time. */
export function flowerTipAt(index: number, u: number, mirror: boolean): [number, number] {
  const points = LOADER_FLOWERS[index]!;
  const last = points.length / 2 - 1;
  const at = last * Math.max(0, Math.min(1, u));
  const whole = Math.min(Math.floor(at), last - 1);
  const f = at - whole;
  const x = points[whole * 2]! + (points[whole * 2 + 2]! - points[whole * 2]!) * f;
  const y = points[whole * 2 + 1]! + (points[whole * 2 + 3]! - points[whole * 2 + 1]!) * f;
  return [mirror ? -x : x, y];
}

/** The hand's spot: from the bottom, once round, anticlockwise for blue. */
export function handAt(u: number, mirror: boolean): [number, number] {
  const turn = u * Math.PI * 2;
  return [(mirror ? 1 : -1) * Math.sin(turn) * LOADER_HAND_RING, Math.cos(turn) * LOADER_HAND_RING];
}

function keyframes(name: string, stops: number, frame: (p: number) => string): string {
  let body = "";
  for (let k = 0; k <= stops; k++) {
    const p = (k / stops) * KEYFRAME_CEILING;
    body += `${round((creepClockMs(p) / KEYFRAME_END_MS) * 100)}%{${frame(p)}}`;
  }
  return `@keyframes ${name}{${body}}`;
}

/** The CSS animation shorthand that plays one of these keyframes from first paint. */
export function loaderAnimation(name: string): string {
  return `${name} ${Math.round(KEYFRAME_END_MS)}ms linear forwards`;
}

/** Keyframes for the grid: one per diagonal, drawing by length. */
export function gridKeyframesCss(): string {
  let css = "";
  for (let d = 0; d <= 7; d++) {
    const start = (d / 7) * (1 - GRID_FLOWER_SPAN);
    css += keyframes(`shape-loader-g${d}`, 24, (p) => `stroke-dashoffset:${round(1 - gridLocal(p, start))}`);
  }
  return css;
}

/** Keyframes for the stage: each hand's trail, tip and hand, all on one clock. */
export function stageKeyframesCss(): string {
  let css = "";
  STAGE_FLOWERS.forEach((index, hand) => {
    const mirror = hand === 1;
    const side = hand as 0 | 1;
    css += keyframes(`shape-loader-s${hand}`, 72, (p) =>
      `stroke-dashoffset:${round(1 - flowerLengthAt(index, stageUpTo(p, side)))}`
    );
    css += keyframes(`shape-loader-t${hand}`, 72, (p) => {
      const [x, y] = flowerTipAt(index, stageUpTo(p, side), mirror);
      return `transform:translate(${round(x)}px,${round(y)}px)`;
    });
    css += keyframes(`shape-loader-h${hand}`, 72, (p) => {
      const [x, y] = handAt(stageUpTo(p, side), mirror);
      return `transform:translate(${round(x)}px,${round(y)}px)`;
    });
  });
  return css;
}
