/**
 * The ambient provider that finally connects the combination engine to the
 * real pictograph dataset.
 *
 * The engine asks one question — "what ambient material STARTS at this seam?"
 * — and every test until now answered it with a hand-built stub over the
 * fixtures. This is the production answer: the app's own `motionQueryHandler`,
 * the same service the construct tab's option picker asks what may come next.
 *
 * **Why a probe step.** The handler's real entry point is
 * `getNextOptionsForSequence(sequence, gridMode)`, which takes the
 * sequence-so-far and matches each candidate's START locations against the
 * last step's END locations (see `option-loader.ts` for the app's use of the
 * same call). The engine has no sequence at this point — it has a bare seam,
 * which is precisely the pair of hand locations
 * `getGridLocationsFromPlacement` already maps a `GridPlacement` to. So a
 * one-step PROBE is built that simply STANDS at the seam (both hands static,
 * start location = end location), and the handler answers with everything that
 * can follow it. That reuses the app's seam matching rather than
 * re-implementing a by-start-placement scan over the dataframe.
 *
 * The probe's orientations are IN/IN and are deliberately meaningless: a bare
 * seam carries no orientation history. The handler rewrites each option's start
 * orientation to continue from the probe, and the engine's splice builder
 * re-derives the whole chain's orientations from the assembled sequence's own
 * start anyway (`recalculateAllOrientations`), so nothing downstream trusts the
 * value invented here. Locations and placement labels are what matter, and those
 * come from the dataframe untouched.
 *
 * **What gets filtered out, and why it is counted.** Three gates, all of which
 * the engine ALSO applies to whatever a provider hands it (a provider is a
 * collaborator, not an authority):
 *
 *   1. the step must actually start at the seam that was asked about —
 *      `getNextOptionsForSequence` has a documented "no matches, return
 *      everything" fallback, and an unguarded provider would faithfully relay
 *      the entire dataframe as if it belonged at that seam;
 *   2. its letter must belong to a roster-confirmed ambient base
 *      (`ambientLetterSet`) — connective tissue, not a third card;
 *   3. its placement labels must agree with its own motion locations
 *      (`placementLabelsMatchLocations`).
 *
 * Gate 3 is the one worth watching. The engine drops mismatched material and
 * warns exactly ONCE per search, so a dataframe that ever started labelling a
 * location pair differently than `getGridPlacementFromLocations` does would
 * quietly cost real bridges. `stats` therefore counts every rejection by
 * category, on the provider itself, where it is inspectable from a test or a
 * lab panel instead of scrolling past in a console. Pinned at zero across all
 * 1,152 shipped rows in `facade.test.ts`.
 */

import { ambientLetterSet } from "../domain/base-sequence-registry";
import type { AmbientOptionProvider, SeamState } from "../domain/types";
import { placementLabelsMatchLocations } from "./placement-groups";

import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { getGridLocationsFromPlacement } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { motionQueryHandler } from "$lib/shared/pictograph/shared/services/motion-query-handler";

/**
 * Per-provider tally — see the module comment's gate 3.
 *
 * Counters are CUMULATIVE for the life of the provider, and the facade keeps
 * one provider per grid mode for the life of the process, so these are
 * per-process totals across every search, not per-search figures. A caller
 * that wants a delta takes two snapshots and subtracts.
 */
export interface RuntimeAmbientStats {
  /** Distinct seams the engine asked about (cache hits excluded). */
  readonly seamsQueried: number;
  /** Candidates the dataset offered across those seams, before any filtering. */
  readonly optionsOffered: number;
  /** Dropped: the seam names no location pair, so nothing can start there. */
  readonly seamsUnresolved: number;
  /**
   * Seams where the handler relayed its ENTIRE row set instead of matches —
   * its documented "no matching options found" fallback, which means the seam
   * genuinely has no continuations.
   *
   * Counted apart from `seamMismatches` because it is the normal, expected
   * answer for an unreachable seam, not suspect material. Measured over all 81
   * `GridPlacement` values in diamond mode (2026-08-04): 16 seams answer with
   * material, 17 name no location pair, and **48 hit this fallback** — folding
   * those into `seamMismatches` would have added 48 x 576 = 27,648 routine
   * rejections and buried the label-gate signal completely.
   */
  readonly fallbackRelays: number;
  /** Dropped: did not actually start at the requested seam. */
  readonly seamMismatches: number;
  /** Dropped: letter belongs to no roster-confirmed ambient base. */
  readonly letterRejections: number;
  /** Dropped: placement labels disagree with the step's own motion locations. */
  readonly labelMismatches: number;
  /** Handed to the engine. */
  readonly optionsKept: number;
}

export interface RuntimeAmbientProvider extends AmbientOptionProvider {
  /** Live counters. Use `snapshotAmbientStats` for a value that will not move. */
  readonly stats: RuntimeAmbientStats;
}

type MutableStats = {
  -readonly [K in keyof RuntimeAmbientStats]: number;
};

/** A frozen copy — safe to hold across further searches. */
export function snapshotAmbientStats(
  stats: RuntimeAmbientStats
): RuntimeAmbientStats {
  return Object.freeze({ ...stats });
}

