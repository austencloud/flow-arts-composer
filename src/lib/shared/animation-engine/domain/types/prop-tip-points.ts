// src/lib/shared/animation-engine/domain/types/PropTipPoints.ts

/**
 * Unified Prop Tip Point Definitions
 *
 * Single source of truth for tip positions across all effects (fire, LED,
 * trails, charcoal). Coordinates are in prop-local space (same units as
 * PROP_DIMENSIONS):
 *   - dx: offset along prop primary axis from center
 *   - dy: offset perpendicular to prop axis
 *
 * Effect-specific scaling (flameScale, brightness, trailWidth) is NOT stored
 * here. Each effect renderer applies its own global scaling at read time.
 */

import {
  PROP_MODEL_SPRITES,
  type PropModelSpriteEntry,
} from "$lib/shared/pictograph/prop/domain/prop-model-sprites.generated";

/**
 * A single tip attachment point on a prop. Position only - no effect-specific
 * properties. All effects (fire, LED, trail, charcoal) emit from these same
 * positions.
 */
export interface TipPoint {
  /** Offset along prop primary axis from center (prop-dimension units) */
  dx: number;
  /** Offset perpendicular to prop axis from center (prop-dimension units) */
  dy: number;
}

/**
 * Tip point configuration for a prop type.
 */
export interface PropTipConfig {
  /** Tip attachment points in prop-local coordinates */
  points: TipPoint[];
}

export interface RadialPropGeometry {
  /** Canonical SVG coordinate space containing the artwork. */
  readonly viewBox: { readonly width: number; readonly height: number };
  /** Compass center in the canonical SVG viewBox. */
  readonly center: { readonly x: number; readonly y: number };
  /** Distance from the compass center to every tracked source. */
  readonly trackedRadius: number;
  /** Direction of the first source in SVG screen coordinates. */
  readonly phaseDegrees: number;
  /** Radius of the rounded terminal cap fitted from the SVG curves. */
  readonly capRadius: number;
}

function radialTipConfig(
  trackedRadius: number,
  phaseDegrees: number,
  count: number
): PropTipConfig {
  return {
    points: Array.from({ length: count }, (_, index) => {
      const radians = ((phaseDegrees + (360 / count) * index) * Math.PI) / 180;
      const dx = trackedRadius * Math.cos(radians);
      const dy = trackedRadius * Math.sin(radians);
      return {
        dx: Math.abs(dx) < 1e-12 ? 0 : dx,
        dy: Math.abs(dy) < 1e-12 ? 0 : dy,
      };
    }),
  };
}

// Bilateral — two mirror-symmetric ends, each ~126 from the pivot (the 252.8
// pictograph half-width), so the staff spans ~253 tip to tip.
const STAFF_TIP_POINTS: PropTipConfig = {
  points: [
    { dx: -126.4, dy: 0 },
    { dx: 126.4, dy: 0 },
  ],
};

// Bilateral. Sits slightly inside its viewBox edge, the same proportion it held
// before the pictograph convergence.
const SIMPLE_STAFF_TIP_POINTS: PropTipConfig = {
  points: [
    { dx: -113.76, dy: 0 },
    { dx: 113.76, dy: 0 },
  ],
};

const STAFF_V2_TIP_POINTS: PropTipConfig = {
  points: [
    { dx: -112.5, dy: 0 },
    { dx: 112.5, dy: 0 },
  ],
};

// Bilateral, and deliberately shorter than the 126.4 half-width its artwork
// spans. The tracked point on an LED baton is the light capsule inside the
// frosted cap, not the outer rim of the cap, so every emitter that reads this
// table (LED, fire, trails, charcoal, mandala) fires from the lit spot.
const CAPSULE_BATON_TIP_POINTS: PropTipConfig = {
  points: [
    { dx: -117, dy: 0 },
    { dx: 117, dy: 0 },
  ],
};

// Bilateral, and deliberately shorter than the 126.4 half-width its artwork
// spans. Fire comes off the middle of a monkey-fist wick, not off its far face,
// so every emitter that reads this table fires from where the fuel actually is.
const FIRE_DOUBLE_STAFF_TIP_POINTS: PropTipConfig = {
  points: [
    { dx: -114.7, dy: 0 },
    { dx: 114.7, dy: 0 },
  ],
};

