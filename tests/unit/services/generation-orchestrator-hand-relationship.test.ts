import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Only SequenceBuilder is stubbed so the test can read what reaches build().
// Everything else on the generation subpath (the location maps
// handModeToEngine reads) is the real engine.
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

import { GenerationOrchestrator } from "$lib/shared/create/services/generation-orchestrator";
import {
  GenerationMode,
  DifficultyLevel,
  type GenerationOptions,
} from "$lib/shared/foundation/domain/models/generation/generate-models";
import { ConstraintType } from "@tka/sequence-engine/generation";
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

function circular(overrides: Partial<GenerationOptions>): GenerationOptions {
  return baseOptions({
    mode: GenerationMode.CIRCULAR,
    loopType: "mirrored" as never,
    period: "halved" as never,
    ...overrides,
  });
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
  buildMock.mockReturnValue({
    sequence: [],
    constraintReport: { score: 1, satisfied: true, details: [] },
  });
  return new GenerationOrchestrator(
    stubVariationProvider as never,
    stubTransformer as never,
    stubMetadataManager as never
  );
}

function constraintsOf(call = 0) {
  return buildMock.mock.calls[call]![0].constraintOptions;
}

describe("GenerationOrchestrator timing and direction", () => {
  beforeEach(() => buildMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it("sends the hand map with the derived inversion and the prop option", async () => {
    await makeOrchestrator().generateSequence(
      baseOptions({ handRelationship: "TS", propRelationship: "TO" })
    );
    expect(constraintsOf().handRelationship).toEqual({
      map: "identity",
      inverted: true,
    });
    expect(constraintsOf().propRelationship).toEqual({
      direction: "opp",
      timing: "tog",
    });
  });

  it("sends nothing for Free or when the fields are absent", async () => {
    const orchestrator = makeOrchestrator();
    await orchestrator.generateSequence(
      baseOptions({ handRelationship: "free", propRelationship: "free" })
    );
    await orchestrator.generateSequence(baseOptions({}));
    expect(buildMock.mock.calls).toHaveLength(2);
    for (const call of [0, 1]) {
      expect(constraintsOf(call).handRelationship).toBeUndefined();
      expect(constraintsOf(call).propRelationship).toBeUndefined();
    }
  });

  it("picks the quarter sense from a pinned start", async () => {
    const orchestrator = makeOrchestrator();
    await orchestrator.generateSequence(
      baseOptions({
        handRelationship: "QS",
        startPlacementId: "gamma9" as never,
      })
    );
    await orchestrator.generateSequence(
      baseOptions({
        handRelationship: "QS",
        startPlacementId: "gamma1" as never,
      })
    );
    expect(constraintsOf(0).handRelationship).toEqual({
      map: "rotate-90-cw",
      inverted: false,
    });
    expect(constraintsOf(1).handRelationship).toEqual({
      map: "rotate-90-ccw",
      inverted: false,
    });
  });

  it("follows a diagonal reflection LOOP axis for QO", async () => {
    await makeOrchestrator().generateSequence(
      circular({
        handRelationship: "QO",
        loopRhythm: {
          rotationInterval: 2,
          inversionInterval: 2,
          inversionMode: "expand",
          reflectionAxis: "northwest-southeast",
        } as never,
      })
    );
    expect(constraintsOf().handRelationship).toEqual({
      map: "reflect-northwest-southeast",
      inverted: false,
    });
  });

  it("rolls a quarter sense when nothing pins it", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    await makeOrchestrator().generateSequence(
      baseOptions({ handRelationship: "QS" })
    );
    expect(constraintsOf().handRelationship).toEqual({
      map: "rotate-90-ccw",
      inverted: false,
    });
  });

  it("passes matchHandTurns to the builder on both paths", async () => {
    const orchestrator = makeOrchestrator();
    await orchestrator.generateSequence(baseOptions({ matchHandTurns: true }));
    await orchestrator.generateSequence(
      circular({ loopType: "rotated" as never, matchHandTurns: true })
    );
    await orchestrator.generateSequence(baseOptions({}));
    expect(buildMock.mock.calls[0]![0].matchHandTurns).toBe(true);
    expect(buildMock.mock.calls[1]![0].matchHandTurns).toBe(true);
    expect(buildMock.mock.calls[2]![0].matchHandTurns).toBe(false);
  });

  it("also reaches the circular path", async () => {
    await makeOrchestrator().generateSequence(
      circular({ handRelationship: "TS", propRelationship: "SS" })
    );
    expect(constraintsOf().handRelationship).toEqual({
      map: "identity",
      inverted: false,
    });
    expect(constraintsOf().propRelationship).toEqual({
      direction: "same",
      timing: "split",
    });
  });

  it("hands the constraint report to the caller on both paths", async () => {
    const report = {
      score: 0.5,
      satisfied: false,
      details: [
        {
          constraint: ConstraintType.PROP_RELATIONSHIP,
          score: 0.5,
          description: "2 of 4 beats off",
          mode: "soft" as const,
        },
      ],
    };
    const onConstraintReport = vi.fn();
    const orchestrator = makeOrchestrator();
    buildMock.mockReturnValue({ sequence: [], constraintReport: report });
    await orchestrator.generateSequence(baseOptions({}), {
      onConstraintReport,
    });
    await orchestrator.generateSequence(circular({}), { onConstraintReport });
    expect(onConstraintReport).toHaveBeenCalledTimes(2);
    expect(onConstraintReport).toHaveBeenNthCalledWith(1, report);
    expect(onConstraintReport).toHaveBeenNthCalledWith(2, report);
  });
});
