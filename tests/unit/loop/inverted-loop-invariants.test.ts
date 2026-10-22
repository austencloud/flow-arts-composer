/**
 * Property tests for the Generate panel's inverted LOOP options
 * (feedback n3H02keo8KuXX5mJng4E, "the inverted options give weird results").
 *
 * Canon (packages/domain glossary + domain-topics "Transformation Domains"):
 * an inverted pass keeps every hand path and flips pro <-> anti, so the
 * inverted block is the spin flip of the block before it. Earlier sweeps
 * checked validity and closure only; the defect was semantic. "On top" (an
 * in-place overlay) flipped blocks that were never copies of each other:
 *  - Inverted alone + On top returned a freeform sequence, or a plain repeat
 *    whose halves and quarters never flip spin at all.
 *  - Mirrored / rotated / swapped (+ swapped) + Inverted + Every quarter
 *    returned the companion LOOP alone; no block inverted any other.
 * Both still carried the inverted badge, because display trusts the spec.
 *
 * Every cell the picker offers is generated across seeds, grids, props and
 * lengths, and must keep the canon: the inverted segment flips the segment
 * before it on identical hand paths, the sequence closes, the badge names the
 * requested combo, and the engine's detector (the one the builder validates
 * with) recognises it. A cell the picker no longer offers must be refused with
 * a notice, never generated.
 *
 * The loop-labeler's live detector is not asserted: it already disagrees with
 * the badge on ordinary swapped and mirrored+swapped LOOPs, with no inversion
 * involved, so it cannot arbitrate this family.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CsvVariationProvider,
  loadBoxVariations,
  loadDiamondVariations,
} from "../../../packages/sequence-engine/tests/helpers/csv-variations";
import {
  loopDetectorClass,
  relationsForPair,
  type PairMotions,
} from "@tka/sequence-engine/loop";
import { GenerationOrchestrator } from "#lib/shared/create/services/generation-orchestrator.js";
import { BuildResultTransformer } from "#lib/shared/create/services/build-result-transformer.js";
import { sequenceMetadataManager } from "#lib/shared/create/services/sequence-metadata-manager.js";
import { reversalDetector } from "#lib/shared/create/services/reversal-detector.js";
import {
  parseLoopComponents,
  quarterInversionSupported,
  resolveLoopConfig,
} from "#lib/shared/create/services/loop-type-utils.js";
import { gateRhythm } from "#lib/shared/create/services/loop-rhythm-gating.js";
import { GenerationRequestError } from "#lib/shared/create/domain/generation-request-error.js";
import {
  clearLoopDisplayCache,
  resolveLoopDisplay,
} from "#lib/features/loop-labeler/services/loop-display-resolver.js";
import { validateSequence } from "#lib/features/create/shared/services/sequence-validator.js";
import { isEffectPreviewLoop } from "#lib/shared/effects/domain/effect-preview-loop-policy.js";
import {
  DifficultyLevel,
  GenerationMode,
  LOOPComponent,
  type GenerationOptions,
} from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import { LOOPType } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

const INVERTED_TYPES = [
  LOOPType.INVERTED,
  LOOPType.MIRRORED_INVERTED,
  LOOPType.ROTATED_INVERTED,
  LOOPType.SWAPPED_INVERTED,
  LOOPType.MIRRORED_INVERTED_ROTATED,
  LOOPType.MIRRORED_SWAPPED_INVERTED,
  LOOPType.ROTATED_SWAPPED_INVERTED,
  LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED,
] as const;

type Cell = { mode: "expand" | "overlay"; interval: 2 | 4 };
// Every pairing of "Build the sequence" and "Invert when" the picker renders.
// Adds length + Every quarter is a disabled segment and never reaches here.
const CELLS: readonly Cell[] = [
  { mode: "expand", interval: 2 },
  { mode: "overlay", interval: 2 },
  { mode: "overlay", interval: 4 },
];
const GRIDS = [GridMode.DIAMOND, GridMode.BOX] as const;
const PROPS = [PropType.STAFF, PropType.FAN, PropType.CLUB] as const;
const LENGTHS = [8, 16] as const;
const SEEDS = [11, 4099, 77777] as const;

const data = {
  [GridMode.DIAMOND]: loadDiamondVariations(),
  [GridMode.BOX]: loadBoxVariations(),
};

function orchestrator(): GenerationOrchestrator {
  const providers = {
    [GridMode.DIAMOND]: new CsvVariationProvider(data[GridMode.DIAMOND]),
    [GridMode.BOX]: new CsvVariationProvider(data[GridMode.BOX]),
  };
  const provider = {
    initialize: async () => undefined,
    getAllVariationsForGrid: async (grid: GridMode) => data[grid],
    getVariations: (letter: string, placement: string, grid: GridMode) =>
      providers[grid].getVariations(letter, placement, grid),
    getAllVariations: (grid: GridMode) =>
      providers[grid].getAllVariations(grid),
  };
  return new GenerationOrchestrator(
    provider as never,
    new BuildResultTransformer(sequenceMetadataManager, reversalDetector),
    sequenceMetadataManager
  );
}

function seedRandom(seed: number): void {
  let state = seed >>> 0;
  vi.spyOn(Math, "random").mockImplementation(() => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  });
}

function optionsFor(
  type: LOOPType,
  cell: Cell,
  gridMode: GridMode,
  propType: PropType,
  length: number
): GenerationOptions {
  const resolved = resolveLoopConfig(type, "halved", {
    inversionInterval: cell.interval,
    inversionMode: cell.mode,
  });
  return {
    mode: GenerationMode.CIRCULAR,
    length,
    gridMode,
    propType,
    difficulty: DifficultyLevel.ADVANCED,
    loopType: type,
    period: resolved.period,
    loopSpecWire: resolved.loopSpecWire,
    loopRhythm: resolved.loopRhythm,
    constraintPreset: "smooth",
  };
}

type Steps = SequenceData["steps"];

function pairMotions(step: Steps[number]): PairMotions {
  const side = (hand: "left" | "right") => ({
    startLocation: String(step.motions[hand].startLocation),
    endLocation: String(step.motions[hand].endLocation),
    motionType: String(step.motions[hand].motionType),
  });
  return { left: side("left"), right: side("right") };
}

/**
 * Relations that explain block B as a transform of block A, step for step.
 * "flipped" is folded into "mirrored": both are reflections, and a reflection
 * around a halved rotation reads as the other axis.
 */
