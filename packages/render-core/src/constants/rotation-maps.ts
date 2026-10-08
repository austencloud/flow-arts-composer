/**
 * Prop and arrow rotation angle maps
 *
 * Exact values from the original PropRotAngleManager.ts and ProAntiRotationMaps.ts
 */

import type { GridLocation, Orientation } from "../types.js";

/**
 * Diamond grid rotation angles by orientation and location
 */
export const DIAMOND_PROP_ANGLES: Record<
  Orientation,
  Record<GridLocation, number>
> = {
  in: {
    n: 90,
    s: 270,
    w: 0,
    e: 180,
    ne: 0,
    se: 0,
    sw: 0,
    nw: 0,
    c: 0,
  },
  out: {
    n: 270,
    s: 90,
    w: 180,
    e: 0,
    ne: 0,
    se: 0,
    sw: 0,
    nw: 0,
    c: 0,
  },
  clock: {
    n: 0,
    s: 180,
    w: 270,
    e: 90,
    ne: 0,
    se: 0,
    sw: 0,
    nw: 0,
    c: 0,
  },
  counter: {
    n: 180,
    s: 0,
    w: 90,
    e: 270,
    ne: 0,
    se: 0,
    sw: 0,
    nw: 0,
    c: 0,
  },
  // Interradial orientations (Level 4)
  clockIn: {
    n: 45,
    s: 225,
    w: 315,
    e: 135,
    ne: 0,
    se: 0,
    sw: 0,
    nw: 0,
    c: 0,
  },
  clockOut: {
    n: 315,
    s: 135,
    w: 225,
    e: 45,
    ne: 0,
    se: 0,
    sw: 0,
    nw: 0,
    c: 0,
  },
  counterIn: {
    n: 135,
    s: 315,
    w: 45,
    e: 225,
    ne: 0,
    se: 0,
    sw: 0,
    nw: 0,
    c: 0,
  },
  counterOut: {
    n: 225,
    s: 45,
    w: 135,
    e: 315,
    ne: 0,
    se: 0,
    sw: 0,
    nw: 0,
    c: 0,
  },
  // Centric orientations (Level 6 - prop at center, pointing toward compass direction)
  // SVG convention: 0=east, 90=south, 180=west, 270=north (clockwise)
  centerN: { n: 0, s: 0, w: 0, e: 0, ne: 0, se: 0, sw: 0, nw: 0, c: 270 },
  centerNE: { n: 0, s: 0, w: 0, e: 0, ne: 0, se: 0, sw: 0, nw: 0, c: 315 },
  centerE: { n: 0, s: 0, w: 0, e: 0, ne: 0, se: 0, sw: 0, nw: 0, c: 0 },
  centerSE: { n: 0, s: 0, w: 0, e: 0, ne: 0, se: 0, sw: 0, nw: 0, c: 45 },
  centerS: { n: 0, s: 0, w: 0, e: 0, ne: 0, se: 0, sw: 0, nw: 0, c: 90 },
  centerSW: { n: 0, s: 0, w: 0, e: 0, ne: 0, se: 0, sw: 0, nw: 0, c: 135 },
  centerW: { n: 0, s: 0, w: 0, e: 0, ne: 0, se: 0, sw: 0, nw: 0, c: 180 },
  centerNW: { n: 0, s: 0, w: 0, e: 0, ne: 0, se: 0, sw: 0, nw: 0, c: 225 },
};

/**
 * Box grid rotation angles by orientation and location
 */
export const BOX_PROP_ANGLES: Record<
  Orientation,
  Record<GridLocation, number>
