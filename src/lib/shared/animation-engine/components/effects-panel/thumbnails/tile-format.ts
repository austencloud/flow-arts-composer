/**
 * The three sizes an effect picture is painted for.
 *
 * - card: 720x270, shown at about 304x114 and larger. The look cards.
 * - tile: 8:3 like the card, shown at about 74x27 (phone list) and 88x32
 *   (desktop panel tiles). Backing store 240x90, about three times display.
 * - chip: 3:2, shown at 29x20 (the Effects button) and about 30x20 (the rail
 *   item). Backing store 96x64.
 *
 * A painter keeps composing in card coordinates (720x270). In a small format
 * it calls `frame()` first, which maps a box of the card around its subject
 * onto the small canvas, so nothing else in the painter changes and the
 * subject fills the frame. The painter's own bold branch (fewer, larger,
 * brighter marks) is what makes the picture read at that size; framing alone
 * only enlarges it.
 */
import { TILE_H, TILE_W } from "./tile-paint";

export type TileFormat = "card" | "tile" | "chip";

export const TILE_FORMAT_SIZE: Record<TileFormat, { w: number; h: number }> = {
  card: { w: TILE_W, h: TILE_H },
  tile: { w: 240, h: 90 },
  chip: { w: 96, h: 64 },
};

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function isSmall(format: TileFormat): boolean {
  return format !== "card";
}

/** What a painter may say about its subject in each small format. */
export type SubjectBoxes = Partial<Record<Exclude<TileFormat, "card">, Box>>;

/**
 * Grow a subject box to the format's aspect, centred, with `pad` of room on
 * the limiting side. Boxes may reach outside the card: the ground fills
 * beyond it.
 */
export function fitView(subject: Box, format: TileFormat, pad = 0.08): Box {
  const { w, h } = TILE_FORMAT_SIZE[format];
  const aspect = w / h;
  let bw = subject.w * (1 + pad * 2);
  let bh = subject.h * (1 + pad * 2);
  if (bw / bh > aspect) bh = bw / aspect;
  else bw = bh * aspect;
  return {
    x: subject.x + subject.w / 2 - bw / 2,
    y: subject.y + subject.h / 2 - bh / 2,
    w: bw,
    h: bh,
  };
}

/**
 * Map the subject onto the canvas. Card format is left as it is. Call before
 * painting; the transform stays until the painter's caller discards the
 * canvas, and painters must use save/transform/restore, never an absolute
 * setTransform, so it survives.
 */
export function frame(
  ctx: CanvasRenderingContext2D,
  format: TileFormat,
  subject?: Box,
  pad?: number
): Box {
  const { w, h } = TILE_FORMAT_SIZE[format];
  if (format === "card" || !subject) {
    return { x: 0, y: 0, w: TILE_W, h: TILE_H };
  }
  const view = fitView(subject, format, pad);
  const s = w / view.w;
  ctx.setTransform(s, 0, 0, s, -view.x * s, -view.y * s);
  return view;
}

/**
 * Card-space size of one display pixel in a format, for line weights: a mark
 * that must be 1.5px at display needs `1.5 * unitsPerPx`. Uses the view the
 * painter framed to.
 */
export function unitsPerBackingPx(view: Box, format: TileFormat): number {
  return view.w / TILE_FORMAT_SIZE[format].w;
}

/** Display widths the small formats are painted for (CSS px). */
export const DISPLAY_W = { tile: 74, chip: 29 } as const;

/**
 * Card-space units per display pixel for a framed view. A mark meant to be
 * 1.5px at display is `1.5 * unitsPerDisplayPx(view, format)` wide.
 */
export function unitsPerDisplayPx(
  view: Box,
  format: Exclude<TileFormat, "card">
): number {
  return view.w / DISPLAY_W[format];
}
