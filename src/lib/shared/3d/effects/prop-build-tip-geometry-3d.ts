import { PropType } from "@austencloud/scene-3d/worker";
import {
  BUUGENG_ARTWORK_GEOMETRY,
  BUUGENG_TIP_POINTS,
  FAN_TIP_POINTS,
  QUIAD_TIP_POINTS,
  TRIAD_TIP_POINTS,
  TRIGENG_ARTWORK_GEOMETRY,
  TRIGENG_TIP_POINTS,
  type PropTipConfig,
} from "$lib/shared/animation-engine/domain/types/prop-tip-points";
import type { PropTipAnchor3D } from "./prop-tip-geometry-3d";

/**
 * The prop-build inputs that move a prop's tracked effect emitters.
 *
 * `fanBuild` selects the mesh `Fan3D.svelte` renders. The builds do not share
 * a silhouette. Pictograph is a drawn plate sized from
 * `getFanPlate(effectiveLength, ...)`, so it follows the user's staff length.
 * Fire and day are fixed-size GLBs: `Fan3D` wraps them in
 * `<T.Group scale={[scale, scale, scale]}>` and never feeds them `length`.
 */
export interface PropBuildTipGeometry3D {
  readonly fanBuild:
    | "pictograph"
    | "fire"
    | "lotus"
    | "day"
    | "moon"
    | "flat-grip";
  readonly finish: "fire" | "day";
}

/**
 * `Prop3D.svelte` renders every "big" variant by handing the base prop
 * component `scale={BIG_SCALE}`, which scales the whole group — the GLB fans
 * included. Emitters follow it multiplicatively.
 *
 * `BIG_VARIANT_MAP` in the scene package names 30/13 for BIGFAN, but it has no
 * consumers; `Prop3D.svelte` is what actually renders, and it uses 1.4.
 */
const BIG_SCALE = 1.4;

/**
 * Hand to the far rim, as a fraction of staff length — the outer contour of
 * `fan-profile.ts`, which is what `getFanPlate` extrudes for the pictograph
 * build. Its coordinates are already normalized to the staff's drawn span.
 */
const FAN_REACH_RATIO = 0.50831;

/** Hub to a wick centre, as a fraction of staff length — `triad-frame.ts` `TRIAD_ARM_LENGTH`. */
const TRIAD_REACH_RATIO = 0.44707;

/**
 * The quiad's own arm — `triad-frame.ts` `QUIAD_ARM_LENGTH`. Shorter than the
 * triad's, because quiad.svg draws a shorter one.
 */
const QUIAD_REACH_RATIO = 0.43202;

/**
 * The Trigeng GLB is a fixed 0.56m-wide traced plate. The 2D registry and this
 * bridge share the SVG-fitted compass radius, so a hand-drag or a single long
 * arm can never silently change only the 3D emitter reach.
 */
const TRIGENG_REACH_M = 0.56 * (TRIGENG_ARTWORK_GEOMETRY.trackedRadius / 250);

/**
 * The Buugeng GLB is an 0.83m fixed silhouette. Its emitters inherit the
 * canonical 262.6-unit pictograph inset. The SVG fit found a slight tilt, but
 * the product convention deliberately keeps both sources on local Y.
 */
const BUUGENG_REACH_M =
  (0.83 * BUUGENG_ARTWORK_GEOMETRY.trackedRadius) /
  BUUGENG_ARTWORK_GEOMETRY.viewBox.width;

/**
 * Measured wick centres of the fire fan, in prop-local metres from the grip
 * ring: `scripts/assets/doodlegrip-fire-reference.json` `geometry_m`, traced
 * off the ForgedFans DoodleGrip product photo and calibrated to the published
 * 19 x 13 inch envelope. `scripts/build-fan-model.py` authors the same numbers
 * into `fan.glb`.
 *
 * Absolute, not a ratio: the fire GLB is a fixed physical object and does not
 * follow the user's staff length.
 */
export const FAN_FIRE_WICK_CENTERS_M = [
  { x: -0.2217705, y: 0.10651613, z: 0 },
  { x: -0.13347299, y: 0.20877161, z: 0 },
  { x: 0, y: 0.25363129, z: 0 },
  { x: 0.13347299, y: 0.20877161, z: 0 },
  { x: 0.2217705, y: 0.10651613, z: 0 },
] as const;

// The same grip-relative metres used by scripts/assets/flat-grip-fire-reference.json.
export const FAN_FLAT_GRIP_WICK_CENTERS_M = [
  { x: -0.236230672, y: 0.118622269, z: 0 },
  { x: -0.134844118, y: 0.224064286, z: 0 },
  { x: 0.0, y: 0.261577311, z: 0 },
  { x: 0.127747059, y: 0.215953361, z: 0 },
  { x: 0.212911765, y: 0.110511345, z: 0 },
] as const;

/**
 * Wick centres of the 480 x 350mm Medium Lotus fan, measured from its
 * 3 5/8-inch Russian grip. The Blender build reads the same values from
 * `scripts/assets/lotus-fire-reference.json`, and the GLB verifier compares
 * these constants with both the baked extras and each wick node transform.
 */
export const FAN_LOTUS_WICK_CENTERS_M = [
  { x: -0.21376616, y: 0.085081206, z: 0 },
  { x: -0.16561295, y: 0.2209646, z: 0 },
  { x: 0, y: 0.2426761, z: 0 },
  { x: 0.16561295, y: 0.2209646, z: 0 },
  { x: 0.21376616, y: 0.085081206, z: 0 },
] as const;

