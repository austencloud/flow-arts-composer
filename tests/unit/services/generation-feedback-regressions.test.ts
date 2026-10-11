import { describe, expect, it, vi } from "vitest";
import {
  CsvVariationProvider,
  loadDiamondVariations,
} from "../../../packages/sequence-engine/tests/helpers/csv-variations";
import { GenerationOrchestrator } from "#lib/shared/create/services/generation-orchestrator.js";
import {
  DifficultyLevel,
  GenerationMode,
  type GenerationOptions,
} from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

const blockedStarts = [
  "alpha3",
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
];

function orchestrator(): GenerationOrchestrator {
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
  const metadata = { mapDifficultyToLevel: () => 2 };
  return new GenerationOrchestrator(
    provider as never,
    transformer as never,
    metadata as never
  );
}

const base = {
  mode: GenerationMode.CIRCULAR,
  gridMode: GridMode.DIAMOND,
  propType: PropType.FAN,
  difficulty: DifficultyLevel.INTERMEDIATE,
  turnIntensity: 1,
  constraintPreset: "smooth",
  handPathMode: "mixed",
  matchHandTurns: true,
  blockedStartPlacements: blockedStarts,
  rightStartOrientation: "in",
} as Partial<GenerationOptions>;

const cases: Array<[string, Partial<GenerationOptions>]> = [
  [
    "quarter rotated with QS and TO",
    {
      length: 8,
      period: "quartered",
      loopType: "rotated",
      loopSpecWire: {
        left: { rotated: { period: 4 } },
        right: { rotated: { period: 4 } },
      },
      handRelationship: "QS",
      propRelationship: "TO",
    } as never,
  ],
  [
    "half rotated with QO and TO",
    {
      length: 8,
      period: "halved",
      loopType: "rotated",
      loopSpecWire: {
        left: { rotated: { period: 2 } },
        right: { rotated: { period: 2 } },
      },
      handRelationship: "QO",
      propRelationship: "TO",
    } as never,
  ],
  [
    "swapped with QO and SO",
    {
      length: 12,
      period: "halved",
      loopType: "swapped",
      loopSpecWire: {
        left: { swapped: { period: 2 } },
        right: { swapped: { period: 2 } },
      },
      handRelationship: "QO",
      propRelationship: "SO",
    } as never,
  ],
  [
    "rewound with QO and SO",
    {
      length: 12,
      period: "halved",
      loopType: "strict_rewound",
      loopSpecWire: {
        left: { rewound: { period: 2 } },
        right: { rewound: { period: 2 } },
      },
      handRelationship: "QO",
      propRelationship: "SO",
    } as never,
  ],
  [
    "NE-SW mirrored with QO and SO",
    {
      length: 12,
      period: "halved",
      loopType: "mirrored",
      loopSpecWire: {
        left: {
          mirrored: { period: 2, reflectionAxis: "northeast-southwest" },
        },
        right: {
          mirrored: { period: 2, reflectionAxis: "northeast-southwest" },
        },
      },
      loopRhythm: {
        rotationInterval: 2,
        inversionInterval: 2,
        inversionMode: "expand",
        reflectionAxis: "northeast-southwest",
      },
      handRelationship: "QO",
      propRelationship: "SO",
    } as never,
  ],
];

describe("reported LOOP generation settings", () => {
  for (const [name, overrides] of cases) {
    it(`generates ${name} from allowed starts`, async () => {
      const options = { ...base, ...overrides } as GenerationOptions;
      const result = (await orchestrator().generateSequence(
        options
      )) as unknown as {
        sequence: Array<{ startPlacement: string }>;
      };

      expect(result.sequence).toHaveLength(options.length + 1);
      expect(blockedStarts).not.toContain(result.sequence[0]!.startPlacement);
    });
  }
});
