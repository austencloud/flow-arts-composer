import { describe, it, expect } from "vitest";
import { buildFlowerSequence } from "../build-flower-sequence";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

// Minimal two-hand archetype: one step, both hands pro, south start, in orientation.
function proArchetype(): SequenceData {
  const motion = (color: "left" | "right") => ({
    motionType: "pro",
    rotationDirection: "cw",
    startLocation: "s",
    endLocation: "s",
    turns: 0,
    startOrientation: "in",
    endOrientation: "in",
    isVisible: true,
    propType: "staff",
    arrowLocation: "s",
    color,
    gridMode: "diamond",
    arrowPlacementData: {},
    propPlacementData: {},
  });
  const step = {
    id: "step-1",
    stepNumber: 1,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    motions: { left: motion("left"), right: motion("right") },
    gridMode: "diamond",
  };
  return {
    id: "arch-pro",
    name: "arch",
    word: "A",
    startPlacement: {
      isStartPlacement: true,
      id: "SP",
      startPos: "alpha",
      endPos: "alpha",
      letter: null,
      gridMode: "diamond",
      motions: { left: motion("left"), right: motion("right") },
    },
    steps: [step as any],
    thumbnails: [],
    isFavorite: false,
    isCircular: true,
    tags: [],
    metadata: {},
  } as unknown as SequenceData;
}

describe("buildFlowerSequence", () => {
  // Absence is encoded as an invisible placeholder, not a missing key: every
  // Step carries BOTH hands, and isVisibleMotion() is the presence predicate
  // (the StepData/Step unification — "absence = invisible placeholder"). The
  // stripped hand therefore stays on the step with isVisible: false.
  it("strips to the requested hand only", () => {
    const seq = buildFlowerSequence(
      proArchetype(),
      { style: "pro", turns: 1, ori: "in", grid: "diamond", petals: 2 },
      "left",
      []
    );
    const m = seq.steps[0]!.motions;
    expect(m.left?.isVisible).toBe(true);
    expect(m.right?.isVisible).toBe(false);
  });

  it("tags the shown hand's prop as a club", () => {
    const seq = buildFlowerSequence(
      proArchetype(),
      { style: "pro", turns: 1, ori: "in", grid: "diamond", petals: 2 },
      "left",
      []
    );
    expect(seq.steps[0]!.motions.left?.propType).toBe("club");
  });

  it("repeats a quarter-turn position path until the prop orientation closes", () => {
    const seq = buildFlowerSequence(
      proArchetype(),
      { style: "pro", turns: 0.25, ori: "in", grid: "diamond", petals: 1 },
      "left",
      []
    );

    expect(seq.orientationCycleCount).toBe(8);
    expect(seq.steps).toHaveLength(8);
    expect(seq.steps.at(-1)!.motions.left?.endOrientation).toBe(
      seq.steps[0]!.motions.left?.startOrientation
    );
  });

  it("starts the second quarter-turn flower on its complementary phase", () => {
    const inside = buildFlowerSequence(
      proArchetype(),
      { style: "pro", turns: 0.75, ori: "in", grid: "diamond", petals: 3 },
      "left",
      []
    );
    const outside = buildFlowerSequence(
      proArchetype(),
      { style: "pro", turns: 0.75, ori: "out", grid: "diamond", petals: 3 },
      "left",
      []
    );

    expect(inside.steps[0]!.motions.left?.startOrientation).toBe("in");
    expect(outside.steps[0]!.motions.left?.startOrientation).toBe("clock");
  });

  it("preserves the radial in/out pair for denominator-one flowers", () => {
    const outside = buildFlowerSequence(
      proArchetype(),
      { style: "pro", turns: 1.5, ori: "out", grid: "diamond", petals: 3 },
      "left",
      []
    );

    expect(outside.steps[0]!.motions.left?.startOrientation).toBe("out");
  });
});