const BIGSTAFF_TIP_POINTS: PropTipConfig = {
  points: [
    { dx: -300, dy: 0 },
    { dx: 300, dy: 0 },
  ],
};

// The regular club is center-pivoted inside a 258.67-unit viewBox. Using its
// exact half-width keeps the mandala and live trails on the resized visible tip.
// This is the reach every other regular prop is tuned against.
export const CLUB_TIP_REACH = 258.67 / 2;

const CLUB_TIP_POINTS: PropTipConfig = {
  points: [{ dx: CLUB_TIP_REACH, dy: 0 }],
};

// Big club is bilateral — two mirror-symmetric ends (Knob / Bulb). Prop width is
// 252 (PROP_DIMENSIONS), so each end sits ~126 from center. Matches the
// bigchicken pattern and the TWO_ENDED_PROPS set in prop-tip-ends.ts.
const BIGCLUB_TIP_POINTS: PropTipConfig = {
  points: [
    { dx: -125.79, dy: 0 },
    { dx: 125.79, dy: 0 },
  ],
};

export const FAN_TIP_POINTS: PropTipConfig = {
  points: [
    // The five visible outer-rim/rib intersections, on the 260 x 207
    // pictograph fan. The outer rib lands at 130 — the club's reach.
    { dx: 72.8, dy: -102.03 },
    { dx: 99.67, dy: -57.93 },
    { dx: 130, dy: 0 },
    { dx: 99.67, dy: 57.93 },
    { dx: 72.8, dy: 102.03 },
  ],
};

// Bigfan is separate artwork rather than a rescaled fan (600 x 566.9 against
// 260 x 207), so its points are measured against its own ribs instead of being
// scaled from fan's. The ribs sit at 61.2 / 32.7 / 0 degrees and the rim arc
// bulges outward with angle — 314.5 / 302 / 299.5 — so each tip is that local
// rim radius minus 2.5. The old ring put four of the five tips at bearings
// between the ribs, in the fan's open space, ~60 units short of the rim.
const BIGFAN_TIP_POINTS: PropTipConfig = {
  points: [
    { dx: 150.31, dy: -273.41 },
    { dx: 252.03, dy: -161.8 },
    { dx: 297, dy: 0 },
    { dx: 252.03, dy: 161.8 },
    { dx: 150.31, dy: 273.41 },
  ],
};

// Preserve the saved effect-point order (upper-left, primary/right,
// lower-left) while putting all three arms on the club's canonical reach.
// Keeping this order stable prevents per-tip effects from jumping arms.
export const TRIAD_TIP_POINTS: PropTipConfig = radialTipConfig(
  CLUB_TIP_REACH,
  -120,
  3
);

const BIGTRIAD_TIP_POINTS: PropTipConfig = {
  points: [
    { dx: 260, dy: 0 },
    { dx: -130, dy: -226 },
    { dx: -130, dy: 226 },
  ],
};

// Hoops are butt-pivoted: the hand sits at the viewBox centre and the ring is
// drawn entirely in +x. The measured ring centreline is at dx 59.4 with radius
// 60.6 and a 16.8-unit tube, so these five points are ring angles 216 / 288 /
// 0 / 72 / 144 degrees on that centreline — dead centre of the tube, evenly
// spaced around the hoop. The old values straddled the tube and put one point
// behind the hand.
const MINIHOOP_TIP_POINTS: PropTipConfig = {
  points: [
    { dx: 10.37, dy: -35.62 },
    { dx: 78.13, dy: -57.63 },
    { dx: 120, dy: 0 },
    { dx: 78.13, dy: 57.63 },
    { dx: 10.37, dy: 35.62 },
  ],
};

// The same five ring angles at the big-hoop scale: measured centreline at
// dx 149.8 with radius 142.4 and a 16-unit tube.
const BIGHOOP_TIP_POINTS: PropTipConfig = {
  points: [
    { dx: 34.6, dy: -83.7 },
    { dx: 193.8, dy: -135.43 },
    { dx: 292.2, dy: 0 },
    { dx: 193.8, dy: 135.43 },
    { dx: 34.6, dy: 83.7 },
  ],
};