/**
 * A one-step sequence that simply STANDS at the seam — both hands static at
 * the seam's own locations, so the handler's "what can follow this?" matching
 * resolves to "what can start here?".
 */
function buildSeamProbe(seam: SeamState, gridMode: GridMode): StepData {
  const [leftLocation, rightLocation] = getGridLocationsFromPlacement(seam);
  const stand = (color: HandSide, location: GridLocation) =>
    createMotionData({
      hand: color,
      motionType: MotionType.STATIC,
      rotationDirection: RotationDirection.NO_ROTATION,
      startLocation: location,
      endLocation: location,
      turns: 0,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
    });

  return createStepData({
    letter: null,
    startPlacement: seam,
    endPlacement: seam,
    gridMode,
    motions: {
      [HandSide.LEFT]: stand(HandSide.LEFT, leftLocation),
      [HandSide.RIGHT]: stand(HandSide.RIGHT, rightLocation),
    },
  });
}

/**
 * Ambient material from the live pictograph dataset, one seam at a time.
 *
 * Results are memoized per seam as PROMISES, not values: the engine expands its
 * ambient pool breadth-first and runs a hop's lookups together, so two
 * concurrent asks for the same seam must share one dataset query rather than
 * race into two.
 */
export function createRuntimeAmbientProvider(
  gridMode: GridMode
): RuntimeAmbientProvider {
  const eligibleLetters = ambientLetterSet();
  const cache = new Map<SeamState, Promise<readonly StepData[]>>();
  const stats: MutableStats = {
    seamsQueried: 0,
    optionsOffered: 0,
    seamsUnresolved: 0,
    fallbackRelays: 0,
    seamMismatches: 0,
    letterRejections: 0,
    labelMismatches: 0,
    optionsKept: 0,
  };

  /**
   * How many rows this grid mode holds, resolved once and reused — the size
   * the handler's fallback relays back when nothing matched. Memoized as a
   * promise so concurrent first calls share the one query.
   */
  let rowCount: Promise<number> | null = null;
  const totalRows = (): Promise<number> => {
    rowCount ??= motionQueryHandler
      .queryMotions({ gridMode })
      .then((rows) => rows.length);
    return rowCount;
  };

  let warnedAboutFallback = false;

  const lookUp = async (seam: SeamState): Promise<readonly StepData[]> => {
    stats.seamsQueried++;

    let probe: StepData;
    try {
      probe = buildSeamProbe(seam, gridMode);
    } catch {
      // The seam names no location pair — nothing can start there.
      stats.seamsUnresolved++;
      return [];
    }

    // A dataset failure is NOT an empty seam, and must not be reported as one:
    // the engine treats a throwing provider as an INCOMPLETE pool and
    // suppresses its impossibility proof, which is exactly right — a smaller
    // graph can only manufacture a false theorem. Swallowing the error here
    // and returning [] would hand the engine a subset graph it believed was
    // the whole one. So it propagates.
    const offered = await motionQueryHandler.getNextOptionsForSequence(
      [probe],
      gridMode
    );

    stats.optionsOffered += offered.length;

    // `getNextOptionsForSequence` relays its ENTIRE row set when nothing
    // matched the probe (its documented "no matching options found" fallback).
    // That is the truthful answer for a seam with no continuations — a diamond
    // sequence standing on a box-only placement, say — so the right response is
    // an empty list, not a 576-row filtering pass that would reject every row
    // one at a time and bury the label-gate counter under the noise.
    if (offered.length > 0 && offered.length === (await totalRows())) {
      stats.fallbackRelays++;
      if (!warnedAboutFallback) {
        warnedAboutFallback = true;
        console.warn(
          `[runtime-ambient-provider] no dataset options start at ${seam}; ` +
            "the handler relayed its full row set (its no-match fallback) and " +
            "the seam is being treated as empty. Further seams are counted in " +
            "stats.fallbackRelays rather than warned about."
        );
      }
      return [];
    }

    const kept: StepData[] = [];
    for (const option of offered) {
      if (option.startPlacement !== seam) {
        stats.seamMismatches++;
        continue;
      }
      if (!option.letter || !eligibleLetters.has(option.letter)) {
        stats.letterRejections++;
        continue;
      }
      if (!option.motions.left || !option.motions.right) {
        stats.labelMismatches++;
        continue;
      }

      const step = createStepData({ ...option, isBlank: false });
      if (!placementLabelsMatchLocations(step)) {
        stats.labelMismatches++;
        continue;
      }

      kept.push(step);
    }

    stats.optionsKept += kept.length;
    return kept;
  };

  return {
    stats,
    optionsAt(seam: SeamState): Promise<readonly StepData[]> {
      const cached = cache.get(seam);
      if (cached) return cached;
      // A rejected lookup is evicted rather than memoized: caching a failure
      // would turn one transient dataset error into a permanently empty seam
      // for the life of the provider.
      const pending = lookUp(seam).catch((error: unknown) => {
        cache.delete(seam);
        throw error;
      });
      cache.set(seam, pending);
      return pending;
    },
  };
}
