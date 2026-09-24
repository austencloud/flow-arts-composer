import { PropType } from "@austencloud/scene-3d/worker";
import { propTipEnds } from "$lib/shared/pictograph/prop/domain/prop-tip-ends";
import { getTipPointsBaseline } from "$lib/shared/animation-engine/domain/types/prop-tip-points";
import { HOOP_FAMILY_REACH_M } from "$lib/shared/pictograph/prop/domain/hoop-family-geometry.generated";
import {
  resolveBuildTipAnchors3D,
  type PropBuildTipGeometry3D,
} from "./prop-build-tip-geometry-3d";

/**
 * Where a prop's tracked effect emitters sit along its own axis, in 3D.
 *
 * The 3D tip bridge used to place two emitters at +/- staffHalfLength for every
 * prop, which is only true of the staff family. A club has ONE tip: the cap.
 * Tracking a phantom second end put a whole flame (or LED, or charcoal plume)
 * about 43cm behind the hand, out the back of the knob, where the club does not
 * exist. Every single-ended prop had the same phantom.
 *
 * How many ends a prop presents is already owned by `propTipEnds()` — the same
 * authority the 2D trail overlays, the trail capturer and the mandala use — so
 * this module answers only the 3D-specific half: WHERE along the prop's axis
 * each tracked tip lands, in metres.
 *
 * Effect-slot ordering follows the canonical 2D convention: tip 0 is the
 * pinky/LEFT_END slot, tip 1 is the thumb/RIGHT_END slot. A single-ended prop
 * keeps slot 1 — the same slot `trail-capturer.ts` gives it — so a saved
 * per-tip effect assignment means the same thing in 2D and 3D.
 */
export interface PropTipAnchor3D {
  /** Effect-assignment slot: 0 = pinky/left end, 1 = thumb/right end. */
  readonly effectTipIndex: 0 | 1;
  /** Prop-local metres from the hand pivot: +Y reach, +X across. */
  readonly offset: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
}
/** `Prop3D.svelte` renders every "big" procedural variant at this scale. */
const BIG_SCALE = 1.4;

/**
 * Hand to the top of the cap, in metres — `club-profile.ts` `CLUB_REACH_M`.
 * A club is a standardized 52cm object, so unlike the staff family its reach is
 * absolute and does NOT scale with the user's staff length. The value is copied
 * rather than imported because the props package does not export it.
 */
const CLUB_REACH_M = 0.50343;

/**
 * Headstock-tip grip to the final 15mm of wood above the hand, in metres.
 * `ukulele.glb` authors this as `tracked_tip_y`; the builder and GLB verifier
 * keep the model, pivot, and effect emitter in agreement.
 */
const UKULELE_REACH_M = 0.015;

/** Hand to the top of the wick, as a fraction of staff length — `torch-profile.ts` `TORCH_REACH`. */
const TORCH_REACH_RATIO = 0.59335;

/**
 * Hand to the blade apex, as a fraction of staff length. `sword.glb` authors a
 * 34.00in prop with its origin on the cross-guard, where `sword.svg` puts the
 * hand: 20.98in of blade forward, 13.02in of hilt back, both gated by
 * `scripts/verify-sword-glb.cjs`. The old 0.824 described the procedural stack
 * the GLB replaced, and left the tracked tip about 7in past the point.
 */
const SWORD_REACH_RATIO = 0.61706;

/**
 * Hand to the far tube centreline, in metres, from the hoop family station
 * table. A hoop is sold in inch sizes and a triangle is three cut lengths of
 * tubing: both are fixed-size objects, so like the club their reach is
 * absolute. The old `0.7 x staffLength` ratio described the earlier
 * staff-proportional Hoop3D, sized at 0.35x the staff length, and never
 * matched the 18.5in ring: at the default staff length that ratio gives
 * 0.605m against the ring's actual 0.454m reach. The 2D tip tables sit on
 * the tube centreline too, so the reach is measured to the centreline, not
 * the outer edge.
 */
const HOOP_REACH_M = HOOP_FAMILY_REACH_M.minihoop;
const BIGHOOP_REACH_M = HOOP_FAMILY_REACH_M.bighoop;
const TRIANGLE_REACH_M = HOOP_FAMILY_REACH_M.triangle;

/**
 * Single-ended props whose 3D mesh reaches somewhere other than half a staff.
 * Keyed by prop type, valued in metres given the staff length in metres.
 *
 * A prop absent from this table falls back to `staffHalfLength`. That is the
 * honest default for the GLTF-backed props (chicken, guitar, trigeng)
 * whose reach lives in a .glb rather than in a number anyone can cite, and for
 * poi, whose ball centre lands within a centimetre of half a staff anyway.
 */
const SINGLE_ENDED_REACH_3D: Partial<
  Record<PropType, (staffLength: number) => number>
> = {
  [PropType.CLUB]: () => CLUB_REACH_M,
  [PropType.CLASSIC_CLUB]: () => CLUB_REACH_M,
  [PropType.UKULELE]: () => UKULELE_REACH_M,

  [PropType.TORCH]: (staffLength) => staffLength * TORCH_REACH_RATIO,
  [PropType.BIGTORCH]: (staffLength) =>
    staffLength * TORCH_REACH_RATIO * BIG_SCALE,

  [PropType.SWORD]: (staffLength) => staffLength * SWORD_REACH_RATIO,

  [PropType.MINIHOOP]: () => HOOP_REACH_M,
  [PropType.BIGHOOP]: () => BIGHOOP_REACH_M,
  [PropType.TRIANGLE]: () => TRIANGLE_REACH_M,
};

