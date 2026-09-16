import { describe, expect, it } from "vitest";
import { BuildResultTransformer } from "$lib/shared/create/services/build-result-transformer";
import { sequenceMetadataManager } from "$lib/shared/create/services/sequence-metadata-manager";
import { reversalDetector } from "$lib/shared/create/services/reversal-detector";
import {
  GenerationMode,
  DifficultyLevel,
  type GenerationOptions,
} from "$lib/shared/foundation/domain/models/generation/generate-models";
import { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { SequenceStep } from "@tka/sequence-engine/core";
import type { BuildResult } from "@tka/sequence-engine/generation";
import type { LOOPSpecWire } from "@tka/sequence-engine/loop";

// Minimal engine-shaped step/motion helpers — mirrors the pattern used in the
// engine's own spec-executor/overlay-inversion tests (Tasks 2-3 of this plan).
// The transformer only reads: letter, startPlacement, endPlacement, and
// motions.{blue,red}.{motionType,rotationDirection,startLocation,endLocation,
// startOrientation,endOrientation,turns} — see convertToSequenceData/mapStep/
// mapStartPlacement in build-result-transformer.ts.
function motion(motionType: string, rotationDirection: string, startLocation: string, endLocation: string) {
  return {
    motionType,
    rotationDirection,
    startLocation,
    endLocation,
    startOrientation: "in",
    endOrientation: "in",
    turns: 0,
    color: "blue",
  };
}

function step(
  n: number,
  letter: string,
  sp: string,
  ep: string,
  left: ReturnType<typeof motion>,
  right: ReturnType<typeof motion>
): SequenceStep {
  return { stepNumber: n, letter, startPlacement: sp, endPlacement: ep, motions: { left, right } } as unknown as SequenceStep;
}

function makeSequence(): SequenceStep[] {
  return [
    step(0, "", "gamma13", "gamma13", motion("static", "noRotation", "w", "w"), motion("static", "noRotation", "s", "s")),
    step(1, "Z", "gamma13", "beta5", motion("anti", "cw", "w", "s"), motion("static", "noRotation", "s", "s")),
  ];
}

function makeBuildResult(circular: boolean): BuildResult {
  return {
    sequence: makeSequence(),
    ...(circular ? { loop: { derivedWord: "Z", seedWord: "Z", components: [], derivedStepIndices: [] } } : {}),
  } as unknown as BuildResult;
}

function baseOptions(overrides: Partial<GenerationOptions>): GenerationOptions {
  return {
    mode: GenerationMode.CIRCULAR,
    length: 2,
    gridMode: GridMode.DIAMOND,
    propType: PropType.FAN,
    difficulty: DifficultyLevel.BEGINNER,
    ...overrides,
  };
}

const wire: LOOPSpecWire = {
  left: { rotated: { period: 2 } },
  right: { rotated: { period: 2 } },
};

describe("BuildResultTransformer — loopSpec certificate", () => {
  const transformer = new BuildResultTransformer(sequenceMetadataManager, reversalDetector);

  it("writes SequenceData.loopSpec when options.loopSpecWire is set and the result is circular", async () => {
    const result = await transformer.convertToSequenceData(
      makeBuildResult(true),
      baseOptions({ loopSpecWire: wire, loopType: LOOPType.ROTATED })
    );

    expect(result.loopSpec).toBe(wire);
    expect(result.loopType).toBe(LOOPType.ROTATED);
  });

  it("omits SequenceData.loopSpec when options.loopSpecWire is absent (byte-identical legacy behavior)", async () => {
    const result = await transformer.convertToSequenceData(
      makeBuildResult(true),
      baseOptions({ loopType: LOOPType.ROTATED })
    );

    expect(result.loopSpec).toBeUndefined();
    expect(result.loopType).toBe(LOOPType.ROTATED);
  });

  it("omits SequenceData.loopSpec when the result is not circular, even if loopSpecWire is set", async () => {
    const result = await transformer.convertToSequenceData(
      makeBuildResult(false),
      baseOptions({ loopSpecWire: wire })
    );

    expect(result.loopSpec).toBeUndefined();
    expect(result.isCircular).toBe(false);
  });
});
