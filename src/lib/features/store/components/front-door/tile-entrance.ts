// Entrance timing for the shop grid: each tile fades up a beat after the one
// before it. The motion itself is the shared `flyFade`; this file only decides
// how long each tile waits, so that rule can be tested without a browser.

/** Gap between consecutive tiles. */
export const TILE_STAGGER_MS = 45;
/** The wave stops growing here, so a long shelf never leaves tiles waiting. */
export const TILE_STAGGER_MAX_MS = 270;
/** Short rise, ~250 ms, per the shop transitions spec. */
export const TILE_ENTRANCE_MS = 250;
export const TILE_RISE_PX = 10;

/** Delay before tile `index` starts. Zero when the visitor asks for less motion. */
export function tileEntranceDelay(index: number, reduced: boolean): number {
  if (reduced || !Number.isFinite(index) || index <= 0) return 0;
  return Math.min(index * TILE_STAGGER_MS, TILE_STAGGER_MAX_MS);
}
