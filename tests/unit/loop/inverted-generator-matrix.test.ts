import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CsvVariationProvider,
  loadBoxVariations,
  loadDiamondVariations,
} from "../../../packages/sequence-engine/tests/helpers/csv-variations";
import { GenerationOrchestrator } from "#lib/shared/create/services/generation-orchestrator.js";
import { BuildResultTransformer } from "#lib/shared/create/services/build-result-transformer.js";
import { sequenceMetadataManager } from "#lib/shared/create/services/sequence-metadata-manager.js";
import { reversalDetector } from "#lib/shared/create/services/reversal-detector.js";
import {
  parseLoopComponents,
  quarterInversionSupported,
  resolveLoopConfig,
} from "#lib/shared/create/services/loop-type-utils.js";
import { GenerationRequestError } from "#lib/shared/create/domain/generation-request-error.js";
import { validateSequence } from "#lib/features/create/shared/services/sequence-validator.js";
import { isEffectPreviewLoop } from "#lib/shared/effects/domain/effect-preview-loop-policy.js";
import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { checkStepCoherence } from "../opus-sequence-parity/harness/invariants";
import {
  DifficultyLevel,
  GenerationMode,
  type GenerationOptions,
} from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import { LOOPType } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

const types = [
  LOOPType.INVERTED,
  LOOPType.MIRRORED_INVERTED,
  LOOPType.ROTATED_INVERTED,
  LOOPType.SWAPPED_INVERTED,
  LOOPType.MIRRORED_INVERTED_ROTATED,
  LOOPType.MIRRORED_SWAPPED_INVERTED,
  LOOPType.ROTATED_SWAPPED_INVERTED,
  LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED,
] as const;

const nonInvertedTypes = [
  null,
  LOOPType.MIRRORED,
  LOOPType.ROTATED,
  LOOPType.SWAPPED,
  LOOPType.MIRRORED_ROTATED,
  LOOPType.MIRRORED_SWAPPED,
  LOOPType.ROTATED_SWAPPED,
  LOOPType.MIRRORED_ROTATED_SWAPPED,
] as const;

const letters = new Set<string>(Object.values(Letter));
const orientations = new Set<string>(Object.values(Orientation));

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

/**
 * Every quarter over a combo that only halves the sequence has no related
 * quarters to flip; it is refused with a notice (inverted-loop-invariants).
 */
function refusesQuarter(
  type: LOOPType,
  inversionMode: "expand" | "overlay",
  inversionInterval: 2 | 4
): boolean {
  return (
    inversionMode === "overlay" &&
    inversionInterval === 4 &&
    !quarterInversionSupported(parseLoopComponents(type))
  );
}

function seedRandom(): void {
  let seed = 123456789;
  vi.spyOn(Math, "random").mockImplementation(() => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 0x100000000;
  });
}

function optionsFor(
  type: LOOPType | null,
  gridMode: GridMode,
  length: number,
  propType: PropType,
  inversionMode: "expand" | "overlay",
  inversionInterval: 2 | 4
): GenerationOptions {
  const resolved = type
    ? resolveLoopConfig(type, "halved", { inversionInterval, inversionMode })
    : null;
  return {
    mode: type ? GenerationMode.CIRCULAR : GenerationMode.FREEFORM,
    length,
    gridMode,
    propType,
    difficulty: DifficultyLevel.ADVANCED,
    ...(type ? { loopType: type } : {}),
    period: resolved?.period,
    loopSpecWire: resolved?.loopSpecWire,
    loopRhythm: resolved?.loopRhythm,
    constraintPreset: "smooth",
  };
}

describe("inverted Generate combinations", () => {
  afterEach(() => vi.restoreAllMocks());

  for (const type of types) {
    for (const gridMode of [GridMode.DIAMOND, GridMode.BOX]) {
      for (const length of [8, 16]) {
        for (const inversionMode of ["expand", "overlay"] as const) {
          for (const inversionInterval of [2, 4] as const) {
            for (const propType of [PropType.FAN, PropType.POI]) {
              it(`${type}/${gridMode}/${length}/${propType}/${inversionMode}/${inversionInterval}`, async () => {
                seedRandom();
                const request = orchestrator().generateSequence(
                  optionsFor(
                    type,
                    gridMode,
                    length,
                    propType,
                    inversionMode,
                    inversionInterval
                  )
                );
                if (refusesQuarter(type, inversionMode, inversionInterval)) {
                  await expect(request).rejects.toBeInstanceOf(
                    GenerationRequestError
                  );
                  return;
                }
                const result = await request;
                expect(result.steps).toHaveLength(length);
                expect(validateSequence(result).isValid).toBe(true);
                expect(isEffectPreviewLoop(result)).toBe(true);
                expect(checkStepCoherence(result.steps)).toEqual([]);
                expect(result.word).toBeTruthy();
                for (const [index, step] of result.steps.entries()) {
                  expect(letters.has(step.letter ?? "")).toBe(true);
                  for (const side of ["left", "right"] as const) {
                    const motion = step.motions[side];
                    expect(orientations.has(motion.startOrientation)).toBe(
                      true
                    );
                    expect(orientations.has(motion.endOrientation)).toBe(true);
                    if (index > 0) {
                      expect(motion.startOrientation).toBe(
                        result.steps[index - 1]!.motions[side].endOrientation
                      );
                    }
                  }
                }
              }, 30_000);
            }
          }
        }
      }
    }
  }

  const counterpartCases = types.flatMap((type, index) =>
    (["expand", "overlay"] as const).flatMap((inversionMode) =>
      ([2, 4] as const)
        .filter(
          (inversionInterval) =>
            !refusesQuarter(type, inversionMode, inversionInterval)
        )
        .map(
          (inversionInterval) =>
            [
              type,
              nonInvertedTypes[index],
              inversionMode,
              inversionInterval,
            ] as const
        )
    )
  );

  it.each(counterpartCases)(
    "compares %s with %s at %s/%i using the same random seed",
    async (type, counterpart, inversionMode, inversionInterval) => {
      const make = () => orchestrator();
      seedRandom();
      const inverted = await make().generateSequence(
        optionsFor(
          type,
          GridMode.DIAMOND,
          16,
          PropType.FAN,
          inversionMode,
          inversionInterval
        )
      );
      vi.restoreAllMocks();
      seedRandom();
      const ordinary = await make().generateSequence(
        optionsFor(
          counterpart,
          GridMode.DIAMOND,
          16,
          PropType.FAN,
          inversionMode,
          inversionInterval
        )
      );
      expect(validateSequence(ordinary).isValid).toBe(true);
      expect(inverted.steps).toHaveLength(16);
      expect(ordinary.steps).toHaveLength(16);
      expect(inverted.word).toBeTruthy();
      expect(ordinary.word).toBeTruthy();
      // This seed contains invertible motions in every selected pair.
      expect(inverted.word).not.toBe(ordinary.word);
      if (counterpart) expect(isEffectPreviewLoop(ordinary)).toBe(true);
    },
    30_000
  );
});