/**
 * The filled path in `buugeng.svg` is authored around the viewBox center. Its
 * two terminal curves are only approximately circular and differ slightly by
 * hand, so we rotate the left cap 180 degrees and fit one geometric
 * least-squares circle through both visible cap outlines. That source fit puts
 * the right cap center at (121.58068, 5.77501), a 2.71947-degree tilt. Austen
 * explicitly chose the fitted X coordinate with Y locked to zero as the
 * product convention, so every renderer gets a perfectly horizontal pair.
 */
export const BUUGENG_ARTWORK_GEOMETRY: RadialPropGeometry = {
  viewBox: { width: 262.6, height: 135.9 },
  center: { x: 131.3, y: 67.95 },
  trackedRadius: 121.58068,
  phaseDegrees: 0,
  capRadius: 10.45411,
};

export const BUUGENG_TIP_POINTS = radialTipConfig(
  BUUGENG_ARTWORK_GEOMETRY.trackedRadius,
  BUUGENG_ARTWORK_GEOMETRY.phaseDegrees,
  2
);

const BIGBUUGENG_TIP_POINTS: PropTipConfig = {
  points: [
    // Unlike buugeng, this artwork's terminals are tapers rather than rounded
    // caps, and its S-curve is steep enough that the old on-axis pair landed
    // in empty space at both ends. These are the point-symmetric pair inside
    // the taper at radius 295 (the apexes measure (299.5, 14.45) and
    // (-300, -14.05)), which is the deepest the emitter can sit while staying
    // centred in the visible terminal.
    { dx: 294.28, dy: 20.58 },
    { dx: -294.28, dy: -20.58 },
  ],
};

/**
 * Measured from the filled path in `trigeng.svg`, not its bounding box. The
 * SVG's construction nodes establish (125, 118.35) as the compass center. We
 * rotate the three authored rounded-cap curve spans into one frame, fit one
 * least-squares circle to their visible outlines, then rotate that fitted cap
 * center back at 120-degree intervals. This makes the three effect sources
 * genuinely equidistant while keeping them centered in the artwork's caps.
 */
export const TRIGENG_ARTWORK_GEOMETRY: RadialPropGeometry = {
  viewBox: { width: 250, height: 236.7 },
  center: { x: 125, y: 118.35 },
  trackedRadius: 117.93708,
  phaseDegrees: 3.66932,
  capRadius: 8.80551,
};

export const TRIGENG_TIP_POINTS = radialTipConfig(
  TRIGENG_ARTWORK_GEOMETRY.trackedRadius,
  TRIGENG_ARTWORK_GEOMETRY.phaseDegrees,
  3
);

const SWORD_TIP_POINTS: PropTipConfig = {
  points: [{ dx: 280, dy: 0 }],
};

// Energy Saber is a sword restyle, so it gets sword's reach exactly: the blade
// tip sits 280 units from the pivot in a 620-unit box. Single-ended — the hilt
// end is not tracked (see TWO_ENDED_PROPS in prop-tip-ends.ts, which must
// agree with this entry).
const ENERGY_SABER_TIP_POINTS: PropTipConfig = {
  points: [{ dx: 280, dy: 0 }],
};

// Energy Staff is a staff restyle, so both blades reach 126.4 like staff's two
// ends. The collars are shaped differently for the thumb/pinky landmark, but
// the tracked geometry stays mirror-symmetric.
const ENERGY_STAFF_TIP_POINTS: PropTipConfig = {
  points: [
    { dx: -126.4, dy: 0 },
    { dx: 126.4, dy: 0 },
  ],
};

// Butt-pivoted like the other offset props: the knot's own centre measures
// 47.123 to the +x side of the viewBox centre, and its three lobe apexes sit
// on a band whose mid-radius is 88.5 from that knot centre, at 0 / 120 / 240
// degrees. The old values were measured from the viewBox centre instead, so
// the two rear lobes fell off the artwork.
const TRIQUETRA_TIP_POINTS: PropTipConfig = {
  points: [
    { dx: 135.62, dy: 0 },
    { dx: 2.87, dy: -76.64 },
    { dx: 2.87, dy: 76.64 },
  ],
};

