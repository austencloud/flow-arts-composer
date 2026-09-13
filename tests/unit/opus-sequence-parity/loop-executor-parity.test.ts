/**
 * App-side LOOP executors vs the canonical `@tka/sequence-engine` transforms.
 *
 * READ-ONLY AUDIT EVIDENCE. This suite changes no production code. It records,
 * as executable assertions, exactly where the two LOOP execution paths agree
 * and exactly where they do not, so that Phase 3 of
 * `docs/superpowers/specs/active/2026-04-20-sequence-engine-unification-design.md`
 * ("delete the app-side executors, rewire `SequenceExtender` to the engine")
 * can be planned against measurements rather than assumptions.
 *
 * The two paths compared:
 *
 *   APP    `src/lib/features/create/generate/circular/services/*` via the
 *          `loopExecutorSelector` module singleton. Production reach: the
 *          spell/extend flow (`SequenceExtender.generateExtensionSteps`,
 *          `LOOPValidator`).
 *
 *   ENGINE `@tka/sequence-engine`'s `loopExecutorSelector.getExecutor()`,
 *          which converts LOOPType+Period through `loopSpecFromLegacy` and
 *          runs `executeLOOPSpec`. Production reach: `SequenceBuilder.applyLoop`
 *          when no `loopSpec` wire is supplied, `LOOPExecutor.executeLOOP`,
 *          and `mcp-server-pkg`'s `loop-adapter.executeLOOP`.
 *
 * Both are driven with byte-identical canonical seeds and compared on
 * behaviour only — `id`, the pre-derivation `letter` and the stored reversal
 * flags are classified as representation and reported separately, because
 * both production pipelines overwrite or re-derive them immediately after
 * execution.
 *
 * Every expectation below is a LOCK ON MEASURED CURRENT BEHAVIOUR, not a
 * statement that the current behaviour is correct. The sets named
 * `*_DIVERGENT` and `*_DEFECTIVE` are defect inventories: they should shrink.
 * The plain "these must hold" forms of those same assertions live in
 * `quarantine/` and fail today by design.
 */

import { describe, expect, it } from "vitest";

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

import { corpus } from "./harness/corpus";
import {
  compareOutputs,
  firstSemanticDifference,
  type ParityComparison,
} from "./harness/parity-diff";
import { checkStepCoherence, positionCloses } from "./harness/invariants";
import {
  APP_SUPPORTED_LOOP_TYPES,
  AppLOOPType,
  AppPeriod,
  runApp,
  runEngine,
  toEngineLoopType,
} from "./harness/run-both-paths";

interface CellResult {
  readonly loopType: AppLOOPType;
  readonly period: AppPeriod;
  readonly samples: number;
  readonly identical: number;
  readonly lengthOnly: number;
  readonly semantic: number;
  readonly engineThrew: number;
  readonly appIncoherent: number;
  readonly engineIncoherent: number;
  readonly appOpen: number;
  readonly engineOpen: number;
  readonly firstSemantic: string | null;
}

/**
 * Run the whole corpus for one (loopType, period) cell.
 *
 * Seeds the app executor refuses (its `_validateSequence` position-pair gate)
 * are skipped rather than counted: the audit compares behaviour on inputs both
 * paths are meant to handle. Seed-admission divergence is measured separately
 * in its own test below.
 */
function runCell(loopType: AppLOOPType, period: AppPeriod): CellResult {
  let samples = 0;
  let identical = 0;
  let lengthOnly = 0;
  let semantic = 0;
  let engineThrew = 0;
  let appIncoherent = 0;
  let engineIncoherent = 0;
  let appOpen = 0;
  let engineOpen = 0;
  let firstSemantic: string | null = null;

  // `corpus` yields a seed immediately after `accept` returns true for it, so
  // the app outcome computed during admission is reused rather than recomputed.
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

    if (checkStepCoherence(appSteps).length > 0) appIncoherent++;
    if (!positionCloses(appSteps)) appOpen++;

    const engine = runEngine(entry.steps, loopType, period);
    if (engine.kind !== "ok") {
      engineThrew++;
      continue;
    }

    if (checkStepCoherence(engine.steps).length > 0) engineIncoherent++;
    if (!positionCloses(engine.steps)) engineOpen++;

    const comparison: ParityComparison = compareOutputs(appSteps, engine.steps);
    if (comparison.semantic.length > 0) {
      semantic++;
      firstSemantic ??= `${entry.label} | ${firstSemanticDifference(comparison)}`;
    } else if (!comparison.lengthMatches) {
      lengthOnly++;
      firstSemantic ??= `${entry.label} | ${firstSemanticDifference(comparison)}`;
    } else {
      identical++;
    }
  }

  return {
    loopType,
    period,
    samples,
    identical,
    lengthOnly,
    semantic,
    engineThrew,
    appIncoherent,
    engineIncoherent,
    appOpen,
    engineOpen,
    firstSemantic,
  };
}