> = {
  in: {
    ne: 135,
    nw: 45,
    sw: 315,
    se: 225,
    n: 0,
    s: 0,
    e: 0,
    w: 0,
    c: 0,
  },
  out: {
    ne: 315,
    nw: 225,
    sw: 135,
    se: 45,
    n: 0,
    s: 0,
    e: 0,
    w: 0,
    c: 0,
  },
  clock: {
    ne: 45,
    nw: 315,
    sw: 225,
    se: 135,
    n: 0,
    s: 0,
    e: 0,
    w: 0,
    c: 0,
  },
  counter: {
    ne: 225,
    nw: 135,
    sw: 45,
    se: 315,
    n: 0,
    s: 0,
    e: 0,
    w: 0,
    c: 0,
  },
  // Interradial orientations (Level 4)
  clockIn: {
    ne: 90,
    nw: 0,
    sw: 270,
    se: 180,
    n: 0,
    s: 0,
    e: 0,
    w: 0,
    c: 0,
  },
  clockOut: {
    ne: 0,
    nw: 270,
    sw: 180,
    se: 90,
    n: 0,
    s: 0,
    e: 0,
    w: 0,
    c: 0,
  },
  counterIn: {
    ne: 180,
    nw: 90,
    sw: 0,
    se: 270,
    n: 0,
    s: 0,
    e: 0,
    w: 0,
    c: 0,
  },
  counterOut: {
    ne: 270,
    nw: 180,
    sw: 90,
    se: 0,
    n: 0,
    s: 0,
    e: 0,
    w: 0,
    c: 0,
  },
  // Centric orientations (Level 6 - prop at center, pointing toward compass direction)
  // SVG convention: 0=east, 90=south, 180=west, 270=north (clockwise)
  centerN: { n: 0, s: 0, w: 0, e: 0, ne: 0, se: 0, sw: 0, nw: 0, c: 270 },
  centerNE: { n: 0, s: 0, w: 0, e: 0, ne: 0, se: 0, sw: 0, nw: 0, c: 315 },
  centerE: { n: 0, s: 0, w: 0, e: 0, ne: 0, se: 0, sw: 0, nw: 0, c: 0 },
  centerSE: { n: 0, s: 0, w: 0, e: 0, ne: 0, se: 0, sw: 0, nw: 0, c: 45 },
  centerS: { n: 0, s: 0, w: 0, e: 0, ne: 0, se: 0, sw: 0, nw: 0, c: 90 },
  centerSW: { n: 0, s: 0, w: 0, e: 0, ne: 0, se: 0, sw: 0, nw: 0, c: 135 },
  centerW: { n: 0, s: 0, w: 0, e: 0, ne: 0, se: 0, sw: 0, nw: 0, c: 180 },
  centerNW: { n: 0, s: 0, w: 0, e: 0, ne: 0, se: 0, sw: 0, nw: 0, c: 225 },
};

/**
 * PRO rotation maps
 */
export const PRO_CLOCKWISE_MAP: Record<GridLocation, number> = {
  n: 315,
  e: 45,
  s: 135,
  w: 225,
  ne: 0,
  se: 90,
  sw: 180,
  nw: 270,
  c: 0,
};

export const PRO_COUNTER_CLOCKWISE_MAP: Record<GridLocation, number> = {
  n: 45,
  e: 135,
  s: 225,
  w: 315,
  ne: 90,
  se: 180,
  sw: 270,
  nw: 0,
  c: 0,
};

/**
 * ANTI rotation maps
 * ANTI clockwise = PRO counter-clockwise
 * ANTI counter-clockwise = PRO clockwise
 */
export const ANTI_CLOCKWISE_MAP: Record<GridLocation, number> = {
  n: 45,
  e: 135,
  s: 225,
  w: 315,
  ne: 90,
  se: 180,
  sw: 270,
  nw: 0,
  c: 0,
};

export const ANTI_COUNTER_CLOCKWISE_MAP: Record<GridLocation, number> = {
  n: 315,
  e: 45,
  s: 135,
  w: 225,
  ne: 0,
  se: 90,
  sw: 180,
  nw: 270,
  c: 0,
};

/**
 * STATIC rotation maps - radial (IN/OUT) orientations
 */
export const STATIC_RADIAL_CLOCKWISE_MAP: Record<GridLocation, number> = {
  n: 0,
  e: 90,
  s: 180,
  w: 270,
  ne: 45,
  se: 135,
  sw: 225,
  nw: 315,
  c: 0,
};

// The normal static rotation is location-based. Mirroring the SVG expresses
// CW versus CCW, so changing direction must not rotate the asset again.
export const STATIC_RADIAL_COUNTER_CLOCKWISE_MAP = STATIC_RADIAL_CLOCKWISE_MAP;

/**
 * STATIC rotation maps - non-radial (CLOCK/COUNTER) orientations
 */
