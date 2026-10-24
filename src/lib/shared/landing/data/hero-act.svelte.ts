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
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StartPlacementData } from "#lib/shared/foundation/domain/models/start-placement-data.js";
import type { TnDElement } from "#lib/features/choreo-card/domain/tnd-element.js";
import type { PreparedSequenceHandoff } from "#lib/shared/animation-engine/domain/chaining-types.js";
import { generatePerVisitDemo } from "#lib/shared/landing/data/per-visit-demo.js";
import type { PerVisitContinuity } from "#lib/shared/landing/data/per-visit-demo-core.js";
import { runAtBackgroundPriority } from "#lib/shared/foundation/utils/background-scheduling.js";

/**
 * Where hero draws come from. Before 2026-10-23 two in three were shape-matrix
 * flowers and the rest smooth generated rolls, and neither can reverse a prop,
 * so the reversal-dot slot beside every glyph stayed empty forever. The table
 * now also plays the Guide's authored CAPs and Zan's Diamond variations, and
 * half the generated rolls let the engine reverse.
 *
 * - flowers: a shape-matrix realization (shape-matrix-hero-pool.ts)
 * - generated: the per-visit LOOP roll (per-visit-demo.ts)
 * - caps: Gage DeMello's CAPs and the hand paths spun at a turn
 * - zans: Zan's Diamond and its variations (both in hero-authored-pool.ts)
 *
 * The authored CAPs and Zan's variations never flip a prop's spin, so they
 * show no dots either; the dots come from the mixed generated half. See
 * hero-authored-pool.ts for why.
 *
 * Spec: docs/superpowers/specs/2026-10-23-hero-roll-sources-design.md
 */
export type HeroSource = "flowers" | "generated" | "caps" | "zans";

export type HeroSourceWeights = Partial<Record<HeroSource, number>>;

export const HERO_SOURCE_WEIGHTS: Readonly<Record<HeroSource, number>> = {
  flowers: 1 / 3,
  generated: 1 / 3,
  caps: 1 / 6,
  zans: 1 / 6,
};

/**
 * The one order sources are listed in, used both to map the source roll onto
 * the weights and to fall through when a source comes back empty (a pool that
 * cannot reach the chain target, failed to load, or threw). Generated is last
 * because it never comes back empty: it falls back to the baked fixture, so
 * every draw lands.
 */
const SOURCE_ORDER: readonly HeroSource[] = [
  "flowers",
  "caps",
  "zans",
  "generated",
];

/** Fraction of GENERATED draws rendered in box mode (45° hand-path rotation). */
const DEFAULT_BOX_FRACTION = 1 / 3;

/**
 * Fraction of GENERATED draws rolled with "mixed" continuity, where the engine
 * may reverse a prop. The other half stays smooth so the hero still shows the
 * unbroken flow it always has. Measured 2026-10-23 against the real generator:
 * eight of ten mixed rolls carried reversals (8 to 12 of 16 steps), so "mixed"
 * is enough and the harsher "choppy" (every roll reverses) is not needed.
 */
const DEFAULT_MIXED_FRACTION = 1 / 2;