const PERIODS = [AppPeriod.HALVED, AppPeriod.QUARTERED] as const;

/** One pass over the whole matrix; every test below reads this. */
const MATRIX: CellResult[] = (() => {
  const cells: CellResult[] = [];
  for (const period of PERIODS) {
    for (const loopType of APP_SUPPORTED_LOOP_TYPES) {
      cells.push(runCell(loopType, period));
    }
  }
  return cells;
})();

function cell(loopType: AppLOOPType, period: AppPeriod): CellResult {
  const found = MATRIX.find(
    (c) => c.loopType === loopType && c.period === period
  );
  if (!found) throw new Error(`No matrix cell for ${loopType}/${period}`);
  return found;
}

function typesWhere(
  period: AppPeriod,
  predicate: (c: CellResult) => boolean
): string[] {
  return MATRIX.filter((c) => c.period === period && c.samples > 0 && predicate(c))
    .map((c) => String(c.loopType))
    .sort();
}

// ---------------------------------------------------------------------------

describe("LOOP executor parity — corpus integrity", () => {
  it("exercises every app-supported LOOP type with real canonical seeds", () => {
    const exercised = MATRIX.filter((c) => c.samples > 0);
    // Quartered rewound is refused by the app executor by design
    // (reverse-of-reverse is the identity), so it has no samples there.
    expect(exercised.length).toBe(APP_SUPPORTED_LOOP_TYPES.length * 2 - 1);

    const thin = exercised
      .filter((c) => c.samples < 24)
      .map((c) => `${c.loopType}/${c.period}=${c.samples}`);
    expect(thin).toEqual([]);
  });

  it("has no cell where the engine refuses a seed the app accepted", () => {
    // The engine's spec executor performs no seed validation on the fused
    // path, so under the legacy LOOPType conversion it accepts everything the
    // app does. A future non-empty result here means the engine gained a gate
    // the app does not have — a migration blocker worth knowing about.
    const refused = MATRIX.filter((c) => c.engineThrew > 0).map(
      (c) => `${c.loopType}/${c.period}: ${c.engineThrew}/${c.samples}`
    );
    expect(refused).toEqual([]);
  });
});

describe("LOOP executor parity — halved (period 2)", () => {
  const FULL_PARITY = [
    "flipped",
    "inverted",
    "mirrored",
    "mirrored_inverted",
    "mirrored_inverted_rotated",
    "mirrored_rotated",
    "mirrored_swapped",
    "rotated",
    "rotated_inverted",
    "rotated_swapped",
    "rotated_swapped_inverted",
    "strict_rewound",
    "swapped",
    "swapped_inverted",
  ];

  /** Documented in the report as divergence D1. */
  const DIVERGENT = ["mirrored_rotated_inverted_swapped", "mirrored_swapped_inverted"];

  it("reaches byte-identical behaviour on 14 of 16 LOOP types", () => {
    expect(
      typesWhere(AppPeriod.HALVED, (c) => c.identical === c.samples)
    ).toEqual(FULL_PARITY);
  });

  it("diverges only on the two mirror+swap composites", () => {
    expect(typesWhere(AppPeriod.HALVED, (c) => c.semantic > 0)).toEqual(
      DIVERGENT
    );
  });

  it("never diverges in length at period 2", () => {
    expect(typesWhere(AppPeriod.HALVED, (c) => c.lengthOnly > 0)).toEqual([]);
  });
});

describe("LOOP executor parity — quartered (period 4)", () => {
  /**
   * The engine's `loopSpecFromLegacy` gives EVERY component the requested
   * period, so a quartered request expands mirror/flip/swap/invert four times.
   * The app's `buildStrictQuarters` stops at period 2 once orientation has
   * closed (the YΦΔ×4 guard). Result: the engine returns twice the app's
   * length whenever the seed's turn total already closes orientation.
   */
  const LENGTH_DIVERGENT = [
    "flipped",
    "inverted",
    "mirrored",
    "mirrored_inverted",
    "mirrored_inverted_rotated",
    "mirrored_rotated",
    "mirrored_swapped",
    "mirrored_swapped_inverted",
    "rotated_swapped_inverted",
    "swapped",
    "swapped_inverted",
  ];

  /**
   * Semantic (not merely longer) divergence at period 4. Two distinct causes:
   * `rotated_inverted` / `rotated_swapped` are divergence D2 (the engine's
   * absorbed-rotation stage plan leaves the LOOP open);
   * the two mirror+swap composites carry divergence D1 into period 4.
   */
  const SEMANTIC_DIVERGENT = [
    "mirrored_rotated_inverted_swapped",
    "mirrored_swapped_inverted",
    "rotated_inverted",
    "rotated_swapped",
  ];

  /** Documented in the report as divergence D2. */
  const ENGINE_OPEN = ["rotated_inverted", "rotated_swapped"];

  it("reaches full parity only for pure ROTATED", () => {
    expect(
      typesWhere(AppPeriod.QUARTERED, (c) => c.identical === c.samples)
    ).toEqual(["rotated"]);
  });

  it("differs in length only for every order-2 component at period 4", () => {
    expect(typesWhere(AppPeriod.QUARTERED, (c) => c.lengthOnly > 0)).toEqual(
      LENGTH_DIVERGENT
    );
  });

  it("differs semantically for the rotation composites and D1's quartered form", () => {
    expect(typesWhere(AppPeriod.QUARTERED, (c) => c.semantic > 0)).toEqual(
      SEMANTIC_DIVERGENT
    );
  });

  it("produces a non-closing engine result for the rotation composites", () => {
    expect(typesWhere(AppPeriod.QUARTERED, (c) => c.engineOpen > 0)).toEqual(
      ENGINE_OPEN
    );

    // …on every single sample, not just some.
    for (const name of ENGINE_OPEN) {
      const c = cell(name as AppLOOPType, AppPeriod.QUARTERED);
      expect(`${name}: ${c.engineOpen}/${c.samples}`).toBe(
        `${name}: ${c.samples}/${c.samples}`
      );
    }
  });

  it("keeps the app result closed for those same rotation composites", () => {
    for (const name of ENGINE_OPEN) {
      const c = cell(name as AppLOOPType, AppPeriod.QUARTERED);
      expect(`${name} appOpen=${c.appOpen}`).toBe(`${name} appOpen=0`);
    }
  });
});