/**
 * Hand to a lit cap's glow centre, in metres. `capsule-baton.glb` authors an
 * 0.8636m prop whose caps close at +/-0.4318, but the capsule that lights them
 * sits inside the tube, 22mm inboard at +/-0.4099367 -- `tracked_tip_y` in the
 * model's root extras, printed by `scripts/build-capsule-baton-model.py` and
 * gated by `scripts/verify-capsule-baton-glb.cjs`. The two-ended default lands
 * on the closed end of the cap, off the tip, where nothing is emitting.
 *
 * Absolute, not a ratio: like the club, a GLB prop is a fixed-size object and
 * does not follow the user's staff length.
 */
const CAPSULE_BATON_REACH_M = 0.4099367;

/**
 * Hand to a wick's centre, in metres. `fire-double-staff.glb` authors the 90cm
 * model, so its wicks close at +/-0.45, but a monkey fist burns from its middle
 * -- 37mm inboard at +/-0.413, `tracked_tip_y` in the model's root extras,
 * printed by `scripts/build-fire-double-staff-model.py` and gated by
 * `scripts/verify-fire-double-staff-glb.cjs`.
 *
 * Absolute, not a ratio: a GLB prop is a fixed-size object and does not follow
 * the user's staff length.
 */
const FIRE_DOUBLE_STAFF_REACH_M = 0.413;

/**
 * Two-ended props whose ends sit somewhere other than half a staff from the
 * hand. Keyed by prop type, valued in metres given the staff length in metres.
 *
 * A prop absent from this table falls back to `staffHalfLength`, which is exact
 * for the staff family and its bilateral relatives (doublestar, buugeng,
 * eightrings, triquetra) whose 3D geometry is built from that half-length.
 */
const TWO_ENDED_REACH_3D: Partial<
  Record<PropType, (staffLength: number) => number>
> = {
  [PropType.CAPSULE_BATON]: () => CAPSULE_BATON_REACH_M,
  [PropType.FIRE_DOUBLE_STAFF]: () => FIRE_DOUBLE_STAFF_REACH_M,
};

/**
 * Prop types the 3D scene draws with bilateral geometry but the 2D registry
 * has no entry for. `fractalgeng` exists only in the scene package's enum and
 * renders through `Buugeng3D`, which is point-symmetric; without this it would
 * fall through to `propTipEnds()`'s single-ended default and lose an end.
 */
const TWO_ENDED_3D_ONLY: ReadonlySet<string> = new Set([PropType.FRACTALGENG]);

function isTwoEnded3D(propType: string | undefined): boolean {
  if (propType && TWO_ENDED_3D_ONLY.has(propType)) return true;
  return propTipEnds(propType) === 2;
}

/**
 * Reach of a single-ended prop's one tracked tip, in metres.
 *
 * Props with no tip points at all (contact ball, hand) emit from the pivot
 * itself: the ball IS the prop, and a hand has nothing sticking out of it.
 */
function singleEndedReach3D(
  propType: string | undefined,
  staffHalfLength: number
): number {
  if (getTipPointsBaseline(propType).points.length === 0) return 0;

  const reach = propType
    ? SINGLE_ENDED_REACH_3D[propType as PropType]
    : undefined;
  return reach ? reach(staffHalfLength * 2) : staffHalfLength;
}

/** Reach of one end of a two-ended prop, in metres. */
function twoEndedReach3D(
  propType: string | undefined,
  staffHalfLength: number
): number {
  const reach = propType ? TWO_ENDED_REACH_3D[propType as PropType] : undefined;
  return reach ? reach(staffHalfLength * 2) : staffHalfLength;
}

/**
 * The tracked effect emitters for a prop, in effect-slot order.
 *
 * Two-ended props get a symmetric pair, half a staff out unless
 * `TWO_ENDED_REACH_3D` says otherwise. Everything else returns exactly one
 * anchor, on slot 1.
 */
export function resolvePropTipAnchors3D(
  propType: string | undefined,
  staffHalfLength: number,
  build: PropBuildTipGeometry3D
): PropTipAnchor3D[] {
  const buildAnchors = resolveBuildTipAnchors3D(
    propType,
    staffHalfLength * 2,
    build
  );
  if (buildAnchors) return buildAnchors;

  if (isTwoEnded3D(propType)) {
    const reach = twoEndedReach3D(propType, staffHalfLength);
    return [
      { effectTipIndex: 0, offset: { x: 0, y: -reach, z: 0 } },
      { effectTipIndex: 1, offset: { x: 0, y: reach, z: 0 } },
    ];
  }

  return [
    {
      effectTipIndex: 1,
      offset: {
        x: 0,
        y: singleEndedReach3D(propType, staffHalfLength),
        z: 0,
      },
    },
  ];
}

/** Stable identity for an anchor set, so a prop swap can drop stale velocity history. */
export function propTipAnchorSignature3D(
  anchors: readonly PropTipAnchor3D[]
): string {
  return anchors
    .map(
      (anchor) =>
        `${anchor.effectTipIndex}@${anchor.offset.x.toFixed(5)},${anchor.offset.y.toFixed(5)},${anchor.offset.z.toFixed(5)}`
    )
    .join("|");
}