export const STATIC_NON_RADIAL_CLOCKWISE_MAP: Record<GridLocation, number> = {
  n: 180,
  e: 270,
  s: 0,
  w: 90,
  ne: 225,
  se: 315,
  sw: 45,
  nw: 135,
  c: 0,
};

export const STATIC_NON_RADIAL_COUNTER_CLOCKWISE_MAP =
  STATIC_NON_RADIAL_CLOCKWISE_MAP;

/**
 * DASH rotation maps
 *
 * IMPORTANT: Both CW and CCW maps are IDENTICAL for dash arrows!
 * The rotation angle is based purely on the arrow's location (pointing outward).
 * The CW/CCW only affects mirroring, not the rotation angle itself.
 */
export const DASH_CLOCKWISE_MAP: Record<GridLocation, number> = {
  n: 0,
  e: 90,
  s: 180,
  w: 270,
  ne: 45,
  se: 135,
  sw: 225,
  nw: 315,
  c: 0,
};

export const DASH_COUNTER_CLOCKWISE_MAP: Record<GridLocation, number> = {
  n: 0,
  e: 90,
  s: 180,
  w: 270,
  ne: 45,
  se: 135,
  sw: 225,
  nw: 315,
  c: 0,
};

/**
 * DASH no-rotation map (special case for straight dashes)
 * Key format: "startLocation,endLocation" (lowercase)
 */
export const DASH_NO_ROTATION_MAP: Record<string, number> = {
  // Vertical dashes
  "n,s": 90,
  "s,n": 270,
  // Horizontal dashes
  "e,w": 180,
  "w,e": 0,
  // Diagonal dashes
  "se,nw": 225,
  "sw,ne": 315,
  "nw,se": 45,
  "ne,sw": 135,
};

/**
 * FLOAT rotation maps, chosen by the hand's path (start to end), not the
 * motion's rotation direction, as the app's float-rotation-maps do.
 */
export const FLOAT_CLOCKWISE_MAP: Record<GridLocation, number> = {
  n: 315,
  e: 45,
  s: 135,
  w: 225,
  ne: 0,
  se: 90,
  sw: 180,
  nw: 270,
  c: 0,
} as Record<GridLocation, number>;

export const FLOAT_COUNTER_CLOCKWISE_MAP: Record<GridLocation, number> = {
  n: 135,
  e: 225,
  s: 315,
  w: 45,
  ne: 180,
  se: 270,
  sw: 0,
  nw: 90,
  c: 0,
} as Record<GridLocation, number>;

/**
 * A static or dash arrow whose special placement sets a rotation override
 * flag uses these angles instead of its usual map. Static angles are keyed by
 * location, then by cw/ccw.
 */
export const STATIC_RADIAL_OVERRIDE_MAP: Record<string, { cw: number; ccw: number }> = {
  n: { cw: 180, ccw: 180 },
  e: { cw: 270, ccw: 270 },
  s: { cw: 0, ccw: 0 },
  w: { cw: 90, ccw: 90 },
  ne: { cw: 225, ccw: 225 },
  se: { cw: 315, ccw: 315 },
  sw: { cw: 45, ccw: 45 },
  nw: { cw: 135, ccw: 135 },
  c: { cw: 0, ccw: 0 },
};

export const STATIC_NON_RADIAL_OVERRIDE_MAP: Record<string, { cw: number; ccw: number }> = {
  n: { cw: 0, ccw: 0 },
  e: { cw: 90, ccw: 90 },
  s: { cw: 180, ccw: 180 },
  w: { cw: 270, ccw: 270 },
  ne: { cw: 45, ccw: 315 },
  se: { cw: 135, ccw: 225 },
  sw: { cw: 225, ccw: 135 },
  nw: { cw: 315, ccw: 45 },
  c: { cw: 0, ccw: 0 },
};

export const DASH_CLOCKWISE_OVERRIDE_MAP: Record<string, number> = {
  n: 270,
  e: 0,
  s: 90,
  w: 180,
  ne: 315,
  se: 45,
  sw: 135,
  nw: 225,
};

export const DASH_COUNTER_CLOCKWISE_OVERRIDE_MAP: Record<string, number> = {
  n: 90,
  e: 180,
  s: 270,
  w: 0,
  ne: 135,
  se: 225,
  sw: 315,
  nw: 45,
};