// triquetra2 stays on the animated artwork (the pictograph file is a different
// shape, not a rescale). Its knot centre measures 90.668 to the +x side of the
// viewBox centre with a lobe band mid-radius of 91.75, and the knot is rotated
// so the lobes land at 60 / 180 / 300 degrees — meaning one lobe apex sits
// almost exactly on the hand. Index 0 is the apex farthest from the pivot,
// then -120 degree steps, so the ordering stays deterministic.
const TRIQUETRA2_TIP_POINTS: PropTipConfig = {
  points: [
    { dx: 136.55, dy: -79.46 },
    { dx: -1.08, dy: 0 },
    { dx: 136.55, dy: 79.46 },
  ],
};

// Regular (small) chicken is single-ended — one weighted tip at the outer
// (+dx) end, matching the club/sword single-tip convention. The artwork stops
// at 152 on the axis, so the old 162.5 was ten units past the paint; 149 puts
// the emitter inside the solid head instead of in a gap between feather wisps.
const CHICKEN_TIP_POINTS: PropTipConfig = {
  points: [{ dx: 149, dy: 0 }],
};

// Big chicken is bilateral, but the drawing is a chicken and not a baton, so
// the two ends are not mirror images: the head reaches 123.5 on the axis while
// the tail is a fan of feather wisps whose solid base stops near 112. The old
// symmetric pair missed the paint at both ends. (See the TWO_ENDED_PROPS set
// in prop-tip-ends.ts: bigchicken is two-ended, regular chicken is not.)
const BIGCHICKEN_TIP_POINTS: PropTipConfig = {
  points: [
    { dx: -115, dy: 4 },
    { dx: 121.8, dy: -6.4 },
  ],
};

const GUITAR_TIP_POINTS: PropTipConfig = {
  points: [{ dx: 290.78, dy: 0 }],
};

const UKULELE_TIP_POINTS: PropTipConfig = {
  points: [{ dx: 170, dy: 0 }],
};

// The two star apexes only. The old third and fourth points sat at the waist
// between the stars, where there is no artwork at all, and contradicted the
// TWO_ENDED_PROPS entry in prop-tip-ends.ts. Indices 0 and 1 are unchanged, so
// saved per-tip effects stay on the end they were assigned to.
const DOUBLESTAR_TIP_POINTS: PropTipConfig = {
  points: [
    { dx: 150, dy: 0 },
    { dx: -150, dy: 0 },
  ],
};

const BIGDOUBLESTAR_TIP_POINTS: PropTipConfig = {
  points: [
    { dx: 300, dy: 0 },
    { dx: -300, dy: 0 },
  ],
};

// Both entries used to sit on the top of a ring at roughly half the real
// reach, so the mandala came out ~34% short. These are the artwork's own outer
// extents, measured off the pictograph SVGs with isPointInFill.
const EIGHTRINGS_TIP_POINTS: PropTipConfig = {
  points: [
    { dx: 128.5, dy: -2.5 },
    { dx: -128.5, dy: -2.5 },
  ],
};

const BIGEIGHTRINGS_TIP_POINTS: PropTipConfig = {
  points: [
    { dx: 300, dy: -3.8 },
    { dx: -300, dy: -3.8 },
  ],
};

export const QUIAD_TIP_POINTS: PropTipConfig = {
  points: [
    { dx: 104.17, dy: 0 },
    { dx: 0, dy: -104.17 },
    { dx: -104.17, dy: 0 },
    { dx: 0, dy: 104.17 },
  ],
};

// Both torch SVGs are butt-pivoted: the viewBox is padded so the hand sits at
// the viewBox centre and the shaft runs entirely in +x. The old -140 / -120
// values pointed backwards past the hand into empty space, so trails and fire
// tracked a point with no artwork behind it. Each file carries an authored,
// invisible `data-animated-torch-wick` rect around the lit head; these are the
// centres of those rects, which is exactly where the flame is drawn from.
const TORCH_TIP_POINTS: PropTipConfig = {
  points: [{ dx: 142.55, dy: 0 }],
};

const BIGTORCH_TIP_POINTS: PropTipConfig = {
  points: [{ dx: 145.2, dy: 0 }],
};

const POI_TIP_POINTS: PropTipConfig = {
  // The light/wick lives in the head, so the head CENTRE is the tracked point —
  // and it sits at the club's 129.335 reach, so a poi mandala and a club mandala
  // come out the same size (see static/images/props/*/poi.svg).
  points: [{ dx: CLUB_TIP_REACH, dy: 0 }],
};