describe("LOOP executor parity — self-coherence of each path", () => {
  /**
   * A step whose stored `endPosition` contradicts its own hands' end
   * locations is wrong regardless of which implementation is canonical.
   * Exactly two app LOOP types produce such steps; the engine produces none.
   */
  const APP_INCOHERENT = [
    "mirrored_rotated_inverted_swapped",
    "mirrored_swapped_inverted",
  ];

  it("engine output is coherent for every type and period", () => {
    const bad = MATRIX.filter((c) => c.engineIncoherent > 0).map(
      (c) => `${c.loopType}/${c.period}: ${c.engineIncoherent}/${c.samples}`
    );
    expect(bad).toEqual([]);
  });

  it("app output is incoherent only for the two mirror+swap composites", () => {
    const bad = [
      ...new Set(
        MATRIX.filter((c) => c.appIncoherent > 0).map((c) => String(c.loopType))
      ),
    ].sort();
    expect(bad).toEqual(APP_INCOHERENT);
  });

  it("app incoherence is accompanied by a LOOP that never returns home", () => {
    const openTypes = [
      ...new Set(
        MATRIX.filter((c) => c.appOpen > 0).map((c) => String(c.loopType))
      ),
    ].sort();
    expect(openTypes).toEqual(APP_INCOHERENT);
  });
});

describe("LOOP executor parity — guard behaviour", () => {
  it("app refuses quartered REWOUND; engine silently downgrades it", () => {
    // Rewound is order 2, so a quartered request is meaningless. The app
    // raises LoopViabilityError; the engine's RewoundExecutor ignores its
    // period argument entirely and returns the halved result.
    let checked = 0;
    for (const entry of corpus(
      (seed) => runApp(seed, AppLOOPType.STRICT_REWOUND, AppPeriod.HALVED).kind === "ok"
    )) {
      const app = runApp(
        entry.steps,
        AppLOOPType.STRICT_REWOUND,
        AppPeriod.QUARTERED
      );
      expect(app.kind).toBe("threw");
      if (app.kind === "threw") {
        expect(app.message).toContain("Quartered rewound is not a valid LOOP");
      }

      const engine = runEngine(
        entry.steps,
        AppLOOPType.STRICT_REWOUND,
        AppPeriod.QUARTERED
      );
      expect(engine.kind).toBe("ok");
      if (engine.kind === "ok") {
        // Two passes, exactly as the halved request would produce.
        expect(engine.steps.length).toBe(1 + (entry.steps.length - 1) * 2);
      }

      checked++;
      if (checked >= 8) break;
    }
    expect(checked).toBe(8);
  });

  it("the app-only MIRRORED_ROTATED_SWAPPED gap is an app selector gap, not an engine one", () => {
    // The app's LOOPType enum and combo builder both offer
    // `mirrored_rotated_swapped`, but `LOOPExecutorSelector.getExecutor`
    // has no case for it and throws. The engine handles it through the spec.
    const app = appSelectorThrowsFor(AppLOOPType.MIRRORED_ROTATED_SWAPPED);
    expect(app).toContain("not yet implemented");
    expect(() =>
      toEngineLoopType(AppLOOPType.MIRRORED_ROTATED_SWAPPED)
    ).not.toThrow();
  });
});

function appSelectorThrowsFor(loopType: AppLOOPType): string {
  const seed = [] as unknown as StepData[];
  const outcome = runApp(seed, loopType, AppPeriod.HALVED);
  return outcome.kind === "threw" ? outcome.message : "(did not throw)";
}