function blockRelations(steps: Steps, from: number, to: number, size: number) {
  let shared: Set<string> | null = null;
  for (let i = 0; i < size; i++) {
    const keys = new Set(
      relationsForPair(
        pairMotions(steps[from + i]!),
        pairMotions(steps[to + i]!)
      ).map((relation) =>
        relation.components
          .map((c) => (c === "flipped" ? "mirrored" : c))
          .sort()
          .join("+")
      )
    );
    shared = shared ? new Set([...shared].filter((k) => keys.has(k))) : keys;
  }
  return shared ?? new Set<string>();
}

function sameMotions(steps: Steps, from: number, to: number, size: number) {
  for (let i = 0; i < size; i++) {
    const a = pairMotions(steps[from + i]!);
    const b = pairMotions(steps[to + i]!);
    if (JSON.stringify(a) !== JSON.stringify(b)) return false;
  }
  return true;
}

/**
 * Strip passes that orientation closure added: a LOOP realised as
 * seed x LCM(placement period, orientation period) repeats its skeleton
 * exactly (domain-topics, "The Two-Period Model").
 */
function minimalUnit(steps: Steps): Steps {
  let unit = steps;
  while (
    unit.length >= 4 &&
    unit.length % 2 === 0 &&
    sameMotions(unit, 0, unit.length / 2, unit.length / 2)
  ) {
    unit = unit.slice(0, unit.length / 2);
  }
  return unit;
}

function key(components: Iterable<string>): string {
  return [...components].sort().join("+");
}

/** The relation the second half must bear to the first, in canon terms. */
function expectedHalfRelation(components: Set<LOOPComponent>): string {
  const names = new Set([...components].map((c) => c.toLowerCase()));
  // A reflection around a halved rotation nests the rotation inside each
  // half; the halves themselves are related by the reflection.
  if (names.has("mirrored") && names.has("rotated")) names.delete("rotated");
  return key(names);
}

