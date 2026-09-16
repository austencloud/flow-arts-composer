import { describe, expect, it } from "vitest";
import { executeSymmetricSpec } from "../../../src/loop/execution/spec-executor.js";
import { LOOPComponent, type PropLOOPSpec } from "../../../src/loop/loop-spec.js";
import type { SequenceStep } from "../../../src/core/types/sequence-engine-types.js";

// Minimal 2-step closed-under-mirror seed: startPos + 2 letter steps whose
// motions are pro/anti (so inversion is observable). Build hand-rolled steps
// with the fields the executors touch (motions, positions, stepNumber, letter).
function step(n: number, letter: string, sp: string, ep: string, left: any, right: any): SequenceStep {
  return { stepNumber: n, letter, startPlacement: sp, endPlacement: ep, motions: { left, right } } as unknown as SequenceStep;
}
const m = (motionType: string, rotationDirection: string, startLocation: string, endLocation: string) => ({
  motionType, rotationDirection, startLocation, endLocation,
  startOrientation: "in", endOrientation: "in", turns: 0, hand: "left",
});

function makeSeed(): SequenceStep[] {
  return [
    step(0, "", "gamma13", "gamma13", m("static", "noRotation", "w", "w"), m("static", "noRotation", "s", "s")),
    step(1, "Z", "gamma13", "beta5", m("anti", "cw", "w", "s"), m("static", "noRotation", "s", "s")),
    step(2, "Θ", "beta5", "gamma5", m("pro", "ccw", "s", "e"), m("static", "noRotation", "s", "s")),
  ];
}

function spec(entries: Array<[LOOPComponent, { period: number; mode?: "expand" | "overlay" }]>): PropLOOPSpec {
  return { components: new Map(entries) };
}

describe("canonical stage order", () => {
  it("runs mirror/flip/swap groups before invert-only groups", () => {
    const result = executeSymmetricSpec(makeSeed(), spec([
      [LOOPComponent.MIRRORED, { period: 2 }],
      [LOOPComponent.INVERTED, { period: 4 }],
    ]));
    const steps = result.slice(1);
    expect(steps).toHaveLength(16);
    // Canonical: mirror first (2->4 = block X), then invert@4 alternates blocks
    // of 4. Steps 5-8 must be the motionType-flip of steps 1-4.
    for (let i = 0; i < 4; i++) {
      const base = steps[i]!.motions.left.motionType;
      const inv = steps[i + 4]!.motions.left.motionType;
      if (base === "pro") expect(inv).toBe("anti");
      if (base === "anti") expect(inv).toBe("pro");
    }
  });

  it("keeps same-period components fused in one group (legacy smear unaffected)", () => {
    const result = executeSymmetricSpec(makeSeed(), spec([
      [LOOPComponent.MIRRORED, { period: 2 }],
      [LOOPComponent.INVERTED, { period: 2 }],
    ]));
    // One fused group => x2 only: 2 seed steps -> 4 steps.
    expect(result.slice(1)).toHaveLength(4);
  });
});
