import { describe, it, expect } from "vitest";
import { detectUniformPattern } from "#lib/features/loop-labeler/services/detection/index.js";
import { stepComparisonOrchestrator } from "#lib/features/loop-labeler/services/comparison/step-comparison-orchestrator.js";
import type { ExtractedStep } from "#lib/features/loop-labeler/domain/models/internal-step-models.js";

function makeStep(
  num: number,
  bs: string, be: string, bm: string, bp: string,
  rs: string, re: string, rm: string, rp: string
): ExtractedStep {
  return {
    stepNumber: num,
    letter: "A",
    startPos: "alpha1",
    endPos: "alpha1",
    left: { startLoc: bs, endLoc: be, motionType: bm, propRotDir: bp },
    right: { startLoc: rs, endLoc: re, motionType: rm, propRotDir: rp },
  };
}

describe("detectUniformPattern — pipeline integration", () => {
  it("detects quartered 90° CW rotation", () => {
    const steps: ExtractedStep[] = [
      makeStep(1, "n", "e", "pro", "cw",  "s", "w", "pro", "cw"),
      makeStep(2, "e", "s", "pro", "cw",  "w", "n", "pro", "cw"),
      makeStep(3, "s", "w", "pro", "cw",  "n", "e", "pro", "cw"),
      makeStep(4, "w", "n", "pro", "cw",  "e", "s", "pro", "cw"),
    ];

    const candidates = detectUniformPattern(steps, stepComparisonOrchestrator);
    expect(candidates.length).toBeGreaterThan(0);

    const rotated = candidates.find(c => c.components.includes("rotated"));
    expect(rotated).toBeDefined();
    expect(rotated!.rotationDirection).toBe("cw");
    expect(rotated!.transformationIntervals.rotation).toBe(4);
  });

  it("detects halved 180° rotation", () => {
    const steps: ExtractedStep[] = [
      makeStep(1, "n", "e", "pro", "cw",  "s", "w", "pro", "cw"),
      makeStep(2, "e", "n", "anti", "ccw", "w", "s", "anti", "ccw"),
      makeStep(3, "s", "w", "pro", "cw",  "n", "e", "pro", "cw"),
      makeStep(4, "w", "s", "anti", "ccw", "e", "n", "anti", "ccw"),
    ];

    const candidates = detectUniformPattern(steps, stepComparisonOrchestrator);
    const rotated = candidates.find(c => c.components.includes("rotated"));
    expect(rotated).toBeDefined();
    expect(rotated!.transformationIntervals.rotation).toBe(2);
  });

  it("detects repeated pattern", () => {
    const steps: ExtractedStep[] = [
      makeStep(1, "n", "e", "pro", "cw", "s", "w", "pro", "cw"),
      makeStep(2, "n", "e", "pro", "cw", "s", "w", "pro", "cw"),
    ];

    const candidates = detectUniformPattern(steps, stepComparisonOrchestrator);
    const repeated = candidates.find(c => c.components.includes("repeated"));
    expect(repeated).toBeDefined();
  });

  it("returns empty for non-uniform pattern", () => {
    const steps: ExtractedStep[] = [
      makeStep(1, "n", "e", "pro", "cw",  "s", "w", "pro", "cw"),
      makeStep(2, "n", "s", "pro", "cw",  "s", "n", "pro", "cw"),
    ];

    const candidates = detectUniformPattern(steps, stepComparisonOrchestrator);
    const meaningful = candidates.filter(c => !c.components.includes("rewound"));
    expect(meaningful).toHaveLength(0);
  });
});
