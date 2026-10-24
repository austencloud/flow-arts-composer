/**
 * Authored Hero Pool (firebase-free)
 *
 * Gives the home hero two sources of hand-authored sequences next to the
 * shape-matrix flowers and the generated rolls:
 *
 * - CAPs: Gage DeMello's 72 chart CAPs, plus each of the eight hand paths spun
 *   at a turn (every hand pro or anti at 0.5, 1 or 1.5 turns). CAPs are where
 *   a visitor sees one hand double back while the other keeps circling.
 * - Zan's Diamond: the original and its 23 stagger and reversal variations.
 *
 * Both come from the Guide's own records (caps-topic.ts, zans-diamond-topic.ts)
 * through the same strip adapter the Guide pages play, so the hero cannot show
 * a CAP or a Zan's variation the Guide would spell differently. Nothing here
 * fetches: the CAP rows and the Zan's table are checked in.
 *
 * Every draw ends on its own start pose, so it chains: it is rotated (90°
 * steps only) to start where the previous hero sequence ended, and a draw that
 * cannot reach that pose is skipped. Reversal dots are baked by the one
 * reversal owner (processReversals) with the loop seam wrapped, never set by
 * hand.
 *
 * Measured 2026-10-23: no entry in either pool bakes a dot. Dots mark a prop
 * changing spin direction, and both records are built so the props never do:
 * a CAP's capping hand switches pro/anti on its beat back so its prop keeps
 * turning the same way, and a reversed Zan's variation walks the hand path
 * backwards while each prop keeps its spin (reverseSoloPropSteps). What the
 * visitor sees reverse here is the hand, which the dots deliberately do not
 * show. The hero's dots come from the generated draws rolled with "mixed"
 * continuity (hero-act.svelte.ts). The bake stays so a future entry that does
 * flip a prop is marked without anyone remembering to add it.
 */
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StartPlacementData } from "#lib/shared/foundation/domain/models/start-placement-data.js";
import type { TnDElement } from "#lib/features/choreo-card/domain/tnd-element.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { processReversals } from "#lib/shared/create/services/reversal-detector.js";
import {
  CAPS,
  CAP_HAND_PATHS,
  capOnPath,
  capStrip,
  type Cap,
  type CapHandSpin,
} from "#lib/shared/guide-topics/caps-topic.js";
import {
  ZANS_DIAMOND_VARIATIONS,
  zansDiamondStrip,
  type ZansDiamondVariation,
} from "#lib/shared/guide-topics/zans-diamond-topic.js";
import { stripToSequence } from "#lib/shared/guide-topics/strip-to-sequence.js";
import {
  elementOf,
  rotateToStartKey,
  startLocKey,
  tileClosedLoop,
} from "#lib/shared/landing/data/hero-draw-utils.js";

export type AuthoredPoolId = "caps" | "zans";

export interface AuthoredDraw {
  sequence: SequenceData;
  /** The CAP's VTG element, read from what plays. Zan's draws carry none,
   *  like generated draws, so the hero shows no indicator for them. */
  element: TnDElement | null;
  /** Both pools are authored on the diamond, and 90° rotation keeps them there. */
  grid: "diamond";
}

/**
 * Entries to try before giving up on a chain target. Only entries whose hands
 * sit the same way apart as the target's can rotate onto it: about a quarter
 * of each pool (split, together, and the two quarter-apart directions each
 * hold a quarter of the CAPs and of Zan's). Twenty-four tries then miss about
 * one draw in a thousand. A miss returns null and the act moves on to its next
 * source instead of teleporting. Each try is one strip build, well under a
 * frame even at the cap, and the act runs it at background priority.
 */
const MAX_ATTEMPTS = 24;

/** An 8-beat Zan's variation flashes by next to the 12- and 16-beat draws;
 *  played twice it holds the stage about as long. */
const ZANS_REPEAT = 2;

const HAND_PATH_SPINS: readonly CapHandSpin[] = (
  ["pro", "anti"] as const
).flatMap((motion) => [0.5, 1, 1.5].map((turns) => ({ motion, turns })));

/**
 * The CAP pool, enumerated once: the chart's 72, then every hand path with
 * each hand at every spin. capOnPath already doubles a CAP to 24 beats when
 * twelve would leave a prop pointing in, so each entry still closes.
 */
export const HERO_CAP_POOL: readonly Cap[] = [
  ...CAPS,
  ...CAP_HAND_PATHS.flatMap((path) =>
    HAND_PATH_SPINS.flatMap((left) =>
      HAND_PATH_SPINS.map((right) => capOnPath(path, left, right))
    )
  ),
];

export const HERO_ZANS_POOL: readonly ZansDiamondVariation[] =
  ZANS_DIAMOND_VARIATIONS;

/** One pool entry as a playable sequence, before chaining. */
export function capSequence(cap: Cap): SequenceData {
  return stripToSequence(capStrip(cap), { word: cap.word });
}

export function zansSequence(variation: ZansDiamondVariation): SequenceData {
  // STAFF, not the Guide's HAND default: the hero plays props, and HAND
  // motions would come back as straight hand paths and hand pictographs.
  return stripToSequence(zansDiamondStrip(variation, PropType.STAFF), {
    word: variation.word,
    name: "Zan's Diamond",
  });
}

/** What to do with one pool's entries once one has been picked. */
interface PoolPlan {
  size: number;
  build: (index: number) => SequenceData;
  repeat: number;
  withElement: boolean;
}

const POOLS: Record<AuthoredPoolId, PoolPlan> = {
  caps: {
    size: HERO_CAP_POOL.length,
    build: (i) => capSequence(HERO_CAP_POOL[i]!),
    repeat: 1,
    withElement: true,
  },
  zans: {
    size: HERO_ZANS_POOL.length,
    build: (i) => zansSequence(HERO_ZANS_POOL[i]!),
    repeat: ZANS_REPEAT,
    withElement: false,
  },
};

/**
 * Draw one authored sequence from `pool`. When `chainStartPlacement` is given,
 * the draw is rotated to start there; entries that cannot reach it are skipped,
 * and after MAX_ATTEMPTS misses this returns null so the hero act falls through
 * to its next source. A builder that throws counts as a miss, never a crash.
 */
export function drawAuthoredRealization(opts: {
  pool: AuthoredPoolId;
  chainStartPlacement?: StartPlacementData | null;
  random?: () => number;
}): AuthoredDraw | null {
  const plan = POOLS[opts.pool];
  if (plan.size === 0) return null;
  const random = opts.random ?? Math.random;
  const targetKey = opts.chainStartPlacement
    ? startLocKey(opts.chainStartPlacement)
    : null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const index = Math.floor(random() * plan.size);
    let sequence: SequenceData;
    try {
      sequence = plan.build(index);
    } catch {
      continue;
    }

    if (targetKey) {
      const rotated = rotateToStartKey(sequence, targetKey);
      if (!rotated) continue;
      sequence = rotated;
    }

    if (plan.repeat > 1) sequence = tileClosedLoop(sequence, plan.repeat);

    // Marked circular so the detector compares the first beat against the
    // last: the hero loops the draw, so a flip across the seam is a real
    // reversal the visitor sees.
    sequence = processReversals({ ...sequence, isCircular: true });

    const element = plan.withElement ? elementOf(sequence) : null;

    return {
      sequence: JSON.parse(JSON.stringify(sequence)) as SequenceData,
      element,
      grid: "diamond",
    };
  }

  return null;
}