const EMPTY_TIP_POINTS: PropTipConfig = {
  points: [],
};

const DOUBLECONTACTBALL_TIP_POINTS: PropTipConfig = {
  points: [
    { dx: -75, dy: 0 },
    { dx: 75, dy: 0 },
  ],
};

const BIGDOUBLECONTACTBALL_TIP_POINTS: PropTipConfig = {
  points: [
    { dx: -150, dy: 0 },
    { dx: 150, dy: 0 },
  ],
};

// ---------------------------------------------------------------------------
// Fan builds. Each 2D fan look is different artwork on the same 260 x 207 box
// with the hand pivot at (130, 103.5), so the pictograph rib intersections in
// FAN_TIP_POINTS land in open air on every one of them. These are the wick or
// LED centres of each build in that box, ordered top to bottom like
// FAN_TIP_POINTS so per-tip effect assignments stay on the same spoke.
// ---------------------------------------------------------------------------

function mirroredFanTips(
  upper: readonly (readonly [number, number])[],
  apex: number
): PropTipConfig {
  return {
    points: [
      ...upper.map(([dx, dy]) => ({ dx, dy: -dy })),
      { dx: apex, dy: 0 },
      ...[...upper].reverse().map(([dx, dy]) => ({ dx, dy })),
    ],
  };
}

// DoodleGrip Fire: wick centres from scripts/assets/doodlegrip-fire-reference
// .json through the build script's box mapping. The covered build wraps the
// same wicks, so it shares the table.
export const FAN_FIRE_TIP_POINTS: PropTipConfig = mirroredFanTips(
  [
    [50, 92.54],
    [98, 55.7],
  ],
  119.05
);

// Lotus Fire: wick centres of the Home of Poi artwork after the build
// script's rotate/scale placement onto the fan box.
export const FAN_LOTUS_TIP_POINTS: PropTipConfig = mirroredFanTips(
  [
    [39.99, 85.51],
    [103.85, 66.25],
  ],
  114.06
);

// Flat Grip Fire: the five wick centres are authored asymmetrically (the
// lower spokes sit a few units in), so they are listed as measured rather
// than mirrored.
export const FAN_FLAT_GRIP_TIP_POINTS: PropTipConfig = {
  points: [
    { dx: 49.5, dy: -98.58 },
    { dx: 93.5, dy: -56.27 },
    { dx: 109.16, dy: 0 },
    { dx: 90.12, dy: 53.31 },
    { dx: 46.12, dy: 88.85 },
  ],
};

// DoodleGrip Day: the plate rim points shared with the 3D build, through the
// same box mapping as the fire fan at the day build's 0.97 fit. The frame
// colour only changes paint, not geometry, so all four keys share it.
export const FAN_DAY_TIP_POINTS: PropTipConfig = mirroredFanTips(
  [
    [54.87, 101.56],
    [110.27, 62.68],
  ],
  129.88
);

// Moon LED: the light runs along the outer diffuser rim. Sampled on the
// painted rim at the fire fan's five spoke bearings, then pulled 3 units in
// so the tracked point is inside the diffuser rather than on its edge.
export const FAN_MOON_TIP_POINTS: PropTipConfig = mirroredFanTips(
  [
    [45.13, 93.98],
    [99.21, 63.42],
  ],
  126
);

// Big Fan draws every build as the regular artwork scaled about the hand
// pivot into the 600 x 566.9 bigfan box (scaleFanAppearanceForBigFan), so its
// tips are the regular tips scaled by the same factor.
const BIGFAN_BUILD_SCALE = 1.8461538;

function scaledTips(config: PropTipConfig, scale: number): PropTipConfig {
  return {
    points: config.points.map((point) => ({
      dx: point.dx * scale,
      dy: point.dy * scale,
    })),
  };
}

function fanBuildTables(
  propType: "fan" | "bigfan",
  scale: number
): Record<string, PropTipConfig> {
  const fire = scaledTips(FAN_FIRE_TIP_POINTS, scale);
  const day = scaledTips(FAN_DAY_TIP_POINTS, scale);
  return {
    [`${propType}__fire_bare`]: fire,
    [`${propType}__fire_covered`]: fire,
    [`${propType}__lotus`]: scaledTips(FAN_LOTUS_TIP_POINTS, scale),
    [`${propType}__flat-grip`]: scaledTips(FAN_FLAT_GRIP_TIP_POINTS, scale),
    [`${propType}__moon`]: scaledTips(FAN_MOON_TIP_POINTS, scale),
    [`${propType}__day_black_bare`]: day,
    [`${propType}__day_black_covered`]: day,
    [`${propType}__day_white_bare`]: day,
    [`${propType}__day_white_covered`]: day,
  };
}

