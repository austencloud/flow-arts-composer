/**
 * beat-carousel-layout.ts
 *
 * Pure geometry for the Post Studio breakdown carousel: a 580×500-ish region
 * that shows the current beat large, with upcoming (and, once under way,
 * trailing) beats visible beside it, sliding into focus as each beat lands.
 * No canvas, no DOM — `beat-carousel-painter.ts` draws what this returns, and
 * this same layout is what the unit tests assert against.
 *
 * Position convention (the evaluator's arrival-counted carousel position):
 * `[0,1)` focuses the opening pose; `[k, k+1)` focuses the landed beat k. A
 * continuous multi-pass take is wrapped by the evaluator so `(N, N+1]` reads
 * as move 1 of the next pass (index N+1 folds to beat 1, N+2 to beat 2, …).
 *
 * Spotlight sizing/opacity is NOT reimplemented here — `sizeAtDistance` and
 * `opacityAtDistance` call the continuous curves extracted from StepStrip
 * (`strip-window.ts`), so the carousel's neighbor treatment matches the
 * existing rail exactly instead of drifting from a second copy of the math.
 */

import {
  continuousCellOpacity,
  continuousCellScale,
  stripHeroScale,
} from "$lib/shared/timeline/strip-window";
import { clamp01, easeInOut } from "./frame-evaluator";

export interface BeatCarouselRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A cell's identity: the static start pose, or a 1-based beat number. */
export type BeatCarouselBeat = "start" | number;

export interface BeatCarouselCell {
  /** Raw walk index (can be negative or beyond beatCount; wraps via `beat`). */
  cellIndex: number;
  beat: BeatCarouselBeat;
  /** Cell center, in the same coordinate space as `rect`. */
  x: number;
  y: number;
  /** Cell edge length (cells are square). */
  size: number;
  opacity: number;
  isFocus: boolean;
}

export type BeatCarouselTickState = "landed" | "current" | "upcoming";

export interface BeatCarouselTick {
  /** 1-based beat number; ticks never represent the start pose. */
  beat: number;
  state: BeatCarouselTickState;
}

export interface BeatCarouselLayoutInput {
  rect: BeatCarouselRect;
  /** Arrival-counted carousel position (see file header). Clamped to ≥ 0. */
  position: number;
  beatCount: number;
  /** Fraction of rect width where the focus cell's center sits. */
  anchor?: number;
  /** Fraction of each `[k, k+1)` interval, at its tail, during which the
   *  track eases toward the next cell so it reaches focus exactly at the
   *  landing. */
  slideWindow?: number;
}

export interface BeatCarouselLayout {
  cells: BeatCarouselCell[];
  ticks: BeatCarouselTick[];
  /** The focus cell's edge length — exposed so a painter's `prepare()` can
   *  size its pictograph cache to match `layoutBeatCarousel`'s own geometry
   *  without recomputing (and risking drift from) this formula itself. */
  focusSize: number;
}

const GAP_RATIO = 0.06; // spec: "Gap: 6% of focus size"
const CAROUSEL_PRESENTATION = "spotlight" as const;

/**
 * Vertical strip reserved along the bottom of the rect for the beat-tick row.
 * No exact constant is specified by the design doc; this reserves a slim band
 * (8% of the box height, floored at 8px so it stays legible in a very short
 * box) — a judgment call, not a value pulled from the spec.
 */
export function beatCarouselTickRowHeight(rectHeight: number): number {
  return Math.max(8, rectHeight * 0.08);
}

/**
 * Focus cell edge length for a `{width, height}` box: `min(0.80 × usable
 * height, 0.62 × width)`, where usable height already excludes the reserved
 * tick row so the hero cell's own cushion never collides with it.
 */
export function beatCarouselFocusSize(target: {
  width: number;
  height: number;
}): number {
  const usableHeight = Math.max(
    0,
    target.height - beatCarouselTickRowHeight(target.height)
  );
  return Math.max(0, Math.min(0.8 * usableHeight, 0.62 * target.width));
}

/** Wraps any integer beat number into 1..beatCount (e.g. N+1 → 1, 0 → N). */
function wrapBeatNumber(rawBeat: number, beatCount: number): number {
  return ((((rawBeat - 1) % beatCount) + beatCount) % beatCount) + 1;
}

/**
 * Maps a raw walk index to the cell it identifies. Index 0 is the start pose
 * while `position < 1` only — once the sequence is under way there is no
 * start cell, so index 0 (and anything ≤ 0) wraps backward from beat N, same
 * as an index beyond beatCount wraps forward to beat 1.
 */
function beatForCellIndex(
  cellIndex: number,
  beatCount: number,
  position: number
): BeatCarouselBeat {
  if (cellIndex === 0 && position < 1) return "start";
  return wrapBeatNumber(cellIndex, beatCount);
}

/**
 * Eased focus track position. Holds at `floor(position)` for most of each
 * `[k, k+1)` interval, then eases toward `k+1` over the trailing
 * `slideWindow` fraction — so the next pose's cell reaches the focus anchor
 * exactly as `position` reaches `k+1`.
 */