/** One hero draw: the sequence plus its TnD element (present for flowers and
 *  CAPs — generated and Zan's draws carry no element and show no indicator). */
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
  /** Relative weight of each draw source (default HERO_SOURCE_WEIGHTS). A
   *  source left out or set to 0 is never picked and is skipped on fall-through
   *  (generated stays the last resort regardless). When only one source has
   *  weight, no source roll is drawn, so tests can force one source without
   *  shifting the random call order. */
  sourceWeights?: HeroSourceWeights;
  /** Fraction of GENERATED draws shown in box mode (default 1/3). Set 0 to
   *  disable — then no box roll is drawn. */
  boxFraction?: number;
  /** Fraction of GENERATED draws rolled with "mixed" continuity (default 1/2).
   *  Set 0 to disable — then no continuity roll is drawn and the roll keeps
   *  the generator's smooth default. */
  mixedFraction?: number;
  /** A baked SSR-safe opening sequence. The homepage uses this to make the
   *  preview immediately meaningful without running the generator at boot. */
  initialSequence?: SequenceData | null;
}) {
  const random = options?.random ?? Math.random;
  const weights = options?.sourceWeights ?? HERO_SOURCE_WEIGHTS;
  const weightOf = (source: HeroSource): number =>
    Math.max(0, weights[source] ?? 0);
  const weightedSources = SOURCE_ORDER.filter((s) => weightOf(s) > 0);
  const totalWeight = weightedSources.reduce((sum, s) => sum + weightOf(s), 0);
  const boxFraction = options?.boxFraction ?? DEFAULT_BOX_FRACTION;
  const mixedFraction = options?.mixedFraction ?? DEFAULT_MIXED_FRACTION;
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
  // Once a visitor touches the hero or leaves it, the act stops advancing on
  // its own so the word they saw stays the page's word. A dice press still
  // advances. There is no release; a reload starts fresh.
  let held = $state(false);

  function hold(): void {
    held = true;
  }

  function pickInitialProp(): PropType {
    const index = Math.floor(random() * PROP_CYCLE.length);
    return PROP_CYCLE[index] ?? PropType.STAFF;
  }

  /** Roll which source this draw starts from. With a single weighted source
   *  there is nothing to choose, so no random is spent. */
  function pickSource(): HeroSource {
    if (weightedSources.length === 0) return "generated";
    if (weightedSources.length === 1) return weightedSources[0]!;
    let roll = random() * totalWeight;
    for (const source of weightedSources) {
      roll -= weightOf(source);
      if (roll < 0) return source;
    }
    // Float rounding can leave a hair of roll past the last bucket.
    return weightedSources[weightedSources.length - 1]!;
  }

  /** One constructed (non-generated) source's draw, or null when it has none
   *  for this chain target. Every pool is dynamic-imported so the initial
   *  landing bundle stays lean and Firebase-free; a pool that fails to load or
   *  throws counts as empty. */
  async function drawConstructed(
    source: Exclude<HeroSource, "generated">,
    chainStartPlacement: StartPlacementData | null
  ): Promise<HeroDraw | null> {
    try {
      if (source === "flowers") {
        const { drawMatrixRealization } =
          await import("#lib/shared/landing/data/shape-matrix-hero-pool.js");
        const draw = await drawMatrixRealization({
          chainStartPlacement,
          random,
        });
        return draw ? { sequence: draw.sequence, element: draw.element } : null;
      }
      const { drawAuthoredRealization } =
        await import("#lib/shared/landing/data/hero-authored-pool.js");
      const draw = drawAuthoredRealization({
        pool: source,
        chainStartPlacement,
        random,
      });
      return draw ? { sequence: draw.sequence, element: draw.element } : null;
    } catch {
      return null;
    }
  }

  /**
   * Produce one hero draw. The source roll picks a starting source by weight;
   * an empty source hands on to the next weighted one in SOURCE_ORDER, ending
   * at the generated roll, which always lands.
   */
  async function drawHeroSequence(opts: {
    propType: PropType;
    chainStartPlacement?: StartPlacementData | null;
  }): Promise<HeroDraw> {
    const chainStartPlacement = opts.chainStartPlacement ?? null;
    const first = pickSource();
    for (const source of SOURCE_ORDER.slice(SOURCE_ORDER.indexOf(first))) {
      if (source === "generated") break;
      if (weightOf(source) <= 0) continue;
      const draw = await drawConstructed(source, chainStartPlacement);
      if (draw) return draw;
    }
    return drawGenerated(opts.propType, chainStartPlacement);
  }

  /** The generated per-visit LOOP: half rolled smooth and half mixed, a third
   *  of them shown in box mode. */
  async function drawGenerated(
    propType: PropType,
    chainStartPlacement: StartPlacementData | null
  ): Promise<HeroDraw> {
    // Short-circuit so a disabled fraction (0) draws no random and passes no
    // continuity, keeping the call shape the act had before the mixed half.
    const continuity: PerVisitContinuity | null =
      mixedFraction > 0
        ? random() < mixedFraction
          ? "mixed"
          : "smooth"
        : null;
    let sequence = await generatePerVisitDemo({
      propType,
      // Only constrain the start when chaining — an unconstrained first draw
      // omits it entirely (matches the pre-matrix call shape).
      ...(chainStartPlacement ? { startPlacement: chainStartPlacement } : {}),
      ...(continuity ? { continuity } : {}),
    });
    if (boxFraction > 0 && random() < boxFraction) {
      try {
        const { applyBoxMode } =
          await import("#lib/features/choreo-card/services/deck-variation.js");
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
      // drawHeroSequence never rejects (an empty or failed source falls
      // through to the generated draw, which itself falls back to
      // FALLBACK_DEMO), so there's no separate failure branch to handle here.
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
    if (held) return null;
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
    get held() {
      return held;
    },
    hold,
    start,
    offerSequenceBoundary,
    advanceNow,
  };
}