/**
 * Tip points keyed by renderer identity (resolvePropRenderKey) rather than
 * notation prop type. A render key that is absent here resolves to its
 * notation table, so plain props and unknown builds behave as before.
 */
export const PROP_RENDER_KEY_TIP_POINTS: Record<string, PropTipConfig> = {
  ...fanBuildTables("fan", 1),
  ...fanBuildTables("bigfan", BIGFAN_BUILD_SCALE),
};

// Callback injection avoids a circular dependency on the feature layer.
type TipPointOverrideFn = (propType: string) => PropTipConfig | null;
let overrideProvider: TipPointOverrideFn | null = null;

/**
 * Register a callback that can supply custom tip points for a prop type.
 * Pass null to remove the override provider.
 */
export function setTipPointOverrideProvider(
  provider: TipPointOverrideFn | null
): void {
  overrideProvider = provider;
}

export const PROP_TIP_POINTS: Record<string, PropTipConfig> = {
  // Staff family — one config each now: the three regular staves scaled onto
  // the pictograph family by different factors, so they can't share a table.
  staff: STAFF_TIP_POINTS,
  simple_staff: SIMPLE_STAFF_TIP_POINTS,
  bigstaff: BIGSTAFF_TIP_POINTS,
  staff_v2: STAFF_V2_TIP_POINTS,
  capsule_baton: CAPSULE_BATON_TIP_POINTS,
  fire_double_staff: FIRE_DOUBLE_STAFF_TIP_POINTS,

  // Club family
  club: CLUB_TIP_POINTS,
  classic_club: CLUB_TIP_POINTS,
  bigclub: BIGCLUB_TIP_POINTS,

  // Fan family
  fan: FAN_TIP_POINTS,
  bigfan: BIGFAN_TIP_POINTS,

  // Triad family
  triad: TRIAD_TIP_POINTS,
  bigtriad: BIGTRIAD_TIP_POINTS,

  // Hoop family
  minihoop: MINIHOOP_TIP_POINTS,
  bighoop: BIGHOOP_TIP_POINTS,

  // Buugeng family
  buugeng: BUUGENG_TIP_POINTS,
  bigbuugeng: BIGBUUGENG_TIP_POINTS,
  trigeng: TRIGENG_TIP_POINTS,

  // Hand
  hand: EMPTY_TIP_POINTS,

  // Triquetra family
  triquetra: TRIQUETRA_TIP_POINTS,
  triquetra2: TRIQUETRA2_TIP_POINTS,

  // Sword
  sword: SWORD_TIP_POINTS,


  // Energy family (premium cosmetics) — reach copied from each parent
  energy_saber: ENERGY_SABER_TIP_POINTS,
  energy_staff: ENERGY_STAFF_TIP_POINTS,

  // Chicken family
  chicken: CHICKEN_TIP_POINTS,
  bigchicken: BIGCHICKEN_TIP_POINTS,

  // Guitar family
  guitar: GUITAR_TIP_POINTS,
  ukulele: UKULELE_TIP_POINTS,

  // Doublestar family
  doublestar: DOUBLESTAR_TIP_POINTS,
  bigdoublestar: BIGDOUBLESTAR_TIP_POINTS,

  // Eightrings family
  eightrings: EIGHTRINGS_TIP_POINTS,
  bigeightrings: BIGEIGHTRINGS_TIP_POINTS,

  // Quiad
  quiad: QUIAD_TIP_POINTS,

  // Contact ball family. A single ball sits in the hand, so nothing trails
  // from it. The double contact ball is two-ended (TWO_ENDED_PROPS in
  // prop-tip-ends.ts): the tracked points are the two ball centres, authored
  // at 75 / 225 in the 300-wide box and 150 / 450 in the 600-wide one.
  contactball: EMPTY_TIP_POINTS,
  bigcontactball: EMPTY_TIP_POINTS,
  doublecontactball: DOUBLECONTACTBALL_TIP_POINTS,
  bigdoublecontactball: BIGDOUBLECONTACTBALL_TIP_POINTS,

  // Torch family
  torch: TORCH_TIP_POINTS,
  bigtorch: BIGTORCH_TIP_POINTS,

  // Poi
  poi: POI_TIP_POINTS,
};

