/**
 * Stages 1 and 2 — Vocabulary and Unit search.
 *
 * **Stage 1, Vocabulary.** A card contributes its LETTERS, and each letter
 * contributes every one of its variations as an edge. That is the correction the
 * redesign turns on: a word does not determine its closure, so the search cannot
 * walk a card's recorded step order — it walks realized pictographs, and the same
 * letter from the same start may land 180 degrees apart depending on which
 * variation is taken.
 *
 * **Stage 2, Unit search.** An exhaustive DFS over those edges, bounded by unit
 * length and connector budget, requiring both cards to appear, with placement
 * continuity pruning at every step. No caps and no truncation banner: the box is
 * declared, and the search inside it finishes.
 *
 * The search does NOT decide what closes. It asks the `closes` predicate, which
 * defaults to Stage 3 (`admissibleClosures`) memoized per placement pair. Keeping
 * that as an injected question rather than an inlined rule is what stops the
 * closure rule from being quietly reimplemented here — the failure that produced
 * the freeform output in the first place.
 */

import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { deriveWordFromBeats } from "$lib/shared/foundation/services/word-deriver";
import {
  GridMode,
  type GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { motionQueryHandler } from "$lib/shared/pictograph/shared/services/motion-query-handler";

import type { CandidateUnit } from "../domain/closure-types";
import { admissibleClosures, type ClosureOptions } from "./loop-closure";

export interface UnitSearchBox {
  /** Longest walked unit, in steps. The published oracle's box is 6. */
  readonly maxUnitLength: number;
  /**
   * Total steps drawn from neither card. Counted over the whole unit, not per
   * run: two separated single-step bridges spend the same budget as one pair.
   */
  readonly maxConnectors: number;
  /** Both cards must appear in every emitted unit. */
  readonly requireBothCards: boolean;
}

export const DEFAULT_UNIT_SEARCH_BOX: UnitSearchBox = {
  maxUnitLength: 6,
  maxConnectors: 2,
  requireBothCards: true,
};

export interface UnitSearchInput {
  /** Every pictograph of the grid mode, as steps (see `loadCombinationSteps`). */
  readonly steps: readonly StepData[];
  readonly cardALetters: ReadonlySet<string>;
  readonly cardBLetters: ReadonlySet<string>;
  /**
   * Which letters may bridge. Omit for "any letter belonging to neither card",
   * which is what the published oracle counts and therefore what the fixtures
   * assert. Pass the 24-base roster (`domain/base-sequence-registry`) for the
   * design's stricter connector rule — a smaller answer set, not a different
   * one.
   */
  readonly connectorLetters?: ReadonlySet<string> | null;
  /**
   * Does this placement pair close? Defaults to Stage 3, memoized. Inject only
   * to narrow the closure vocabulary (see `ClosureOptions`), never to redefine
   * it.
   */
  readonly closes?: (start: string, end: string) => boolean;
}

/** All pictographs of a grid mode as steps, through the production pipeline. */
export async function loadCombinationSteps(
  gridMode: GridMode = GridMode.DIAMOND
): Promise<readonly StepData[]> {
  const pictographs = await motionQueryHandler.queryMotions({ gridMode });
  return toSteps(pictographs);
}

/**
 * Keep only the rows a walk can actually use: both hands present, both placement
 * labels present. A row missing either cannot join a chain, and letting it in
 * would put a hole in the middle of a "performable" result.
 */
export function toSteps(
  pictographs: readonly PictographData[]
): readonly StepData[] {
  const steps: StepData[] = [];
  for (const pictograph of pictographs) {
    if (!pictograph.letter) continue;
    if (!pictograph.startPlacement || !pictograph.endPlacement) continue;
    if (!pictograph.motions.left || !pictograph.motions.right) continue;
    steps.push(createStepData({ ...pictograph, id: pictograph.id }));
  }
  return steps;
}

/** Memoized Stage 3 admissibility, keyed by placement pair. */
export function createClosurePredicate(
  options: ClosureOptions = {}
): (start: string, end: string) => boolean {
  const cache = new Map<string, boolean>();
  return (start, end) => {
    const key = `${start},${end}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const closes = admissibleClosures(start, end, options).length > 0;
    cache.set(key, closes);
    return closes;
  };
}

type Origin = "cardA" | "cardB" | "connector";

const ORIGIN_SYMBOL: Record<Origin, string> = {
  cardA: "A",
  cardB: "B",
  connector: "C",
};

/**
 * The unit's run structure, phase-canonical.
 *
 * A closed unit has no first step, so the run list is rotated to its
 * lexicographically smallest form — and when the first and last runs share an
 * origin they are one run that the entry point happened to cut in half, so they
 * are merged before rotating. Without both passes the same loop entered at two
 * points would report two different shapes.
 */
function shapeOf(origins: readonly Origin[]): {
  shape: string;
  shapeFamily: string;
} {
  const runs: { origin: Origin; length: number }[] = [];
  for (const origin of origins) {
    const last = runs[runs.length - 1];
    if (last && last.origin === origin) last.length += 1;
    else runs.push({ origin, length: 1 });
  }
  if (runs.length > 1 && runs[0]!.origin === runs[runs.length - 1]!.origin) {
    runs[0]!.length += runs.pop()!.length;
  }

  const withLength = runs.map(
    (run) => `${ORIGIN_SYMBOL[run.origin]}${run.length}`
  );
  const skeleton = runs.map((run) => ORIGIN_SYMBOL[run.origin]);

  const canonical = (parts: readonly string[]): string => {
    let best: string | null = null;
    for (let i = 0; i < parts.length; i++) {
      const rotated = [...parts.slice(i), ...parts.slice(0, i)].join("");
      if (best === null || rotated < best) best = rotated;
    }
    return best ?? "";
  };

  return { shape: canonical(withLength), shapeFamily: canonical(skeleton) };
}

/**
 * Every closing walk inside the box, with no cap and no truncation.
 *
 * Emitted units are RAW — the same loop appears once per phase and once per
 * symmetry. `dedupeUnits` applies the equivalence relation; keeping the two
 * apart means the relation can be restated without touching the search.
 */
export function searchCandidateUnits(
  input: UnitSearchInput,
  box: Partial<UnitSearchBox> = {}
): readonly CandidateUnit[] {
  const bounds: UnitSearchBox = { ...DEFAULT_UNIT_SEARCH_BOX, ...box };
  const closes = input.closes ?? createClosurePredicate();

  const originOf = (letter: string): Origin | null => {
    if (input.cardALetters.has(letter)) return "cardA";
    if (input.cardBLetters.has(letter)) return "cardB";
    if (input.connectorLetters && !input.connectorLetters.has(letter)) {
      return null;
    }
    return "connector";
  };

  const outEdges = new Map<string, StepData[]>();
  for (const step of input.steps) {
    const start = step.startPlacement;
    if (!start || !step.letter) continue;
    if (originOf(step.letter) === null) continue;
    const list = outEdges.get(start);
    if (list) list.push(step);
    else outEdges.set(start, [step]);
  }

  const units: CandidateUnit[] = [];
  const walk: StepData[] = [];
  const origins: Origin[] = [];

  const record = (
    startPlacement: string,
    endPlacement: string,
    connectorCount: number
  ): void => {
    units.push({
      steps: [...walk],
      startPlacement: startPlacement as GridPlacement,
      endPlacement: endPlacement as GridPlacement,
      word: deriveWordFromBeats(walk),
      connectorCount,
      ...shapeOf(origins),
    });
  };

  const visit = (
    startPlacement: string,
    currentPlacement: string,
    connectors: number,
    usedA: boolean,
    usedB: boolean
  ): void => {
    if (
      walk.length >= 1 &&
      (!bounds.requireBothCards || (usedA && usedB)) &&
      closes(startPlacement, currentPlacement)
    ) {
      record(startPlacement, currentPlacement, connectors);
    }
    if (walk.length >= bounds.maxUnitLength) return;

    for (const step of outEdges.get(currentPlacement) ?? []) {
      const origin = originOf(step.letter ?? "");
      if (origin === null) continue;
      const isConnector = origin === "connector";
      if (isConnector && connectors >= bounds.maxConnectors) continue;
      const end = step.endPlacement;
      if (!end) continue;

      walk.push(step);
      origins.push(origin);
      visit(
        startPlacement,
        end,
        connectors + (isConnector ? 1 : 0),
        usedA || origin === "cardA",
        usedB || origin === "cardB"
      );
      walk.pop();
      origins.pop();
    }
  };

  for (const startPlacement of outEdges.keys()) {
    visit(startPlacement, startPlacement, 0, false, false);
  }

  return units;
}
