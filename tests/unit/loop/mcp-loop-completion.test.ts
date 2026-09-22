import { describe, expect, it } from "vitest";

import type { SequenceStep as McpStep } from "../../../mcp-server-pkg/src/core/sequence-builder.js";
import { executeLOOP } from "../../../mcp-server-pkg/src/core/loop/loop-adapter.js";
import {
  ALL_LOOP_TYPES,
  LOOPType,
  Period,
  completeLOOPExtension,
  getLOOPSpecExpansionMultiplier,
} from "@tka/sequence-engine/loop";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

import {
  buildSeed,
  buildChains,
  loadPictographRows,
  type SeedOptions,
} from "../opus-sequence-parity/harness/canonical-fixtures";

function seedFor(
  letter: string,
  startPlacement: string,
  endPlacement: string,
  options: SeedOptions = {}
): McpStep[] {
  const row = loadPictographRows("diamond").find(
    (candidate) =>
      candidate.letter === letter &&
      candidate.startPlacement === startPlacement &&
      candidate.endPlacement === endPlacement
  );
  if (!row) {
    throw new Error(
      `No canonical diamond row for ${letter} ${startPlacement}→${endPlacement}`
    );
  }
  return buildSeed([row], "diamond", options).map(toMcpStep);
}

function toMcpStep(step: StepData): McpStep {
  return {
    letter: step.letter ?? "",
    variation: step.variation ?? 0,
    startPlacement: step.startPlacement ?? "",
    endPlacement: step.endPlacement ?? "",
    leftMotion: { ...step.motions.left, hand: "left" },
    rightMotion: { ...step.motions.right, hand: "right" },
    stepNumber: step.stepNumber,
    duration: step.duration,
    ...(step.isBridge !== undefined && { isBridge: step.isBridge }),
  } as McpStep;
}

describe("MCP LOOP completion adapter", () => {
  it("completes the formerly stalled quartered composite with the authored prefix and orientation seam intact", () => {
    const seed = seedFor("A", "alpha3", "alpha5", {
      turns: { left: 1, right: 1 },
    });
    seed[0] = {
      ...seed[0]!,
      duration: 3,
      leftReversal: true,
      rightReversal: false,
    };
    seed[1] = {
      ...seed[1]!,
      duration: 2.5,
      isBridge: true,
      leftReversal: false,
      rightReversal: true,
    };
    const before = structuredClone(seed);

    const result = executeLOOP(
      seed,
      "A",
      LOOPType.ROTATED_INVERTED,
      Period.QUARTERED
    );

    expect(result.success).toBe(true);
    expect(result.isCircular).toBe(true);
    expect(seed).toEqual(before);
    expect(result.steps.slice(0, seed.length)).toEqual(before);
    expect(result.derivedBeatIndices).toEqual([2, 3, 4]);

    const start = result.steps[0]!;
    const end = result.steps.at(-1)!;
    expect(end.endPlacement).toBe(start.startPlacement);
    expect(end.leftMotion.endOrientation).toBe(
      start.leftMotion.startOrientation
    );
    expect(end.rightMotion.endOrientation).toBe(
      start.rightMotion.startOrientation
    );
  });

  it("extends beyond the structural period when canonical turn data needs another orientation cycle", () => {
    const result = ALL_LOOP_TYPES.flatMap((loopType) =>
      buildChains("diamond", 1, 200).map((chain) => {
        const canonicalSeed = buildSeed(chain, "diamond", {
          turns: { left: 1, right: 0.5 },
        });
        let structuralLength: number;
        try {
          const canonical = completeLOOPExtension(canonicalSeed as never, {
            loopType,
            period: Period.HALVED,
          });
          structuralLength = 1 + getLOOPSpecExpansionMultiplier(canonical.spec);
        } catch {
          return null;
        }
        const completed = executeLOOP(
          canonicalSeed.map(toMcpStep),
          chain[0]!.letter,
          loopType,
          Period.HALVED
        );
        return { completed, structuralLength };
      })
    ).find(
      (candidate) =>
        candidate !== null &&
        candidate.completed.success &&
        candidate.completed.steps.length > candidate.structuralLength
    );

    expect(result).toBeDefined();
    if (!result) return;
    expect(result.completed.success).toBe(true);
    expect(result.completed.steps.length).toBeGreaterThan(
      result.structuralLength
    );
    const start = result.completed.steps[0]!;
    const end = result.completed.steps.at(-1)!;
    expect(end.endPlacement).toBe(start.startPlacement);
    expect(end.leftMotion.endOrientation).toBe(
      start.leftMotion.startOrientation
    );
    expect(end.rightMotion.endOrientation).toBe(
      start.rightMotion.startOrientation
    );
  });

  it("keeps the shared rejection for a quartered rewound request", () => {
    const result = executeLOOP(
      seedFor("α", "alpha3", "alpha3"),
      "α",
      LOOPType.REWOUND,
      Period.QUARTERED
    );

    expect(result.success).toBe(false);
    expect(result.steps).toEqual([]);
    expect(result.isCircular).toBe(false);
    expect(result.error).toMatch(/rewound.*quartered/i);
  });
});