export const DEFAULT_TIP_POINTS: PropTipConfig = STAFF_TIP_POINTS;

const RENDER_KEY_SEPARATOR = "__";
const MODEL_RENDER_KEY_SUFFIX = "__model";

/** The notation prop type behind a render key (`fan__lotus` -> `fan`). */
function baseKeyOf(key: string): string {
  const separator = key.indexOf(RENDER_KEY_SEPARATOR);
  return separator === -1 ? key : key.slice(0, separator);
}

// ---------------------------------------------------------------------------
// Model sprites. A "3D model" look draws a baked capture on the same
// grip-centred box as the notation glyph, so the notation table applies —
// except where the capture paints short of the notation reach along the prop
// axis. Then an axial prop's tips are pulled in to the painted extent so
// flames and trails attach to the sprite that is actually on screen. Tips are
// never pushed out past the notation reach: several tables deliberately sit
// inside the paint (wick centres, poi heads).
// ---------------------------------------------------------------------------

/** Painted reach is within this fraction of the box half-width: keep the table. */
const MODEL_REACH_TOLERANCE = 0.05;

/**
 * Painted reach below this fraction of the half-width means the capture has
 * no end on that side (a club held at its knob paints nothing past the hand).
 * Its tips are dropped rather than pulled in onto the hand.
 */
const MODEL_REACH_DROP = 0.25;

function isAxialTable(config: PropTipConfig): boolean {
  return (
    config.points.length > 0 && config.points.every((point) => point.dy === 0)
  );
}

/**
 * True when an axial prop's capture paints on the -x side of the hand. Every
 * tip table puts a one-ended prop's business end at +x, so the animation
 * canvas rotates such sprites 180 degrees when it draws them (svg-generator)
 * and the derived tips below assume the rotated sprite. The decision is made
 * from the painted geometry alone: a capture of a two-ended notation prop can
 * still be one-sided (the big club model is a club held at its knob).
 */
export function modelSpriteFacesAwayFromTips(
  propType: string,
  entry: PropModelSpriteEntry | undefined = PROP_MODEL_SPRITES[
    propType.toLowerCase()
  ]
): boolean {
  if (!entry?.bounds) return false;
  const base = PROP_TIP_POINTS[baseKeyOf(propType.toLowerCase())];
  if (!base || !isAxialTable(base)) return false;
  const paintedCentre = entry.bounds.x + entry.bounds.width / 2;
  return paintedCentre < entry.width / 2 - entry.width * 0.1;
}

const modelTipCache = new Map<string, PropTipConfig>();

function modelSpriteTipPoints(key: string): PropTipConfig | null {
  const cached = modelTipCache.get(key);
  if (cached) return cached;
  const baseKey = baseKeyOf(key);
  const base = PROP_TIP_POINTS[baseKey];
  const entry = PROP_MODEL_SPRITES[baseKey];
  if (!base || !entry?.bounds || !isAxialTable(base)) return null;

  const half = entry.width / 2;
  const facesAway = modelSpriteFacesAwayFromTips(baseKey, entry);
  // Reach on each side of the hand as the sprite is drawn (after the
  // renderer's 180 degree correction for away-facing captures).
  const paintedLeft = half - entry.bounds.x;
  const paintedRight = entry.bounds.x + entry.bounds.width - half;
  const reachPositive = facesAway ? paintedLeft : paintedRight;
  const reachNegative = facesAway ? paintedRight : paintedLeft;
  const scalePositive = Math.min(1, reachPositive / half);
  const scaleNegative = Math.min(1, reachNegative / half);
  const needsPositive =
    base.points.some((point) => point.dx > 0) &&
    scalePositive < 1 - MODEL_REACH_TOLERANCE;
  const needsNegative =
    base.points.some((point) => point.dx < 0) &&
    scaleNegative < 1 - MODEL_REACH_TOLERANCE;
  if (!needsPositive && !needsNegative) {
    modelTipCache.set(key, base);
    return base;
  }
  const scaled: PropTipConfig = {
    points: base.points
      .filter((point) =>
        point.dx > 0
          ? !needsPositive || scalePositive >= MODEL_REACH_DROP
          : point.dx < 0
            ? !needsNegative || scaleNegative >= MODEL_REACH_DROP
            : true
      )
      .map((point) => ({
        dx:
          point.dx > 0 && needsPositive
            ? point.dx * scalePositive
            : point.dx < 0 && needsNegative
              ? point.dx * scaleNegative
              : point.dx,
        dy: point.dy,
      })),
  };
  // A capture with no end on either side has nothing to attach to; fall
  // back to the notation table rather than an empty one.
  const result = scaled.points.length > 0 ? scaled : base;
  modelTipCache.set(key, result);
  return result;
}

