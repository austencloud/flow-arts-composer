import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CsvVariationProvider,
  loadDiamondVariations,
} from "../../../packages/sequence-engine/tests/helpers/csv-variations";
import { GenerationOrchestrator } from "#lib/shared/create/services/generation-orchestrator.js";
import { BuildResultTransformer } from "#lib/shared/create/services/build-result-transformer.js";
import { reversalDetector } from "#lib/shared/create/services/reversal-detector.js";
import { sequenceMetadataManager } from "#lib/features/create/generate/shared/services/sequence-metadata-manager.js";
import { createGenerationConfigState } from "#lib/features/create/generate/state/generate-config.svelte.js";
import { uiConfigToGenerationOptions } from "#lib/shared/create/utils/config-mapper.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

// Feedback X9hMiHdgWrjR8sh1qCIA (2026-09-05): with level 2 and maximum turn
// intensity 1 in the Generate panel, every sequence came out with no turns.
// This drives the panel's own config through the same mapper, orchestrator,
// metadata manager and transformer the Generate button uses, so a level lost
// anywhere between the chip and the beats shows up here.

beforeEach(() => localStorage.clear());

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
  return new GenerationOrchestrator(
    provider as never,
    new BuildResultTransformer(sequenceMetadataManager, reversalDetector),
    sequenceMetadataManager
  );
}

type Beat = {
  motions: Record<string, { turns?: number | "fl" } | undefined>;
};

function beatTurns(beats: Beat[]): Array<number | "fl"> {
  return beats.flatMap((beat) =>
    Object.values(beat.motions)
      .filter((motion) => motion !== undefined)
      .map((motion) => motion!.turns ?? 0)
  );
}

describe("Generate panel at level 2 with turn intensity 1", () => {
  const recipes = [
    ["freeform", { loopEnabled: false, length: 8 }],
    ["freeform 16", { loopEnabled: false, length: 16 }],
    [
      "halved rotated LOOP",
      { loopEnabled: true, loopType: "rotated", period: "halved", length: 8 },
    ],
    [
      "quartered rotated LOOP",
      { loopEnabled: true, loopType: "rotated", period: "quartered", length: 16 },
    ],
    [
      "matched turns",
      { loopEnabled: false, length: 8, matchHandTurns: true },
    ],
  ] as const;

  for (const [name, overrides] of recipes) {
    it(`allocates whole turns: ${name}`, async () => {
      const state = createGenerationConfigState({
        level: 2,
        turnIntensity: 1,
        ...overrides,
      } as never);
      expect(state.config.level).toBe(2);
      expect(state.config.turnIntensity).toBe(1);

      const options = uiConfigToGenerationOptions(state.config, PropType.FAN);
      expect(sequenceMetadataManager.mapDifficultyToLevel(options.difficulty)).toBe(2);
      expect(options.turnIntensity).toBe(1);

      // Each run is random; every one must carry a turn, not just most.
      for (let run = 0; run < 8; run++) {
        const sequence = await orchestrator().generateSequence(options);
        const turns = beatTurns(sequence.steps as unknown as Beat[]);
        expect(turns.length).toBeGreaterThan(0);
        expect(turns.some((t) => typeof t === "number" && t > 0)).toBe(true);
        // Level 2 is whole turns only, capped at the intensity.
        for (const t of turns) {
          expect(t === 0 || t === 1).toBe(true);
        }
        expect(sequence.difficultyLevel).toBe(options.difficulty);
      }
    });
  }

  // The reported cause: until 2026-09-09 Generate kept a drawn turn pattern
  // in its saved config, and the pattern beat Level and Turn Intensity. A
  // pattern drawn at level 1 holds only zeros, and raising the level clamped
  // it rather than dropping it, so level 2 kept producing turn-free beats.
  const levelOnePattern = { left: [0], right: [0] };

  it("still lets an explicit zero pattern override level 2 in the engine", async () => {
    const state = createGenerationConfigState({
      level: 2,
      turnIntensity: 1,
      loopEnabled: false,
      length: 8,
    } as never);
    const options = {
      ...uiConfigToGenerationOptions(state.config, PropType.FAN),
      turnPattern: levelOnePattern,
    };
    const sequence = await orchestrator().generateSequence(options);
    const turns = beatTurns(sequence.steps as unknown as Beat[]);
    expect(turns.every((t) => t === 0)).toBe(true);
  });

  it("ignores a level 1 pattern restored from a saved session", async () => {
    localStorage.setItem(
      "tka-generate-config",
      JSON.stringify({
        mode: "freeform",
        loopEnabled: false,
        length: 8,
        level: 2,
        turnIntensity: 1,
        turnPattern: levelOnePattern,
      })
    );
    const state = createGenerationConfigState();
    expect(state.config.level).toBe(2);

    const options = uiConfigToGenerationOptions(state.config, PropType.FAN);
    expect(options).not.toHaveProperty("turnPattern");
    for (let run = 0; run < 8; run++) {
      const sequence = await orchestrator().generateSequence(options);
      const turns = beatTurns(sequence.steps as unknown as Beat[]);
      expect(turns.some((t) => typeof t === "number" && t > 0)).toBe(true);
    }
  });
});
