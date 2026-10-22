import { describe, expect, it, vi } from "vitest";
import {
  CsvVariationProvider,
  loadDiamondVariations,
} from "../../../packages/sequence-engine/tests/helpers/csv-variations";
import { GenerationOrchestrator } from "#lib/shared/create/services/generation-orchestrator.js";
import { GenerationRequestError } from "#lib/shared/create/domain/generation-request-error.js";
import {
  DifficultyLevel,
  GenerationMode,
  type GenerationOptions,
} from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

// Feedback 8xoqFsFJel2msrKCY2u5 (2026-10-17): a 16-step quartered rotated
// LOOP with SS props, matched hand turns and most starts blocked threw
// "Unable to generate a valid rotated LOOP after 40 attempts (last failure:
// No valid path found at step 4 of 4)" on every Generate click.

const blockedStarts = [
  "alpha5",
  "alpha7",
  "beta1",
  "beta3",
  "beta7",
  "gamma1",
  "gamma3",
  "gamma5",
  "gamma7",
  "gamma9",
  "gamma13",
  "gamma15",
  "alpha3",
];

function orchestrator(level = 1): GenerationOrchestrator {
  const variations = loadDiamondVariations();
  const csv = new CsvVariationProvider(variations);
  const provider = {
    initialize: vi.fn().mockResolvedValue(undefined),
    getAllVariationsForGrid: vi.fn(async () => variations),
    getVariations: (letter: string, placement: string, grid: string) =>
      csv.getVariations(letter, placement, grid),
    getAllVariations: (grid: string) => csv.getAllVariations(grid),
  };
  const transformer = {
    convertToSequenceData: async (result: unknown) => result,
  };
  const metadata = { mapDifficultyToLevel: () => level };
  return new GenerationOrchestrator(
    provider as never,
    transformer as never,
    metadata as never
  );
}

const reported = {
  mode: GenerationMode.CIRCULAR,
  length: 16,
  gridMode: GridMode.DIAMOND,
  propType: PropType.FAN,
  difficulty: DifficultyLevel.BEGINNER,
  propContinuity: "continuous",
  turnIntensity: 1,
  period: "quartered",
  loopType: "rotated",
  loopSpecWire: {
    left: { rotated: { period: 4 } },
    right: { rotated: { period: 4 } },
  },
  loopRhythm: {
    rotationInterval: 4,
    inversionInterval: 4,
    inversionMode: "overlay",
    reflectionAxis: "north-south",
  },
  constraintPreset: "smooth",
  handPathMode: "smooth",
  motionTypeFilter: "no-dash",
  handRelationship: "free",
  propRelationship: "SS",
  matchHandTurns: true,
  blockedStartPlacements: blockedStarts,
  startPlacement: null,
  endPlacement: null,
  endPlacements: [],
  mustContainLetters: [],
  mustNotContainLetters: [],
  leftStartOrientation: null,
  rightStartOrientation: "in",
} as unknown as GenerationOptions;

// Why it can never work: with SS timing every beat is a shift on both hands
// or a static on both (a dash is excluded, and a shift beside a static would
// break the timing), and level 1 refuses static beats. Each shift moves a hand
// a quarter, so a 4-step quarter seed moves each hand an even number of
// quarters and cannot land a quarter away. No start fixes that.

type Generated = {
  sequence: Array<{ startPlacement: string; endPlacement: string }>;
};

async function expectClosedLoop(
  options: GenerationOptions,
  level = 1
): Promise<void> {
  const result = (await orchestrator(level).generateSequence(
    options
  )) as unknown as Generated;
  expect(result.sequence).toHaveLength(options.length + 1);
  const first = result.sequence[0]!;
  expect(blockedStarts).not.toContain(first.startPlacement);
  expect(result.sequence.at(-1)!.endPlacement).toBe(first.startPlacement);
}

describe("quartered rotated LOOP with SS props and no dashes at level 1", () => {
  it("explains the conflict instead of failing forty blind attempts", async () => {
    const attempt = orchestrator().generateSequence(reported);
    await expect(attempt).rejects.toBeInstanceOf(GenerationRequestError);
    await expect(orchestrator().generateSequence(reported)).rejects.toThrow(
      "No 16-step rotated LOOP fits these settings together. To open a path, try one of these: " +
        "allow dashes, choose a prop relationship other than SS, or choose level 2 or higher."
    );
  });

  // Every change the message offers has to produce a sequence, or the advice
  // sends the user somewhere else that fails.
  const remedies: Array<[string, Partial<GenerationOptions>, number]> = [
    ["dashes allowed", { motionTypeFilter: null } as never, 1],
    ["a free prop relationship", { propRelationship: "free" } as never, 1],
    ["level 2", {}, 2],
  ];
  for (const [name, overrides, level] of remedies) {
    it(`generates with ${name}`, async () => {
      // The search is unseeded; repeat so a start it cannot finish surfaces.
      for (let run = 0; run < 5; run++) {
        await expectClosedLoop(
          { ...reported, ...overrides } as GenerationOptions,
          level
        );
      }
    });
  }
});
