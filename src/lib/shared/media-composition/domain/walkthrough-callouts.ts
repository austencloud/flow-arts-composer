import {
  CALLOUT_LINE_HEIGHT,
  CALLOUT_PAD_X,
  CALLOUT_PAD_Y,
  CALLOUT_SIZE_FRACTION,
} from "#lib/shared/media-composition/domain/callout-layout.js";
import { wrapCaptionText } from "#lib/shared/media-composition/domain/caption-layout.js";
import type { PostTextSize } from "#lib/shared/media-composition/domain/post-project.js";
import type {
  CameraMove,
  SharePoint,
  ShareRect,
} from "#lib/shared/media-composition/domain/walkthrough-camera.js";

/**
 * Where and when each walkthrough bubble shows. Boxes are shares of the
 * output frame; lengths are pixels at a 1080-pixel frame height, like the
 * callout plate's own (`callout-layout.ts`).
 */

/** An average glyph's width for the bubble's semibold system font, in ems. */
const GLYPH_EM = 0.55;
/** A bubble is at most this share of the frame wide. */
const MAX_WIDTH_SHARE = 0.36;
const MIN_WIDTH = 160;
/** The estimate sizes the box for at most this many lines; the painter shrinks the rest. */
const MAX_LINES = 3;
/** From the target box to the bubble. */
const GAP = 34;
/** The bubble stays this far inside the frame. */
const MARGIN = 24;
/** A bubble ends this long before the next line or camera move. */
export const BUBBLE_LEAD_OUT = 0.1;
/** Shorter than this, a bubble is hard to read (the promo renderer's floor). */
export const BUBBLE_MIN_READ_SECONDS = 1.6;
/** Shorter than this, a bubble is dropped. */
export const BUBBLE_MIN_SECONDS = 0.5;
const REFERENCE_HEIGHT = 1080;

interface FrameSize {
  width: number;
  height: number;
}

/** A stable id from the placeholder words, so a rebuild finds Austen's typed text. */
export function bubbleId(text: string): string {
  const slug = text
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 6)
    .join("-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .replace(/-$/, "");
  // FNV-1a, so two lines that start alike still get their own ids.
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const tag = hash.toString(16).padStart(8, "0").slice(0, 6);
  return `bubble-${slug ? `${slug}-` : ""}${tag}`;
}

/** The bubble's box for its words, from an average glyph width. */
export function bubbleSize(
  text: string,
  size: PostTextSize,
  frame: FrameSize
): { width: number; height: number } {
  const unit = frame.height / REFERENCE_HEIGHT;
  const fontPx = CALLOUT_SIZE_FRACTION[size] * frame.height;
  const padX = CALLOUT_PAD_X * unit;
  const padY = CALLOUT_PAD_Y * unit;
  const maxWidth = MAX_WIDTH_SHARE * frame.width;
  const measure = (line: string) => line.length * GLYPH_EM * fontPx;
  const lines = wrapCaptionText(text, measure, maxWidth - 2 * padX);
  const widest = Math.max(0, ...lines.map(measure));
  const width = Math.min(
    maxWidth,
    Math.max(MIN_WIDTH * unit, widest + 2 * padX)
  );
  const rows = Math.min(MAX_LINES, Math.max(1, lines.length));
  const height = rows * CALLOUT_LINE_HEIGHT * fontPx + 2 * padY;
  return { width: width / frame.width, height: height / frame.height };
}

function overlaps(a: ShareRect, b: ShareRect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

/**
 * The bubble's box beside its target: above, below, right, then left, the
 * first spot inside the frame's margin that covers none of `avoid`. Across
 * the target it follows the pointer, then is clamped into the frame.
 */
export function placeBubble(
  size: { width: number; height: number },
  target: ShareRect,
  avoid: readonly ShareRect[],
  point: SharePoint,
  frame: FrameSize
): { box: ShareRect; placed: boolean } {
  const unit = frame.height / REFERENCE_HEIGHT;
  const gapX = (GAP * unit) / frame.width;
  const gapY = (GAP * unit) / frame.height;
  const marginX = (MARGIN * unit) / frame.width;
  const marginY = (MARGIN * unit) / frame.height;
  const { width, height } = size;
  const across = (centre: number, extent: number, margin: number) =>
    Math.min(1 - margin - extent, Math.max(margin, centre - extent / 2));
  const x = across(point.x, width, marginX);
  const y = across(point.y, height, marginY);
  const spots: ShareRect[] = [
    { x, y: target.y - gapY - height, width, height },
    { x, y: target.y + target.height + gapY, width, height },
    { x: target.x + target.width + gapX, y, width, height },
    { x: target.x - gapX - width, y, width, height },
  ];
  const inside = (box: ShareRect) =>
    box.x >= marginX - 1e-9 &&
    box.y >= marginY - 1e-9 &&
    box.x + box.width <= 1 - marginX + 1e-9 &&
    box.y + box.height <= 1 - marginY + 1e-9;
  const spot = spots.find(
    (box) => inside(box) && !avoid.some((rect) => overlaps(box, rect))
  );
  if (spot) return { box: spot, placed: true };
  const below = spots[1]!;
  return {
    box: {
      ...below,
      y: Math.min(1 - marginY - height, Math.max(marginY, below.y)),
    },
    placed: false,
  };
}

/**
 * When a bubble shows, in take seconds: from its line, or the end of a move
 * under way then, to just before the next line, the next move or the end.
 */
export function bubbleSpan(
  lineTime: number,
  nextLineTime: number,
  moves: readonly CameraMove[],
  end: number
): { start: number; end: number } {
  let start = lineTime;
  for (const move of moves) {
    if (move.start <= start && start < move.end) start = move.end;
  }
  const nextMove = moves.find((move) => move.start >= start);
  const stop =
    Math.min(nextLineTime, nextMove?.start ?? Infinity, end) - BUBBLE_LEAD_OUT;
  return { start, end: stop };
}