function assertInvertedStructure(
  result: SequenceData,
  type: LOOPType,
  cell: Cell
): void {
  const components = parseLoopComponents(type);
  const unit = minimalUnit(result.steps);
  expect(unit.length % 2, `unit ${unit.length} must split in halves`).toBe(0);
  const half = unit.length / 2;
  const halves = blockRelations(unit, 0, half, half);

  const quarterNested =
    cell.interval === 4 &&
    components.has(LOOPComponent.MIRRORED) &&
    components.has(LOOPComponent.ROTATED);

  if (!quarterNested) {
    // The inverted half is the spin flip of the half before it, carried
    // through whatever the rest of the combo does to the hand paths.
    expect([...halves], `${result.word}`).toContain(
      expectedHalfRelation(components)
    );
    return;
  }

  // Every quarter over a reflection around a rotation: each odd quarter is
  // the flipped, rotated copy of the quarter before it, and the halves are
  // related by the reflection (and swap) alone, with no inversion between them.
  expect(unit.length % 4).toBe(0);
  const quarter = unit.length / 4;
  const flipBack = key(["inverted", "rotated"]);
  expect([...blockRelations(unit, 0, quarter, quarter)], result.word).toContain(
    flipBack
  );
  expect(
    [...blockRelations(unit, 2 * quarter, 3 * quarter, quarter)],
    result.word
  ).toContain(flipBack);
  const outer = new Set([...components].map((c) => c.toLowerCase()));
  outer.delete("rotated");
  outer.delete("inverted");
  expect([...halves], result.word).toContain(key(outer));
}

/**
 * Components the engine detector reads off the steps, with reflections folded
 * the way SequenceBuilder's identity check folds them. Step 0 is the start
 * placement the detector expects in front of the letter steps.
 */
function detectedComponents(result: SequenceData): string {
  const first = result.steps[0]!;
  const steps = [{ ...first, stepNumber: 0 }, ...result.steps];
  const detected = loopDetectorClass.detectLOOPType(steps as never);
  expect(detected.isCircular, result.word).toBe(true);
  const names = new Set<string>();
  for (const prop of [detected.spec?.left, detected.spec?.right]) {
    for (const component of prop?.components.keys() ?? []) {
      const name = String(component).toLowerCase();
      names.add(name === "flipped" ? "mirrored" : name);
    }
  }
  return key(names);
}

describe("inverted LOOP options keep the inversion canon", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearLoopDisplayCache();
  });

  for (const type of INVERTED_TYPES) {
    for (const cell of CELLS) {
      const components = parseLoopComponents(type);
      const offered =
        cell.interval === 2 ||
        quarterInversionSupported(components, {
          inversionInterval: cell.interval,
          inversionMode: cell.mode,
        });
      const label = `${type} / ${cell.mode} / every 1/${cell.interval}`;

      if (!offered) {
        it(`${label} is refused with a notice instead of a mislabelled LOOP`, async () => {
          const gate = gateRhythm(
            components,
            { inversionInterval: cell.interval, inversionMode: cell.mode },
            16
          );
          expect(gate.ok).toBe(false);

          seedRandom(SEEDS[0]);
          const request = orchestrator().generateSequence(
            optionsFor(type, cell, GridMode.DIAMOND, PropType.STAFF, 16)
          );
          await expect(request).rejects.toBeInstanceOf(GenerationRequestError);
          await expect(request).rejects.toThrow(
            /invert at halfway instead of every quarter/
          );
        });
        continue;
      }

      for (const gridMode of GRIDS) {
        for (const propType of PROPS) {
          for (const length of LENGTHS) {
            it(`${label} / ${gridMode} / ${propType} / ${length}`, async () => {
              for (const seed of SEEDS) {
                seedRandom(seed);
                const result = await orchestrator().generateSequence(
                  optionsFor(type, cell, gridMode, propType, length)
                );

                expect(result.steps).toHaveLength(length);
                expect(validateSequence(result).isValid).toBe(true);
                // Closes as a LOOP: placement and both orientations return.
                expect(isEffectPreviewLoop(result)).toBe(true);
                assertInvertedStructure(result, type, cell);

                // The badge names the combo that was asked for, and the
                // engine detector recognises that combo in the steps.
                const display = resolveLoopDisplay(result);
                expect(key(display.components)).toBe(key(components));
                expect(detectedComponents(result), result.word).toBe(
                  key([...components].map((c) => c.toLowerCase()))
                );
                vi.restoreAllMocks();
              }
            }, 60_000);
          }
        }
      }
    }
  }
});