function tableFor(key: string): PropTipConfig | null {
  const renderKeyed = PROP_RENDER_KEY_TIP_POINTS[key];
  if (renderKeyed) return renderKeyed;
  if (key.endsWith(MODEL_RENDER_KEY_SUFFIX)) {
    const model = modelSpriteTipPoints(key);
    if (model) return model;
  }
  return null;
}

export type TipPointSource = "override" | "render-key" | "base" | "default";

export interface TipPointResolution {
  /** The key as asked for, lower-cased. */
  key: string;
  /** The key whose table or override answered, or null for the staff default. */
  resolvedKey: string | null;
  source: TipPointSource;
}

/**
 * Where getTipPoints(key) gets its answer. Order: an override for the exact
 * key, the render-key table (fan builds, model sprites), an override for the
 * notation type behind the key, the notation table, then the staff default.
 * A render-key table outranks a notation override because the override was
 * tuned against the notation artwork, not this build.
 */
export function describeTipPointResolution(
  propType: string | null | undefined
): TipPointResolution {
  if (!propType) return { key: "", resolvedKey: null, source: "default" };
  const key = propType.toLowerCase();
  const baseKey = baseKeyOf(key);
  if (overrideProvider?.(key)) {
    return { key, resolvedKey: key, source: "override" };
  }
  if (tableFor(key)) {
    return { key, resolvedKey: key, source: "render-key" };
  }
  if (baseKey !== key && overrideProvider?.(baseKey)) {
    return { key, resolvedKey: baseKey, source: "override" };
  }
  if (PROP_TIP_POINTS[baseKey]) {
    return { key, resolvedKey: baseKey, source: "base" };
  }
  return { key, resolvedKey: null, source: "default" };
}

/**
 * Look up tip points for a prop type or render key. See
 * describeTipPointResolution for the precedence.
 */
export function getTipPoints(
  propType: string | null | undefined
): PropTipConfig {
  if (!propType) return DEFAULT_TIP_POINTS;
  const key = propType.toLowerCase();
  const override = overrideProvider?.(key);
  if (override) return override;
  const table = tableFor(key);
  if (table) return table;
  const baseKey = baseKeyOf(key);
  if (baseKey !== key) {
    const baseOverride = overrideProvider?.(baseKey);
    if (baseOverride) return baseOverride;
  }
  return PROP_TIP_POINTS[baseKey] ?? DEFAULT_TIP_POINTS;
}

/**
 * Look up baseline tip points for a prop type or render key, bypassing any
 * registered override provider. Used by the mandala geometry calculator,
 * which traces hand-path geometry using canonical prop dimensions rather than
 * effects-lab custom tip positions.
 */
export function getTipPointsBaseline(
  propType: string | null | undefined
): PropTipConfig {
  if (!propType) return DEFAULT_TIP_POINTS;
  const key = propType.toLowerCase();
  return tableFor(key) ?? PROP_TIP_POINTS[baseKeyOf(key)] ?? DEFAULT_TIP_POINTS;
}

/**
 * Compact identity of the points a key resolves to right now. Two keys with
 * the same signature put effects at the same prop-local positions; the fire
 * frame cache keys on it so a look change never replays flames recorded for
 * other artwork.
 */
export function tipPointSignature(
  propType: string | null | undefined
): string {
  const points = getTipPoints(propType).points;
  let signature = "";
  for (const point of points) {
    signature += `${point.dx.toFixed(2)},${point.dy.toFixed(2)};`;
  }
  return signature;
}
