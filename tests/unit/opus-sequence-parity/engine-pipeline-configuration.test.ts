/**
 * Which engine configuration would actually replace the app-side executors?
 *
 * READ-ONLY AUDIT EVIDENCE. `loop-executor-parity.test.ts` establishes that
 * the app path and the engine's *deprecated* `getExecutor(type)` path diverge
 * badly at period 4. This suite asks the follow-up question the migration
 * needs answered: is there an engine configuration that reproduces the app's
 * behaviour, and for which LOOP types?
 *
 * Four configurations are measured, all starting from the same canonical seed:
 *
 *   legacy-raw   `loopSpecFromLegacy(type, period)` → `executeSpec`
 *                — what `LOOPExecutorSelector.getExecutor()` does today, and
 *                  therefore what `mcp-server-pkg/src/core/loop/loop-adapter`
 *                  ships. Gives EVERY component the requested period.
 *
 *   rhythm-raw   `loopSpecFromLegacyRhythm(type, period)` → `executeSpec`
 *                — what `mcp-server/src/core/engine-generation-adapter` uses.
 *                  Only ROTATED gets a period-4 orbit; mirror/flip/swap/invert
 *                  stay order 2.
 *
 *   legacy-full  legacy-raw → `closeOrientationCycle` → `reduceToMinimalLoop`
 *                — what `SequenceBuilder.applyLoop` runs for fresh generation.
 *
 *   rhythm-full  rhythm-raw → the same two post-stages.
 *
 * The headline result: the app's `buildStrictQuarters` orientation-closure
 * guard has no equivalent in any single engine *executor*; its equivalent is
 * the engine's post-execution `closeOrientationCycle` + `reduceToMinimalLoop`
 * pair. Parity is a property of the whole pipeline, not of the executor — so
 * Phase 3 cannot swap the executor alone.
 *
 * Every expectation is a lock on measured current behaviour. See
 * `docs/reports/opus-batch-2026-09-12/sequence-engine-parity.md`.
 */

import { describe, expect, it } from "vitest";

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  closeOrientationCycle,
  loopExecutorSelector as engineSelector,
  loopSpecFromLegacy,
  loopSpecFromLegacyRhythm,
  reduceToMinimalLoop,
} from "@tka/sequence-engine/loop";

import { cloneSeed } from "./harness/canonical-fixtures";
import { corpus } from "./harness/corpus";
import { compareOutputs } from "./harness/parity-diff";
import { positionCloses } from "./harness/invariants";
import {
  APP_SUPPORTED_LOOP_TYPES,
  AppLOOPType,
  AppPeriod,
  runApp,
  toEngineLoopType,
} from "./harness/run-both-paths";

const CONFIGURATIONS = [
  "legacy-raw",
  "rhythm-raw",
  "legacy-full",
  "rhythm-full",
] as const;
type Configuration = (typeof CONFIGURATIONS)[number];