function trackPosition(position: number, slideWindow: number): number {
  const base = Math.floor(position);
  const frac = position - base;
  const window = Math.max(1e-6, slideWindow);
  const t = clamp01((frac - (1 - window)) / window);
  return base + easeInOut(t);
}

/** Cell edge length at a continuous distance from the track (0 = focus). */
function sizeAtDistance(
  dist: number,
  focusSize: number,
  heroScale: number
): number {
  return (
    (focusSize * continuousCellScale(CAROUSEL_PRESENTATION, heroScale, dist)) /
    heroScale
  );
}

/** Beat-tick states, derived strictly from `position` (never a card's
 *  "pose just landed" `displayedBeatNumber`, which runs one beat behind). */
function beatTicks(beatCount: number, position: number): BeatCarouselTick[] {
  if (beatCount <= 0) return [];
  const currentBeat =
    position >= 1 ? wrapBeatNumber(Math.floor(position), beatCount) : null;
  const ticks: BeatCarouselTick[] = [];
  for (let beat = 1; beat <= beatCount; beat++) {
    const state: BeatCarouselTickState =
      currentBeat === null || beat > currentBeat
        ? "upcoming"
        : beat === currentBeat
          ? "current"
          : "landed";
    ticks.push({ beat, state });
  }
  return ticks;
}

/**
 * Lays out the beat carousel for one evaluated frame: which cells are visible
 * inside `rect`, their positions/sizes/opacities, and the tick row's states.
 * Pure function of its input — safe to call from a layout test, a live
 * preview repaint, or an export frame.
 */
export function layoutBeatCarousel(
  input: BeatCarouselLayoutInput
): BeatCarouselLayout {
  const { rect, beatCount } = input;
  const anchor = clamp01(input.anchor ?? 0.4);
  const slideWindow = clamp01(input.slideWindow ?? 0.18);
  const position = Number.isFinite(input.position)
    ? Math.max(0, input.position)
    : 0;

  const ticks = beatTicks(beatCount, position);
  const focusSize = beatCarouselFocusSize(rect);

  if (beatCount <= 0 || focusSize <= 0 || rect.width <= 0 || rect.height <= 0) {
    return { cells: [], ticks, focusSize: Math.max(0, focusSize) };
  }

  const heroScale = stripHeroScale(CAROUSEL_PRESENTATION, "standard");
  const gap = GAP_RATIO * focusSize;
  const track = trackPosition(position, slideWindow);
  const baseIndex = Math.floor(track);
  const slideFraction = track - baseIndex;
  const anchorX = rect.x + anchor * rect.width;
  const centerY =
    rect.y + (rect.height - beatCarouselTickRowHeight(rect.height)) / 2;

  const widthOf = (cellIndex: number) =>
    sizeAtDistance(Math.abs(cellIndex - track), focusSize, heroScale);

  const cells: BeatCarouselCell[] = [];
  const tryPush = (cellIndex: number, centerX: number, size: number) => {
    if (size <= 0 || cellIndex < 0) return;
    const left = centerX - size / 2;
    const right = centerX + size / 2;
    if (right < rect.x || left > rect.x + rect.width) return; // entirely outside
    cells.push({
      cellIndex,
      beat: beatForCellIndex(cellIndex, beatCount, position),
      x: centerX,
      y: centerY,
      size,
      opacity: continuousCellOpacity(
        CAROUSEL_PRESENTATION,
        Math.abs(cellIndex - track)
      ),
      isFocus: cellIndex === Math.round(track),
    });
  };

  const baseSize = widthOf(baseIndex);
  const nextSize = widthOf(baseIndex + 1);
  // Interpolate the center-to-center travel, so crossing the half-beat never
  // re-anchors the whole track on a different cell.
  const travel = baseSize / 2 + gap + nextSize / 2;
  const baseX = anchorX - slideFraction * travel;
  tryPush(baseIndex, baseX, baseSize);

  // Walk outward in both directions, packing cell centers edge-to-edge with a
  // constant gap; each cell's own width comes from its (continuous) distance
  // from the track. Real cells only ever sit at integer indices, so this
  // discrete walk is exact — no continuous integration is needed.
  let centerX = baseX;
  let prevSize = baseSize;
  for (let cellIndex = baseIndex; ; ) {
    const nextIndex = cellIndex + 1;
    const nextSize = widthOf(nextIndex);
    centerX += prevSize / 2 + gap + nextSize / 2;
    if (centerX - nextSize / 2 > rect.x + rect.width) break;
    tryPush(nextIndex, centerX, nextSize);
    prevSize = nextSize;
    cellIndex = nextIndex;
  }

  centerX = baseX;
  prevSize = baseSize;
  for (let cellIndex = baseIndex; cellIndex > 0; ) {
    const nextIndex = cellIndex - 1;
    const nextSize = widthOf(nextIndex);
    centerX -= prevSize / 2 + gap + nextSize / 2;
    if (centerX + nextSize / 2 < rect.x) break;
    tryPush(nextIndex, centerX, nextSize);
    prevSize = nextSize;
    cellIndex = nextIndex;
  }

  cells.sort((a, b) => a.cellIndex - b.cellIndex);
  return { cells, ticks, focusSize };
}
