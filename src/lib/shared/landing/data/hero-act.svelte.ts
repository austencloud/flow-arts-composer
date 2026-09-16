/**
 * Hero Attract Act
 *
 * Owns the homepage hero's self-playing show: instead of one sequence
 * looping forever, the hero walks through a small cycle of props, playing a
 * freshly generated LOOP for each one before handing off to the next.
 *
 * The handoff is chained and pre-fetched so it never stalls or teleports:
 * while the current sequence plays, the next one generates in the
 * background, constrained to start where the current sequence's CIRCULAR
 * loop ends (which is also where it started — see
 * sequence-loopability-checker.ts). InlineAnimationPlayer accepts the
 * prefetched sequence inside that exact playback frame, so its clock never
 * pauses or revisits the incoming sequence's stationary start hold.
 *
 * SSR-safe by construction: state starts without a sequence, leaving the
 * host's fixed stage in its pending state. `start()` chooses the opening prop
 * and generates its first sequence after hydration, then pre-fetches the rest
 * of the act.
 */
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type { TnDElement } from "$lib/features/choreo-card/domain/tnd-element";
import type { PreparedSequenceHandoff } from "$lib/shared/animation-engine/domain/chaining-types";
import { generatePerVisitDemo } from "$lib/shared/landing/data/per-visit-demo";
import { runAtBackgroundPriority } from "$lib/shared/foundation/utils/background-scheduling";

/** Fraction of hero draws that come from the shape matrix (rest are generated). */
const DEFAULT_MATRIX_FRACTION = 2 / 3;
/** Fraction of GENERATED draws rendered in box mode (45° hand-path rotation). */
const DEFAULT_BOX_FRACTION = 1 / 3;

/** One hero draw: the sequence plus its TnD element (present only for shape-matrix
 *  draws — generated draws carry no element and show no indicator). */
interface HeroDraw {
  sequence: SequenceData;
  element: TnDElement | null;
}

/**
 * Poi is deliberately excluded from the cycle. Austen's 2026-07-18 poi
 * legality ruling: only 0-turn flowers are legal (isolation is otherwise
 * impossible, 0-turn antis are impractical); everything with turns > 0 is
 * fine. The act's sequences are arbitrary generated LOOPs with no poi
 * legality check applied to the draw, so a poi-illegal (turns = 0, or
 * whatever the generator happens to produce) sequence could land. The
 * homepage must never show poi performing a move that isn't actually
 * possible with the prop, so poi stays out of this cycle until the
 * generator can filter for legality itself.
 */
export const PROP_CYCLE: readonly PropType[] = [
  PropType.STAFF,
  PropType.FAN,
  PropType.CLUB,
  PropType.BUUGENG,
];

/**
 * Loops of the current sequence to watch before advancing to the next prop.
 * The favorite preset (per-visit-demo.ts) is a 16-count sequence, which at
 * 60 BPM runs about 16 seconds — tune this constant for how long each prop
 * holds the stage, not the loop-completion wiring itself.
 */
export const PASSES_PER_SEQUENCE = 1;

function nextPropInCycle(current: PropType): PropType {
  const index = PROP_CYCLE.indexOf(current);
  // indexOf returns -1 only if `current` somehow isn't in the cycle (can't
  // happen from this module's own state, but falling back to the first prop
  // instead of crashing keeps the act running if it ever does).
  const safeIndex = index === -1 ? 0 : index;
  return PROP_CYCLE[(safeIndex + 1) % PROP_CYCLE.length] ?? PropType.STAFF;
}

