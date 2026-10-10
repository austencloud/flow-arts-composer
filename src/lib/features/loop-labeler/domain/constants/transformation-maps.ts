/**
 * Position transformation maps for LOOP detection.
 * These define how grid positions transform under various geometric operations.
 */

/** 180° rotation: positions swap to opposite side */
export const ROTATE_180: Record<string, string> = {
  n: "s",
  s: "n",
  e: "w",
  w: "e",
  ne: "sw",
  sw: "ne",
  nw: "se",
  se: "nw",
};

/** 90° counter-clockwise rotation */
export const ROTATE_90_CCW: Record<string, string> = {
  n: "w",
  w: "s",
  s: "e",
  e: "n",
  ne: "nw",
  nw: "sw",
  sw: "se",
  se: "ne",
};

/** 90° clockwise rotation */
export const ROTATE_90_CW: Record<string, string> = {
  n: "e",
  e: "s",
  s: "w",
  w: "n",
  ne: "se",
  se: "sw",
  sw: "nw",
  nw: "ne",
};

/**
 * Mirror across vertical axis (left/right swap).
 *
 * Owned by the shared geometry module and re-exported here so the existing
 * loop-labeler callers keep their import path.
 */
export { MIRROR_VERTICAL } from "#lib/shared/pictograph/shared/domain/geometry/mirror-vertical.js";

/** Flip across horizontal axis (top/bottom swap) */
export const FLIP_HORIZONTAL: Record<string, string> = {
  n: "s",
  s: "n",
  e: "e",
  w: "w",
  ne: "se",
  se: "ne",
  nw: "sw",
  sw: "nw",
};
