/**
 * Catalog Membership Resolver
 *
 * Given a sequence, compute which catalogs it belongs to — purely from its
 * data, never from a stored field. Membership is a function of:
 *   level, gridMode, loopType, sliceType, stepCount, reversalPattern
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { Catalog } from "./models/Catalog";
import { matchReversalPatternId } from "./reversal-matcher";
import { detectLevelFeatures } from "#lib/shared/domain/curriculum/level-feature-detector.js";

export interface CatalogSignals {
  /**
   * 1-3 if classifiable by the current runtime classifier;
   * null when L4+ features are present (level is beyond what
   * `SequenceDifficultyCalculator` can honestly classify yet).
   */
  readonly level: number | null;
  /** Features that triggered a null level, for diagnostics. */
  readonly beyondLevel3Features: readonly string[];
  readonly gridMode: string | null;
  readonly loopType: string | null;
  readonly sliceType: "halved" | "quartered" | null;
  readonly stepCount: number;
  readonly reversalPatternId: string | null;
}

export interface SignalProviders {
  /** Returns 1-9. Today only 1/2/3 are classified; L4+ return 1 until classifier extended. */
  readonly analyzeLevel: (steps: readonly StepData[]) => number;
  /** Returns LOOP type and period. Null when the sequence isn't a LOOP. */
  readonly analyzeLoop: (sequence: SequenceData) => {
    loopType: string | null;
    period: "halved" | "quartered" | null;
  };
}

export function buildSignals(sequence: SequenceData, providers: SignalProviders): CatalogSignals {
  const loopResult = providers.analyzeLoop(sequence);
  const featureReport = detectLevelFeatures(sequence);

  const level = featureReport.beyondLevel3
    ? null
    : providers.analyzeLevel(sequence.steps);

  return {
    level,
    beyondLevel3Features: featureReport.features,
    gridMode: sequence.gridMode ?? null,
    loopType: loopResult.loopType,
    sliceType: loopResult.period,
    stepCount: sequence.steps.length,
    reversalPatternId: matchReversalPatternId(sequence.steps),
  };
}

export interface CatalogMatch {
  readonly catalog: Catalog;
  readonly exact: boolean;
  readonly missingFields: readonly (keyof CatalogSignals)[];
}

export function resolveCatalogMembership(
  signals: CatalogSignals,
  catalogs: readonly Catalog[],
): CatalogMatch[] {
  const matches: CatalogMatch[] = [];

  for (const catalog of catalogs) {
    const missing: (keyof CatalogSignals)[] = [];

    if (signals.level === null) continue;
    if (signals.level !== catalog.level) continue;
    if (signals.stepCount !== catalog.stepCount) continue;

    if (signals.gridMode == null) missing.push("gridMode");
    else if (signals.gridMode !== catalog.gridMode) continue;

    if (signals.loopType == null) missing.push("loopType");
    else if (signals.loopType !== catalog.loopType) continue;

    if (signals.sliceType == null) missing.push("sliceType");
    else if (signals.sliceType !== catalog.sliceType) continue;

    if (signals.reversalPatternId == null) missing.push("reversalPatternId");
    else if (signals.reversalPatternId !== catalog.reversalPattern) continue;

    matches.push({ catalog, exact: missing.length === 0, missingFields: missing });
  }

  matches.sort((a, b) => Number(b.exact) - Number(a.exact));
  return matches;
}