function runConfiguration(
  seed: StepData[],
  loopType: AppLOOPType,
  periodNumber: number,
  configuration: Configuration
): { ok: true; steps: StepData[] } | { ok: false; message: string } {
  const engineType = String(toEngineLoopType(loopType));
  const spec = configuration.startsWith("legacy")
    ? loopSpecFromLegacy(engineType, periodNumber)
    : loopSpecFromLegacyRhythm(engineType, periodNumber);

  try {
    let steps = engineSelector.executeSpec(
      cloneSeed(seed) as never,
      spec
    ) as never as StepData[];

    if (configuration.endsWith("full")) {
      const closed = closeOrientationCycle(steps as never, {
        seedStepCount: seed.length - 1,
      });
      steps = reduceToMinimalLoop(closed.steps).steps as never as StepData[];
    }

    return { ok: true, steps };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

interface ConfigurationTally {
  readonly matches: number;
  readonly differs: number;
  readonly threw: number;
  readonly open: number;
  readonly firstThrow: string | null;
}

interface TypeResult {
  readonly loopType: AppLOOPType;
  readonly samples: number;
  readonly byConfiguration: Record<Configuration, ConfigurationTally>;
}

function measure(loopType: AppLOOPType, period: AppPeriod): TypeResult {
  const periodNumber = period === AppPeriod.QUARTERED ? 4 : 2;
  const counters: Record<
    Configuration,
    { matches: number; differs: number; threw: number; open: number; firstThrow: string | null }
  > = {
    "legacy-raw": { matches: 0, differs: 0, threw: 0, open: 0, firstThrow: null },
    "rhythm-raw": { matches: 0, differs: 0, threw: 0, open: 0, firstThrow: null },
    "legacy-full": { matches: 0, differs: 0, threw: 0, open: 0, firstThrow: null },
    "rhythm-full": { matches: 0, differs: 0, threw: 0, open: 0, firstThrow: null },
  };

  let samples = 0;
  let admitted: StepData[] | null = null;
  const accept = (seed: StepData[]) => {
    const outcome = runApp(seed, loopType, period);
    admitted = outcome.kind === "ok" ? outcome.steps : null;
    return admitted !== null;
  };

  for (const entry of corpus(accept)) {
    const appSteps: StepData[] | null = admitted;
    if (appSteps === null) continue;
    samples++;

    for (const configuration of CONFIGURATIONS) {
      const counter = counters[configuration];
      const result = runConfiguration(
        entry.steps,
        loopType,
        periodNumber,
        configuration
      );
      if (!result.ok) {
        counter.threw++;
        counter.firstThrow ??= result.message;
        continue;
      }
      if (!positionCloses(result.steps)) counter.open++;
      const comparison = compareOutputs(appSteps, result.steps);
      if (comparison.lengthMatches && comparison.semantic.length === 0) {
        counter.matches++;
      } else {
        counter.differs++;
      }
    }
  }

  return { loopType, samples, byConfiguration: counters };
}

const QUARTERED: TypeResult[] = APP_SUPPORTED_LOOP_TYPES.map((loopType) =>
  measure(loopType, AppPeriod.QUARTERED)
).filter((r) => r.samples > 0);

function typesFullyReproducedBy(configuration: Configuration): string[] {
  return QUARTERED.filter(
    (r) => r.byConfiguration[configuration].matches === r.samples
  )
    .map((r) => String(r.loopType))
    .sort();
}

function result(loopType: AppLOOPType): TypeResult {
  const found = QUARTERED.find((r) => r.loopType === loopType);
  if (!found) throw new Error(`No quartered measurement for ${loopType}`);
  return found;
}

describe("engine pipeline configuration — period 4", () => {
  it("the shipped legacy conversion reproduces the app for pure ROTATED only", () => {
    expect(typesFullyReproducedBy("legacy-raw")).toEqual(["rotated"]);
  });

  it("the rhythm conversion recovers the composites whose non-rotation parts are order 2", () => {
    expect(typesFullyReproducedBy("rhythm-raw")).toEqual([
      "mirrored_inverted",
      "mirrored_inverted_rotated",
      "mirrored_rotated",
      "mirrored_swapped",
      "rotated",
      "swapped_inverted",
    ]);
  });

  it("the post-execution stages recover the pure order-2 transforms instead", () => {
    // `closeOrientationCycle` re-expands when orientation has not closed and
    // `reduceToMinimalLoop` folds a literal repeat back down — together they
    // reproduce what `buildStrictQuarters` decides up front.
    expect(typesFullyReproducedBy("legacy-full")).toEqual([
      "flipped",
      "mirrored",
      "mirrored_inverted_rotated",
      "mirrored_rotated",
      "swapped",
    ]);
  });

  it("no single configuration reproduces the app across all LOOP types", () => {
    for (const configuration of CONFIGURATIONS) {
      expect(
        `${configuration}: ${typesFullyReproducedBy(configuration).length}/${QUARTERED.length}`
      ).not.toBe(`${configuration}: ${QUARTERED.length}/${QUARTERED.length}`);
    }
  });

  it("two LOOP types are reproduced by no configuration at all", () => {
    const unreconciled = QUARTERED.filter((r) =>
      CONFIGURATIONS.every((c) => r.byConfiguration[c].matches === 0)
    )
      .map((r) => String(r.loopType))
      .sort();

    expect(unreconciled).toEqual([
      "mirrored_rotated_inverted_swapped",
      "rotated_inverted",
    ]);
  });

  it("ROTATED_INVERTED at period 4 leaves the legacy conversion's LOOP open on every seed", () => {
    const rotatedInverted = result(AppLOOPType.ROTATED_INVERTED);
    const raw = rotatedInverted.byConfiguration["legacy-raw"];
    expect(`open ${raw.open}/${rotatedInverted.samples}`).toBe(
      `open ${rotatedInverted.samples}/${rotatedInverted.samples}`
    );

    // SequenceBuilder's `closeOrientationCycle` then refuses the result, so
    // fresh generation fails loudly. `mcp-server-pkg`'s adapter has no such
    // stage and returns the open sequence with `isCircular: true`.
    const full = rotatedInverted.byConfiguration["legacy-full"];
    expect(`threw ${full.threw}/${rotatedInverted.samples}`).toBe(
      `threw ${rotatedInverted.samples}/${rotatedInverted.samples}`
    );
    expect(full.firstThrow).toContain(
      "Cannot close orientation on an open position pattern"
    );
  });

  it("ROTATED_SWAPPED_INVERTED at period 4 is refused outright by the rhythm conversion", () => {
    // The rhythm spec gives ROTATED its own period-4 stage, and
    // StrictRotatedExecutor validates the seed's position pair — which a
    // start===end seed (the pair this LOOP type's app executor requires)
    // cannot satisfy.
    const rsi = result(AppLOOPType.ROTATED_SWAPPED_INVERTED);
    const rhythm = rsi.byConfiguration["rhythm-raw"];
    expect(`threw ${rhythm.threw}/${rsi.samples}`).toBe(
      `threw ${rsi.samples}/${rsi.samples}`
    );
    expect(rhythm.firstThrow).toContain("Invalid position pair for quartered LOOP");
  });
});