export function createHeroAct(options?: {
  /** Injectable so the opening prop stays deterministic in tests. The real
   *  homepage uses Math.random, sampled once inside the client-only start(). */
  random?: () => number;
  /** Fraction of draws sourced from the shape matrix (default 2/3). Set 0 to
   *  disable — then no source roll is drawn (random call order is preserved). */
  matrixFraction?: number;
  /** Fraction of GENERATED draws shown in box mode (default 1/3). Set 0 to
   *  disable — then no box roll is drawn. */
  boxFraction?: number;
  /** A baked SSR-safe opening sequence. The homepage uses this to make the
   *  preview immediately meaningful without running the generator at boot. */
  initialSequence?: SequenceData | null;
}) {
  const random = options?.random ?? Math.random;
  const matrixFraction = options?.matrixFraction ?? DEFAULT_MATRIX_FRACTION;
  const boxFraction = options?.boxFraction ?? DEFAULT_BOX_FRACTION;
  let current = $state<SequenceData | null>(options?.initialSequence ?? null);
  let currentElement = $state<TnDElement | null>(null);
  let currentProp = $state<PropType>(PropType.STAFF);
  // True while the first sequence is generating or a later swap is in flight.
  // This drives the dice button's "Rolling..." state and guards against a
  // natural loop-boundary advance racing a manual dice press.
  let busy = $state(false);

  // The sequence generating in the background to follow `current`, and the
  // prop it will play with. Null while generation hasn't landed yet — the
  // loop-boundary handler treats that as "not ready" and keeps looping
  // `current` instead of advancing into a gap.
  let preparedNext: HeroDraw | null = null;
  let preparedNextProp: PropType = nextPropInCycle(currentProp);
  let passesSinceAdvance = 0;
  let started = false;

  function pickInitialProp(): PropType {
    const index = Math.floor(random() * PROP_CYCLE.length);
    return PROP_CYCLE[index] ?? PropType.STAFF;
  }

  /**
   * Produce one hero draw. Two in three come from the shape matrix (a
   * constructed cell+mode realization with a re-derived TnD element); the rest
   * are the generated per-visit LOOP, a third of which render in box mode. Both
   * heavy paths (matrix pool, box transform) are dynamic-imported so the initial
   * landing bundle stays lean and Firebase-free.
   */
  async function drawHeroSequence(opts: {
    propType: PropType;
    chainStartPlacement?: StartPlacementData | null;
  }): Promise<HeroDraw> {
    // Short-circuit so a disabled fraction (0) draws no random — keeps the
    // random call order identical to the pre-matrix act for callers that opt out.
    if (matrixFraction > 0 && random() < matrixFraction) {
      try {
        const { drawMatrixRealization } =
          await import("$lib/shared/landing/data/shape-matrix-hero-pool");
        const draw = await drawMatrixRealization({
          chainStartPlacement: opts.chainStartPlacement ?? null,
          random,
        });
        if (draw) return { sequence: draw.sequence, element: draw.element };
      } catch {
        // fall through to the generated draw
      }
    }

    let sequence = await generatePerVisitDemo({
      propType: opts.propType,
      // Only constrain the start when chaining — an unconstrained first draw
      // omits it entirely (matches the pre-matrix call shape).
      ...(opts.chainStartPlacement
        ? { startPlacement: opts.chainStartPlacement }
        : {}),
    });
    if (boxFraction > 0 && random() < boxFraction) {
      try {
        const { applyBoxMode } =
          await import("$lib/features/choreo-card/services/deck-variation");
        sequence = applyBoxMode(sequence, "box");
      } catch {
        // keep the diamond sequence on any transform failure
      }
    }
    return { sequence, element: null };
  }

  /** Kicks off generation of the sequence that will follow `current`,
   *  chained to start where `current`'s CIRCULAR loop ends. `fromProp` is the
   *  prop the act has just advanced into.
   *
   *  The draw is deferred to background priority instead of firing synchronously
   *  off the advance. Nothing waits on it — what it produces is not due until
   *  the current LOOP finishes a pass (~16 s at the preset's 60 BPM) — so it
   *  must never compete with the frame rendering the swap the user is watching.
   *  If it has not landed by the next boundary, `offerSequenceBoundary` already
   *  loops the current sequence one more pass, which is the correct
   *  degradation. */
  function prepareNext(fromProp: PropType = currentProp): void {
    if (!current) return;
    const targetProp = nextPropInCycle(fromProp);
    preparedNextProp = targetProp;
    preparedNext = null;
    const chainedStartPlacement = current.startPlacement ?? null;
    runAtBackgroundPriority(() => {
      // A dice press between scheduling and running may have moved the act on;
      // re-check before spending anything on a draw nobody is waiting for.
      if (preparedNextProp !== targetProp) return;
      void drawHeroSequence({
        propType: targetProp,
        chainStartPlacement: chainedStartPlacement,
      }).then((draw) => {
        // A dice press mid-generation may have already advanced past this
        // draw's target prop; only claim it if it's still the one we asked for.
        if (preparedNextProp === targetProp) {
          preparedNext = draw;
        }
      });
      // drawHeroSequence never rejects (matrix failures fall back to the
      // generated draw, which itself falls back to FALLBACK_DEMO), so there's
      // no separate failure branch to handle here.
    });
  }

  /** Swaps to the next sequence for a manual dice press: the pre-generated
   *  one if it's ready, otherwise generates on the spot. */
  async function advance(): Promise<void> {
    if (busy || !current) return;
    busy = true;
    try {
      let draw = preparedNext;
      let prop = preparedNextProp;
      if (!draw) {
        prop = nextPropInCycle(currentProp);
        const chainedStartPlacement = current.startPlacement ?? null;
        draw = await drawHeroSequence({
          propType: prop,
          chainStartPlacement: chainedStartPlacement,
        });
      }
      // A manual roll is one state transaction: the incoming word must never
      // render for even one frame with the outgoing prop. The renderer begins
      // its sprite crossfade from this prop-type change.
      current = draw.sequence;
      currentElement = draw.element;
      currentProp = prop;
      passesSinceAdvance = 0;
      prepareNext(prop);
    } finally {
      busy = false;
    }
  }

  /**
   * Offers the prefetched continuation at a natural playback boundary. The
   * controller initializes it first, then calls `accept` within the same frame
   * to publish the matching sequence and prop together. If generation has not
   * landed, returning null leaves the current LOOP running until the next pass.
   */
  function offerSequenceBoundary(): PreparedSequenceHandoff | null {
    passesSinceAdvance += 1;
    if (passesSinceAdvance < PASSES_PER_SEQUENCE) return null;
    if (busy || !preparedNext) return null;

    const draw = preparedNext;
    const prop = preparedNextProp;
    return {
      sequence: draw.sequence,
      accept() {
        // The offer and acceptance happen synchronously in one rAF callback.
        // The identity guard keeps this transaction safe if that contract is
        // ever widened to permit an asynchronous controller.
        if (busy || preparedNext !== draw || preparedNextProp !== prop) {
          return;
        }
        current = draw.sequence;
        currentElement = draw.element;
        currentProp = prop;
        preparedNext = null;
        passesSinceAdvance = 0;
        prepareNext(prop);
      },
    };
  }

  /** Dice button: advance right now, regardless of pass count. Returns the
   *  in-flight promise (harmless for the button's fire-and-forget onclick,
   *  and lets tests await the swap deterministically). */
  function advanceNow(): Promise<void> {
    return advance();
  }

  /** Generates the first playable sequence, then starts background
   *  pre-generation for the next prop. Call once from the host's onMount. */
  function start(): void {
    if (started) return;
    started = true;

    if (current) {
      preparedNextProp = nextPropInCycle(currentProp);
      prepareNext(currentProp);
      return;
    }

    // Choose only after hydration. Running this during factory construction
    // would let SSR and the browser pick different props for the same page.
    const initialProp = pickInitialProp();
    currentProp = initialProp;
    preparedNextProp = nextPropInCycle(initialProp);
    busy = true;
    void drawHeroSequence({ propType: initialProp })
      .then((draw) => {
        current = draw.sequence;
        currentElement = draw.element;
        passesSinceAdvance = 0;
        prepareNext(initialProp);
      })
      .finally(() => {
        busy = false;
      });
  }

  return {
    get sequence() {
      return current;
    },
    get element() {
      return currentElement;
    },
    get propType() {
      return currentProp;
    },
    get rerolling() {
      return busy;
    },
    start,
    offerSequenceBoundary,
    advanceNow,
  };
}
