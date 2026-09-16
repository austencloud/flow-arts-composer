/**
 * Integration tests for executeLOOPSpec / executeSymmetricSpec.
 *
 * Covers: entry-point routing, structural invariants, ROTATED stage
 * skip/execute logic, compound flag interactions, alternating pattern.
 * Parity with legacy executors is tested separately in spec-executor-parity.test.ts.
 */

import { describe, it, expect } from "vitest";
import {
  executeLOOPSpec,
  executeSymmetricSpec,
  getLOOPSpecExpansionMultiplier,
} from "../../../src/loop/execution/spec-executor.js";
import {
  LOOPComponent,
  type LOOPSpec,
  type PropLOOPSpec,
  type ComponentSpec,
  singleComponent,
  symmetricSpec,
  EMPTY_PROP_SPEC,
} from "../../../src/loop/loop-spec.js";
import type {
  SequenceStep,
  MotionData,
} from "../../../src/core/types/sequence-engine-types.js";

// Factories

function makeMotion(overrides: Partial<MotionData> = {}): MotionData {
  return {
    motionType: "pro",
    startLocation: "n",
    endLocation: "e",
    rotationDirection: "cw",
    startOrientation: "in",
    endOrientation: "clock",
    turns: 1,
    ...overrides,
  } as MotionData;
}

function makeStep(
  stepNumber: number,
  startPos: string,
  endPos: string,
  leftOverrides: Partial<MotionData> = {},
  rightOverrides: Partial<MotionData> = {},
  letter: string | null = "A",
): SequenceStep {
  return {
    id: `step-${stepNumber}`,
    stepNumber,
    duration: 1,
    letter,
    startPlacement: startPos,
    endPlacement: endPos,
    motions: {
      left: makeMotion({ startLocation: "n", endLocation: "e", ...leftOverrides }),
      right: makeMotion({ startLocation: "s", endLocation: "w", ...rightOverrides }),
    },
  } as SequenceStep;
}

function makeStaticPositionSequence(stepCount = 1): SequenceStep[] {
  const sequence: SequenceStep[] = [
    makeStep(0, "alpha1", "alpha1",
      { startLocation: "s", endLocation: "s" },
      { startLocation: "n", endLocation: "n" }, null),
  ];
  for (let i = 1; i <= stepCount; i++) {
    sequence.push(makeStep(i, "alpha1", "alpha1",
      { startLocation: "s", endLocation: "s", motionType: "pro", rotationDirection: "cw" },
      { startLocation: "n", endLocation: "n", motionType: "pro", rotationDirection: "cw" },
    ));
  }
  return sequence;
}

function makeRotatableSequence(stepCount = 1): SequenceStep[] {
  const sequence: SequenceStep[] = [
    makeStep(0, "alpha1", "alpha1",
      { startLocation: "s", endLocation: "s" },
      { startLocation: "n", endLocation: "n" }, null),
  ];
  for (let i = 1; i <= stepCount; i++) {
    sequence.push(makeStep(i, "alpha1", "alpha5",
      { startLocation: "s", endLocation: "n", rotationDirection: "cw" },
      { startLocation: "n", endLocation: "s", rotationDirection: "cw" },
    ));
  }
  return sequence;
}

function deepClone(seq: SequenceStep[]): SequenceStep[] {
  return JSON.parse(JSON.stringify(seq));
}

// ---------------------------------------------------------------------------
// Invariant assertions
// ---------------------------------------------------------------------------

function assertStructuralInvariants(result: SequenceStep[]) {
  for (let i = 1; i < result.length; i++) {
    const prev = result[i - 1]!;
    const curr = result[i]!;
    expect(curr.stepNumber).toBeGreaterThan(prev.stepNumber ?? -1);
    expect(curr.startPlacement).toBe(prev.endPlacement);
    expect(curr.motions.left.startLocation).toBe(prev.motions.left.endLocation);
    expect(curr.motions.right.startLocation).toBe(prev.motions.right.endLocation);
  }
}

// ---------------------------------------------------------------------------
// executeLOOPSpec entry point routing
// ---------------------------------------------------------------------------

describe("executeLOOPSpec routing", () => {
  it("symmetric spec produces extended output", () => {
    const spec = symmetricSpec(new Map([[LOOPComponent.MIRRORED, { period: 2 }]]));
    const seq = makeStaticPositionSequence(2);
    const result = executeLOOPSpec(deepClone(seq), spec);
    expect(result.length).toBeGreaterThan(seq.length);
  });

  it("throws for asymmetric spec (different components)", () => {
    const spec: LOOPSpec = {
      left: singleComponent(LOOPComponent.MIRRORED, 2),
      right: singleComponent(LOOPComponent.ROTATED, 4),
    };
    expect(() => executeLOOPSpec(makeStaticPositionSequence(), spec)).toThrow(/asymmetric/i);
  });

  it("throws for left-only spec (left defined, right undefined)", () => {
    const spec: LOOPSpec = { left: singleComponent(LOOPComponent.INVERTED, 2) };
    expect(() => executeLOOPSpec(makeStaticPositionSequence(2), spec)).toThrow(/asymmetric/i);
  });

  it("empty spec returns input unchanged", () => {
    const seq = makeStaticPositionSequence(3);
    const result = executeLOOPSpec(deepClone(seq), { left: EMPTY_PROP_SPEC, right: EMPTY_PROP_SPEC });
    expect(result.length).toBe(seq.length);
  });
});

