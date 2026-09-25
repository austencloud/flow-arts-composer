import { describe, expect, it, vi, beforeEach } from "vitest";
import { loadDiamondVariations } from "../../../packages/sequence-engine/tests/helpers/csv-variations";

// Stub the engine's SequenceBuilder so we can assert exactly what
// GenerationOrchestrator passes into build() without running a real
// beam-search build. Only this subpath is mocked — "@tka/sequence-engine/loop"
// and the root "@tka/sequence-engine" entry (used for loopSpecFromWire,
// LOOPType, Period, TransitionGraph) stay real.
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
import { buildLoopSpec } from "$lib/shared/create/services/loop-type-utils";
import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
import { loopSpecFromWire } from "@tka/sequence-engine/loop";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

function baseOptions(overrides: Partial<GenerationOptions>): GenerationOptions {
  return {
    mode: GenerationMode.CIRCULAR,
    length: 16,
    gridMode: GridMode.DIAMOND,
    propType: PropType.FAN,
    difficulty: DifficultyLevel.BEGINNER,
    ...overrides,
  };
}

function makeOrchestrator(sequenceResult: unknown = { sequence: [], loop: {} }) {
  const stubVariationProvider = {
    initialize: vi.fn().mockResolvedValue(undefined),
    getAllVariationsForGrid: vi.fn(async () => loadDiamondVariations()),
  };
  const stubTransformer = {
    convertToSequenceData: vi.fn().mockResolvedValue({ id: "stub" }),
  };
  const stubMetadataManager = { mapDifficultyToLevel: vi.fn().mockReturnValue(1) };

  buildMock.mockReturnValue(sequenceResult);

  const orchestrator = new GenerationOrchestrator(
    stubVariationProvider as any,
    stubTransformer as any,
    stubMetadataManager as any
  );
  return { orchestrator, stubTransformer };
}

describe("GenerationOrchestrator — loopSpecWire seed solver + pass-through", () => {
  beforeEach(() => {
    buildMock.mockReset();
  });

  it("solves seed length from expanderMultiplier and passes the runtime loopSpec nested at loop.loopSpec", async () => {
    const wire = buildLoopSpec(
      new Set([LOOPComponent.ROTATED, LOOPComponent.MIRRORED, LOOPComponent.INVERTED]),
      { rotationInterval: 2, inversionInterval: 4, inversionMode: "overlay" }
    )!;
    // expanderMultiplier(wire) === 4 (rot x2 * mir x2; overlay inversion x1)

    const { orchestrator } = makeOrchestrator();
    const options = baseOptions({ length: 16, loopSpecWire: wire, loopType: "mirrored_rotated" as never });

    await orchestrator.generateSequence(options);

    expect(buildMock).toHaveBeenCalledTimes(1);
    const callArg = buildMock.mock.calls[0]![0];
    expect(callArg.length).toBe(4); // 16 / 4
    expect(callArg.loop.loopSpec).toEqual(loopSpecFromWire(wire));
    expect(callArg.loop.requestedTotalLength).toBe(16);
  });

  it("throws a /divisible/ error when length is not divisible by the expander multiplier", async () => {
    const wire = buildLoopSpec(
      new Set([LOOPComponent.ROTATED, LOOPComponent.MIRRORED, LOOPComponent.INVERTED]),
      { rotationInterval: 2, inversionInterval: 4, inversionMode: "overlay" }
    )!;
    // multiplier === 4; 18 is not divisible by 4

    const { orchestrator } = makeOrchestrator();
    const options = baseOptions({ length: 18, loopSpecWire: wire, loopType: "mirrored_rotated" as never });

    await expect(orchestrator.generateSequence(options)).rejects.toThrow(/divisible/);
    expect(buildMock).not.toHaveBeenCalled();
  });

  it("throws a /too short/ error when the solved seed length is 1 and an expand-mode inversion is active", async () => {
    // rot:2 + inv:2 (expand, default mode): the engine's fused-stage rule
    // absorbs rotation into the invert-only fused group at the same period,
    // so expanderMultiplier === 2 (Task 6 finding). length 2 -> seedLength 1,
    // and INVERTED is expand-mode -> a 1-step seed is dash-only, so the
    // pro/anti flip inversion exists to show would be invisible.
    const wire = buildLoopSpec(
      new Set([LOOPComponent.ROTATED, LOOPComponent.INVERTED]),
      { rotationInterval: 2 }
    )!;

    const { orchestrator } = makeOrchestrator();
    const options = baseOptions({ length: 2, loopSpecWire: wire, loopType: "rotated_inverted" as never });

    await expect(orchestrator.generateSequence(options)).rejects.toThrow(/too short/);
    expect(buildMock).not.toHaveBeenCalled();
  });

  it("legacy path (no loopSpecWire) is untouched: divides by 2/4 from period, no loop.loopSpec key", async () => {
    const { orchestrator } = makeOrchestrator();
    const options = baseOptions({ length: 16, period: "quartered" as never, loopType: "rotated" as never });

    await orchestrator.generateSequence(options);

    expect(buildMock).toHaveBeenCalledTimes(1);
    const callArg = buildMock.mock.calls[0]![0];
    expect(callArg.length).toBe(4); // 16 / 4 (quartered)
    expect(callArg.loop.loopSpec).toBeUndefined();
    expect(callArg.loop.requestedTotalLength).toBe(16);
  });
});
