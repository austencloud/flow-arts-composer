import { boxAt, itemEnd, type PostBox } from "@austencloud/video-editor/core";
import type { PostFlashItem } from "#lib/shared/post-studio-plugin/index.js";

/**
 * A flash clip: a camera flash on a hit, with four corner marks that pop in
 * around something worth a screenshot (a QR code at the end of a reel). The
 * clip's start is the hit. A white veil covers the whole frame at the clip's
 * strength on its first frame and dies away over its fade; the marks sit at
 * the corners of the clip's box from the first frame to the last.
 *
 * Everything here is a function of post time alone, so a paused frame in the
 * preview is the frame the export writes.
 */

/** How bright the veil starts, as a share of full white. */
export const FLASH_DEFAULT_STRENGTH = 0.22;
export const FLASH_MIN_STRENGTH = 0;
export const FLASH_MAX_STRENGTH = 1;
/** Seconds until the veil is gone to the eye. */
export const FLASH_DEFAULT_FADE_SECONDS = 0.4;
export const FLASH_MIN_FADE_SECONDS = 0.05;
export const FLASH_MAX_FADE_SECONDS = 5;
/** How long a flash clip from the Add menu lasts. */
export const FLASH_ITEM_SECONDS = 3;
/** The Add menu's square box, as a share of the frame's shorter side. */
export const FLASH_SQUARE_SHARE = 0.6;
/** Each corner mark's arm, as a share of the box's shorter side. */
export const FLASH_MARK_ARM_SHARE = 0.12;
/** The marks' line, as a share of the frame's width. */
export const FLASH_MARK_LINE_SHARE = 0.006;
/**
 * How quickly the veil falls away. Higher drops faster at first and leaves a
 * longer faint tail, as a camera flash does.
 */
const FLASH_DECAY_SHARPNESS = 5;

/**
 * The veil's strength `secondsIn` after the hit: `strength` on the first
 * frame, falling off fast and then slowly, and exactly nothing from `fade`
 * on. Before the hit there is no veil.
 */
export function flashVeilStrength(
  secondsIn: number,
  strength: number,
  fade: number
): number {
  if (!Number.isFinite(secondsIn) || secondsIn < 0) return 0;
  if (!(strength > 0) || !(fade > 0)) return 0;
  const progress = secondsIn / fade;
  if (progress >= 1) return 0;
  // An exponential fall, pulled down so it lands on zero at `fade` instead of
  // leaving a faint white that never quite goes.
  const tail = Math.exp(-FLASH_DECAY_SHARPNESS);
  const fall =
    (Math.exp(-FLASH_DECAY_SHARPNESS * progress) - tail) / (1 - tail);
  return Math.min(1, strength) * fall;
}

/**
 * How far the frame reaches past the clip's box on each side, as a share of
 * the box's own width or height, at whichever of the box's positions reaches
 * furthest. The painter asks the editor for that much room so the veil can
 * cover the whole frame while the box says where the marks go. Between two
 * keyframes the reach moves steadily from one end to the other, so checking
 * the box and its keys is enough.
 */
export interface FlashReach {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function flashReach(boxes: readonly PostBox[]): FlashReach {
  const reach: FlashReach = { left: 0, top: 0, right: 0, bottom: 0 };
  for (const box of boxes) {
    if (!(box.width > 0) || !(box.height > 0)) continue;
    reach.left = Math.max(reach.left, box.x / box.width);
    reach.top = Math.max(reach.top, box.y / box.height);
    reach.right = Math.max(reach.right, (1 - box.x - box.width) / box.width);
    reach.bottom = Math.max(
      reach.bottom,
      (1 - box.y - box.height) / box.height
    );
  }
  return reach;
}

/** What a flash clip draws, for `flash-painter.ts`. */
export interface FlashPlan {
  itemId: string;
  /** The role its painted layer draws under. */
  role: string;
  /** Post seconds of the hit, which is the clip's start. */
  start: number;
  /** Post seconds the clip ends. */
  end: number;
  strength: number;
  fade: number;
  marks: boolean;
  /** Room the veil needs past the box; see `flashReach`. */
  reach: FlashReach;
  /** The clip itself, whose box (keyframes included) places the marks. */
  item: PostFlashItem;
}

/** A flash clip's box at a post second, keyframes included. */
export function flashBoxAt(plan: FlashPlan, seconds: number): PostBox {
  return boxAt(plan.item, seconds);
}

export function flashPlanOf(item: PostFlashItem, role: string): FlashPlan {
  const keyed = (item.keyframes?.box ?? []).map((key) => key.value);
  return {
    itemId: item.id,
    role,
    start: item.start,
    end: itemEnd(item),
    strength: item.strength,
    fade: item.fade,
    marks: item.marks,
    reach: flashReach([item.box, ...keyed]),
    item,
  };
}

/**
 * A centred square box in a frame of this size: `FLASH_SQUARE_SHARE` of the
 * frame's shorter side, as shares of the frame's width and height.
 */
export function flashSquareBox(output: {
  width: number;
  height: number;
}): PostBox {
  const side = FLASH_SQUARE_SHARE * Math.min(output.width, output.height);
  const width = side / output.width;
  const height = side / output.height;
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height };
}

/** A rect in canvas pixels. */
export interface FlashRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The whole frame in the same pixels as `rect`, the box's own rect: the box
 * is a known share of the frame, so the frame follows from it.
 */
export function flashFrameRect(rect: FlashRect, box: PostBox): FlashRect {
  const width = rect.width / box.width;
  const height = rect.height / box.height;
  return {
    x: rect.x - box.x * width,
    y: rect.y - box.y * height,
    width,
    height,
  };
}

/** One corner mark: an L from `arm` through `corner` to `arm2`. */
export interface FlashMark {
  from: { x: number; y: number };
  corner: { x: number; y: number };
  to: { x: number; y: number };
}

/**
 * The four corner marks of a box, and their line width, in the box rect's
 * pixels. Each mark is pulled in by half its line, so the stroke stays inside
 * the box.
 */
export function flashMarks(
  rect: FlashRect,
  frameWidth: number
): { marks: FlashMark[]; lineWidth: number } {
  const lineWidth = FLASH_MARK_LINE_SHARE * frameWidth;
  const arm = FLASH_MARK_ARM_SHARE * Math.min(rect.width, rect.height);
  const inset = lineWidth / 2;
  const left = rect.x + inset;
  const right = rect.x + rect.width - inset;
  const top = rect.y + inset;
  const bottom = rect.y + rect.height - inset;
  const mark = (x: number, y: number, dx: number, dy: number): FlashMark => ({
    from: { x, y: y + dy * arm },
    corner: { x, y },
    to: { x: x + dx * arm, y },
  });
  return {
    marks: [
      mark(left, top, 1, 1),
      mark(right, top, -1, 1),
      mark(right, bottom, -1, -1),
      mark(left, bottom, 1, -1),
    ],
    lineWidth,
  };
}