/**
 * Outer rim of the day fan, in prop-local metres from the grip ring.
 *
 * A day fan has no wicks, so there is nothing to measure off a photo the way
 * the fire reference was measured. These are sampled from the traced silhouette
 * in `scripts/assets/doodlegrip-day-contours.json` — whose `outline` is already
 * pivot-relative metres over the published 51 x 35 cm envelope — along the same
 * five bearings the fire fan's wicks occupy: 0 and +/-32.592 and +/-64.345
 * degrees from +Y. The rim is the right emitter for a day fan because the rim
 * is what a trail, an LED strip or a sparkle plume traces.
 *
 * Derived from the trace, not measured off a product photo. Extracting the rib
 * apexes from the same trace would be the honest upgrade.
 */
export const FAN_DAY_RIM_POINTS_M = [
  { x: -0.250905, y: 0.1205098, z: 0 },
  { x: -0.1548603, y: 0.2422228, z: 0 },
  { x: 0, y: 0.2852692, z: 0 },
  { x: 0.1548603, y: 0.2422228, z: 0 },
  { x: 0.250905, y: 0.1205098, z: 0 },
] as const;

/**
 * Five evenly distributed samples on the measured 600 x 380mm Moon fan rim.
 * The live diffuser owns all 78 physical emitters; these anchors give trails
 * and the bright moving heads enough span to describe the fan's outer arc.
 */
export const FAN_MOON_RIM_POINTS_M = [
  { x: -0.2897787, y: 0.1045398, z: 0 },
  { x: -0.212132, y: 0.2336468, z: 0 },
  { x: 0, y: 0.318, z: 0 },
  { x: 0.212132, y: 0.2336468, z: 0 },
  { x: 0.2897787, y: 0.1045398, z: 0 },
] as const;

interface Offset3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Fixed-size geometry, scaled only by the prop's own group scale. */
function fixedAnchors(
  points: readonly Offset3D[],
  scale: number
): PropTipAnchor3D[] {
  return points.map((offset) => ({
    effectTipIndex: 1,
    offset: { x: offset.x * scale, y: offset.y * scale, z: offset.z * scale },
  }));
}

/**
 * A drawn silhouette's tip points, placed in 3D.
 *
 * `prop-tip-points.ts` records the 2D drawing: `dx` is along the reach axis,
 * `dy` is across it, both in the pictograph's own units. The drawing owns the
 * directions and the relative radii; the prop's 3D reach constant owns the
 * absolute size. Scaling the whole set so its outermost point lands at `reach`
 * honours both, and keeps a multi-emitter prop agreeing with the single-emitter
 * reach the same prop used to report.
 */
function silhouetteAnchors(
  config: PropTipConfig,
  reach: number,
  effectTipIndices?: readonly (0 | 1)[]
): PropTipAnchor3D[] {
  const maxRadius = Math.max(
    ...config.points.map(({ dx, dy }) => Math.hypot(dx, dy))
  );
  const scale = maxRadius > 0 ? reach / maxRadius : 0;
  return config.points.map(({ dx, dy }, index) => ({
    effectTipIndex: effectTipIndices?.[index] ?? 1,
    offset: { x: dy * scale, y: dx * scale, z: 0 },
  }));
}

function fanAnchors(
  build: PropBuildTipGeometry3D,
  staffLength: number,
  scale: number
): PropTipAnchor3D[] {
  if (build.fanBuild === "fire") {
    return fixedAnchors(FAN_FIRE_WICK_CENTERS_M, scale);
  }
  if (build.fanBuild === "flat-grip") {
    return fixedAnchors(FAN_FLAT_GRIP_WICK_CENTERS_M, scale);
  }
  if (build.fanBuild === "lotus") {
    return fixedAnchors(FAN_LOTUS_WICK_CENTERS_M, scale);
  }
  if (build.fanBuild === "day") {
    return fixedAnchors(FAN_DAY_RIM_POINTS_M, scale);
  }
  if (build.fanBuild === "moon") {
    return fixedAnchors(FAN_MOON_RIM_POINTS_M, scale);
  }
  return silhouetteAnchors(
    FAN_TIP_POINTS,
    staffLength * FAN_REACH_RATIO * scale
  );
}

/**
 * The emitter set for props whose 3D mesh presents more than one tracked point.
 *
 * Returns `null` for every prop whose emitters are unaffected by build, which
 * leaves `resolvePropTipAnchors3D` on its axial default.
 */
export function resolveBuildTipAnchors3D(
  propType: string | undefined,
  staffLength: number,
  build: PropBuildTipGeometry3D
): PropTipAnchor3D[] | null {
  switch (propType) {
    case PropType.FAN:
      return fanAnchors(build, staffLength, 1);
    case PropType.BIGFAN:
      return fanAnchors(build, staffLength, BIG_SCALE);

    case PropType.TRIAD:
      return silhouetteAnchors(
        TRIAD_TIP_POINTS,
        staffLength * TRIAD_REACH_RATIO
      );
    case PropType.BIGTRIAD:
      return silhouetteAnchors(
        TRIAD_TIP_POINTS,
        staffLength * TRIAD_REACH_RATIO * BIG_SCALE
      );

    case PropType.QUIAD:
      return silhouetteAnchors(
        QUIAD_TIP_POINTS,
        staffLength * QUIAD_REACH_RATIO
      );

    case PropType.TRIGENG:
      return silhouetteAnchors(TRIGENG_TIP_POINTS, TRIGENG_REACH_M);

    case PropType.BUUGENG:
      return silhouetteAnchors(BUUGENG_TIP_POINTS, BUUGENG_REACH_M, [0, 1]);
    case PropType.BIGBUUGENG:
      return silhouetteAnchors(
        BUUGENG_TIP_POINTS,
        BUUGENG_REACH_M * BIG_SCALE,
        [0, 1]
      );

    default:
      return null;
  }
}
