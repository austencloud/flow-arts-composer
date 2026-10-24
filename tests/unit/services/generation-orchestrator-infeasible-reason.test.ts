import { describe, expect, it, vi, beforeEach } from "vitest";
import { loadDiamondVariations } from "../../../packages/sequence-engine/tests/helpers/csv-variations";

// Stub only SequenceBuilder so build() can throw the engine's real
// GenerationInfeasibleError; everything else on the subpath stays real.
const buildMock = vi.fn();
vi.mock("@tka/sequence-engine/generation", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tka/sequence-engine/generation")>();
  class SequenceBuilder {
    build(...args: unknown[]) {
      return buildMock(...args);
    }
  }
  return { ...actual, SequenceBuilder };
});

import { GenerationInfeasibleError } from "@tka/sequence-engine/generation";
import { GenerationOrchestrator } from "#lib/shared/create/services/generation-orchestrator.js";
import type { GenerationRequestError } from "#lib/shared/create/domain/generation-request-error.js";
import {
  GenerationMode,
  DifficultyLevel,
  type GenerationOptions,
} from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

function makeOrchestrator() {
  return new GenerationOrchestrator(
    {
      initialize: vi.fn().mockResolvedValue(undefined),
      getAllVariationsForGrid: vi.fn(async () => loadDiamondVariations()),
    } as any,
    { convertToSequenceData: vi.fn() } as any,
    { mapDifficultyToLevel: vi.fn().mockReturnValue(1) } as any
  );
}

const options: GenerationOptions = {
  mode: GenerationMode.CIRCULAR,
  length: 8,
  gridMode: GridMode.DIAMOND,
  propType: PropType.FAN,
  difficulty: DifficultyLevel.BEGINNER,
  loopType: "swapped" as never,
};

async function requestErrorFor(
  error: GenerationInfeasibleError
): Promise<GenerationRequestError> {
  buildMock.mockImplementation(() => {
    throw error;
  });
  const failure = await makeOrchestrator()
    .generateSequence(options)
    .catch((e: unknown) => e);
  expect(failure).toMatchObject({ name: "GenerationRequestError" });
  return failure as GenerationRequestError;
}

describe("GenerationOrchestrator: infeasible notice detail", () => {
  beforeEach(() => {
    buildMock.mockReset();
  });

  it("keeps the headline and adds the engine's reason for a spelled word", async () => {
    const error = await requestErrorFor(
      new GenerationInfeasibleError(
        `"GG" cannot form a swapped LOOP: both hands follow the same path ` +
          `in every step, so swapping them changes nothing`,
        2
      )
    );
    expect(error.message).toMatch(
      /^No 8-step swapped LOOP fits these settings/
    );
    expect(error.detail).toBe(
      `"GG" cannot form a swapped LOOP: both hands follow the same path ` +
        `in every step, so swapping them changes nothing.`
    );
  });

  it("shows only the generic text when the engine describes its search", async () => {
    const error = await requestErrorFor(
      new GenerationInfeasibleError(
        "No 4-step seed can close a swapped LOOP from any allowed start " +
          "under the current constraints",
        4
      )
    );
    expect(error.message).toBe(
      "No 8-step swapped LOOP fits these settings together. Try another " +
        "length, start or motion setting."
    );
    expect(error.detail).toBeUndefined();
  });
});