describe("getLOOPSpecExpansionMultiplier", () => {
  it("counts ROTATED and the fused MIRRORED+SWAPPED stage separately", () => {
    const prop: PropLOOPSpec = {
      components: new Map<LOOPComponent, ComponentSpec>([
        [LOOPComponent.ROTATED, { period: 2 }],
        [LOOPComponent.MIRRORED, { period: 2 }],
        [LOOPComponent.SWAPPED, { period: 2 }],
      ]),
    };

    expect(getLOOPSpecExpansionMultiplier({ left: prop, right: prop })).toBe(4);
  });

  it("counts ROTATED as absorbed by a same-period SWAPPED stage", () => {
    const prop: PropLOOPSpec = {
      components: new Map<LOOPComponent, ComponentSpec>([
        [LOOPComponent.ROTATED, { period: 2 }],
        [LOOPComponent.SWAPPED, { period: 2 }],
      ]),
    };

    expect(getLOOPSpecExpansionMultiplier({ left: prop, right: prop })).toBe(2);
  });

  it("does not count overlay inversion as an expansion", () => {
    const prop: PropLOOPSpec = {
      components: new Map<LOOPComponent, ComponentSpec>([
        [LOOPComponent.MIRRORED, { period: 2 }],
        [LOOPComponent.INVERTED, { period: 4, mode: "overlay" }],
      ]),
    };

    expect(getLOOPSpecExpansionMultiplier({ left: prop, right: prop })).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Structural invariants (one representative type — all fuseable share FusedExecutor)
// ---------------------------------------------------------------------------

describe("executeSymmetricSpec structural invariants", () => {
  it("period 2: length, step numbers, position + location chaining", () => {
    const spec = singleComponent(LOOPComponent.MIRRORED, 2);
    const steps = 3;
    const seq = makeStaticPositionSequence(steps);
    const result = executeSymmetricSpec(seq, spec);

    expect(result.length).toBe(steps * 2 + 1);
    expect(result[0]!.stepNumber).toBe(0);
    expect(result[0]!.letter).toBeNull();
    assertStructuralInvariants(result);
  });

  it("period 4: length and invariants hold with multi-step partial", () => {
    const spec: PropLOOPSpec = {
      components: new Map([[LOOPComponent.MIRRORED, { period: 4 }]]),
    };
    const steps = 3;
    const seq = makeStaticPositionSequence(steps);
    const result = executeSymmetricSpec(seq, spec);

    expect(result.length).toBe(steps * 4 + 1);
    assertStructuralInvariants(result);
  });

  it("single-step partial at period 2", () => {
    const spec = singleComponent(LOOPComponent.INVERTED, 2);
    const result = executeSymmetricSpec(makeStaticPositionSequence(1), spec);
    expect(result.length).toBe(3);
    assertStructuralInvariants(result);
  });
});

// ---------------------------------------------------------------------------
// ROTATED stage routing (3 distinct code paths in spec-executor lines 47-62)
// ---------------------------------------------------------------------------

describe("executeSymmetricSpec ROTATED stage routing", () => {
  it("pure ROTATED: separate stage (no fuseable peers)", () => {
    const spec = singleComponent(LOOPComponent.ROTATED, 2);
    const result = executeSymmetricSpec(makeRotatableSequence(1), spec);
    expect(result.length).toBe(3);
    assertStructuralInvariants(result);
  });

  it("ROTATED + MIRRORED: separate stage fires (mirror/flip present)", () => {
    const spec: PropLOOPSpec = {
      components: new Map<LOOPComponent, ComponentSpec>([
        [LOOPComponent.ROTATED, { period: 2 }],
        [LOOPComponent.MIRRORED, { period: 2 }],
      ]),
    };
    const result = executeSymmetricSpec(makeRotatableSequence(1), spec);
    // ROTATED doubles → 2 steps, MIRRORED doubles → 4 steps + start = 5
    expect(result.length).toBe(5);
    assertStructuralInvariants(result);
  });

  it("ROTATED + MIRRORED + SWAPPED preserves and swaps the seed turn tuples", () => {
    const spec: PropLOOPSpec = {
      components: new Map<LOOPComponent, ComponentSpec>([
        [LOOPComponent.ROTATED, { period: 2 }],
        [LOOPComponent.MIRRORED, { period: 2 }],
        [LOOPComponent.SWAPPED, { period: 2 }],
      ]),
    };
    const seq = makeRotatableSequence(4);
    const seedTurns = [
      { left: 1, right: 0 },
      { left: 1, right: 1 },
      { left: 0, right: 1 },
      { left: 1, right: 0 },
    ];

    for (let index = 0; index < seedTurns.length; index++) {
      const turns = seedTurns[index]!;
      seq[index + 1]!.motions.left.turns = turns.left;
      seq[index + 1]!.motions.right.turns = turns.right;
    }

    const result = executeSymmetricSpec(seq, spec);
    expect(result).toHaveLength(17);

    for (let step = 1; step <= 4; step++) {
      expect(result[step + 4]!.motions.left.turns).toBe(
        result[step]!.motions.left.turns,
      );
      expect(result[step + 4]!.motions.right.turns).toBe(
        result[step]!.motions.right.turns,
      );
    }

    for (let step = 1; step <= 8; step++) {
      expect(result[step + 8]!.motions.left.turns).toBe(
        result[step]!.motions.right.turns,
      );
      expect(result[step + 8]!.motions.right.turns).toBe(
        result[step]!.motions.left.turns,
      );
    }
  });

  it("ROTATED + SWAP: stage skipped (implicit rotation in FusedExecutor)", () => {
    const spec: PropLOOPSpec = {
      components: new Map<LOOPComponent, ComponentSpec>([
        [LOOPComponent.ROTATED, { period: 2 }],
        [LOOPComponent.SWAPPED, { period: 2 }],
      ]),
    };
    const result = executeSymmetricSpec(makeRotatableSequence(1), spec);
    // No separate ROTATED stage → 1 * 2 + start = 3
    expect(result.length).toBe(3);
    assertStructuralInvariants(result);
  });
});

// ---------------------------------------------------------------------------
// Compound flag interactions (FusedExecutor math)
// ---------------------------------------------------------------------------

describe("FusedExecutor compound transforms", () => {
  it("MIRROR + SWAP: left reads right source", () => {
    const spec: PropLOOPSpec = {
      components: new Map<LOOPComponent, ComponentSpec>([
        [LOOPComponent.MIRRORED, { period: 2 }],
        [LOOPComponent.SWAPPED, { period: 2 }],
      ]),
    };
    const seq = makeStaticPositionSequence(1);
    seq[1]!.motions.left = makeMotion({ startLocation: "s", endLocation: "s", motionType: "pro", rotationDirection: "cw" });
    seq[1]!.motions.right = makeMotion({ startLocation: "n", endLocation: "n", motionType: "anti", rotationDirection: "ccw" });

    const transformed = executeSymmetricSpec(seq, spec)[2]!;
    expect(transformed.motions.left.motionType).toBe("anti");
  });

  it("FLIP + INVERT: flipCount=2 (even) preserves rotation, invert flips motionType", () => {
    const spec: PropLOOPSpec = {
      components: new Map<LOOPComponent, ComponentSpec>([
        [LOOPComponent.FLIPPED, { period: 2 }],
        [LOOPComponent.INVERTED, { period: 2 }],
      ]),
    };
    const seq = makeStaticPositionSequence(1);
    seq[1]!.motions.left = makeMotion({ startLocation: "s", endLocation: "s", motionType: "pro", rotationDirection: "cw" });

    const transformed = executeSymmetricSpec(seq, spec)[2]!;
    expect(transformed.motions.left.rotationDirection).toBe("cw");
    expect(transformed.motions.left.motionType).toBe("anti");
  });

  it("all four flags: flipCount=3 (odd) flips rotation, swap+invert double-inverts motionType", () => {
    const spec: PropLOOPSpec = {
      components: new Map<LOOPComponent, ComponentSpec>([
        [LOOPComponent.MIRRORED, { period: 2 }],
        [LOOPComponent.FLIPPED, { period: 2 }],
        [LOOPComponent.SWAPPED, { period: 2 }],
        [LOOPComponent.INVERTED, { period: 2 }],
      ]),
    };
    const seq = makeStaticPositionSequence(1);
    seq[1]!.motions.left = makeMotion({ startLocation: "s", endLocation: "s", motionType: "pro", rotationDirection: "cw" });
    seq[1]!.motions.right = makeMotion({ startLocation: "n", endLocation: "n", motionType: "anti", rotationDirection: "ccw" });

    const transformed = executeSymmetricSpec(seq, spec)[2]!;
    // swap: left reads right (anti), invert: anti→pro
    expect(transformed.motions.left.motionType).toBe("pro");
    // source right rotDir "ccw", flipCount=3 odd → "cw"
    expect(transformed.motions.left.rotationDirection).toBe("cw");
  });

  it("period 4: odd passes transform, even passes copy (alternating pattern)", () => {
    const spec: PropLOOPSpec = {
      components: new Map([[LOOPComponent.INVERTED, { period: 4 }]]),
    };
    const seq = makeStaticPositionSequence(1);
    seq[1]!.motions.left = makeMotion({ startLocation: "s", endLocation: "s", motionType: "pro", rotationDirection: "cw" });

    const result = executeSymmetricSpec(seq, spec);
    expect(result.length).toBe(5);
    expect(result[1]!.motions.left.motionType).toBe("pro");  // pass 0: original
    expect(result[2]!.motions.left.motionType).toBe("anti"); // pass 1: transform
    expect(result[3]!.motions.left.motionType).toBe("pro");  // pass 2: copy
    expect(result[4]!.motions.left.motionType).toBe("anti"); // pass 3: transform
  });
});
