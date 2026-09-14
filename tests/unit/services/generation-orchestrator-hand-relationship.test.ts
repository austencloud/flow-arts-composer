import { describe, expect, it, vi, beforeEach } from "vitest";

// Same stub pattern as generation-orchestrator-loopspec.test.ts: only the
// generation subpath is mocked so we can read what reaches build().
const buildMock = vi.fn();
vi.mock("@tka/sequence-engine/generation", () => {
  class SequenceBuilder {
    build(...args: unknown[]) {
      return buildMock(...args);
    }
  }
  return { SequenceBuilder };
});

import { GenerationOrchestrator } from "$lib/shared/create/services/generation-orchestrator";
import {
  GenerationMode,
  DifficultyLevel,
  type GenerationOptions,
} from "$lib/shared/foundation/domain/models/generation/generate-models";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

function baseOptions(overrides: Partial<GenerationOptions>): GenerationOptions {
  return {
    mode: GenerationMode.FREEFORM,
    length: 8,
    gridMode: GridMode.DIAMOND,
    propType: PropType.FAN,
    difficulty: DifficultyLevel.BEGINNER,
    ...overrides,
  };
}

function makeOrchestrator() {
  const stubVariationProvider = {
    initialize: vi.fn().mockResolvedValue(undefined),
  };
  const stubTransformer = {
    convertToSequenceData: vi.fn().mockResolvedValue({ id: "stub" }),
  };
  const stubMetadataManager = {
    mapDifficultyToLevel: vi.fn().mockReturnValue(1),
  };
  buildMock.mockReturnValue({ sequence: [] });
  return new GenerationOrchestrator(
    stubVariationProvider as never,
    stubTransformer as never,
    stubMetadataManager as never
  );
}

describe("GenerationOrchestrator hand relationship", () => {
  beforeEach(() => buildMock.mockReset());

  it("passes the relationship to the engine as a constraint option", async () => {
    await makeOrchestrator().generateSequence(
      baseOptions({ handRelationship: "mirrored", handRelationshipInverted: true })
    );
    const callArg = buildMock.mock.calls[0]![0];
    expect(callArg.constraintOptions.handRelationship).toEqual({
      map: "reflect-north-south",
      inverted: true,
    });
  });

  it("sends nothing for Free or when the field is absent", async () => {
    const orchestrator = makeOrchestrator();
    await orchestrator.generateSequence(baseOptions({ handRelationship: "free" }));
    await orchestrator.generateSequence(baseOptions({}));
    expect(buildMock.mock.calls).toHaveLength(2);
    for (const call of buildMock.mock.calls) {
      expect(call[0].constraintOptions.handRelationship).toBeUndefined();
    }
  });

  it("passes matchHandTurns to the builder on both paths", async () => {
    const orchestrator = makeOrchestrator();
    await orchestrator.generateSequence(baseOptions({ matchHandTurns: true }));
    await orchestrator.generateSequence(
      baseOptions({
        mode: GenerationMode.CIRCULAR,
        loopType: "rotated" as never,
        period: "halved" as never,
        matchHandTurns: true,
      })
    );
    await orchestrator.generateSequence(baseOptions({}));
    expect(buildMock.mock.calls[0]![0].matchHandTurns).toBe(true);
    expect(buildMock.mock.calls[1]![0].matchHandTurns).toBe(true);
    expect(buildMock.mock.calls[2]![0].matchHandTurns).toBe(false);
  });

  it("also reaches the circular path", async () => {
    await makeOrchestrator().generateSequence(
      baseOptions({
        mode: GenerationMode.CIRCULAR,
        loopType: "rotated" as never,
        period: "halved" as never,
        handRelationship: "unison",
        handRelationshipInverted: false,
      })
    );
    const callArg = buildMock.mock.calls[0]![0];
    expect(callArg.constraintOptions.handRelationship).toEqual({
      map: "identity",
      inverted: false,
    });
  });
});
