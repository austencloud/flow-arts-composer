import { describe, it, expect } from "vitest";
import {
  reconcileStepDerived,
  normalizeSequenceDerived,
  rotateSequenceGeometry,
} from "./sequence-derived-fields";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  GridLocation,
  GridMode,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

function step(
  left: { start: GridLocation; end: GridLocation },
  right: { start: GridLocation; end: GridLocation },
  stale: Partial<StepData> = {}
): StepData {
  return {
    ...createStepData({
      ...stale,
      motions: {
        [HandSide.LEFT]: createMotionData({
          hand: HandSide.LEFT,
          startLocation: left.start,
          endLocation: left.end,
        }),
        [HandSide.RIGHT]: createMotionData({
          hand: HandSide.RIGHT,
          startLocation: right.start,
          endLocation: right.end,
        }),
      },
    }),
    // createStepData drops gridMode — re-apply any stale gridMode the test set
    ...(stale.gridMode !== undefined ? { gridMode: stale.gridMode } : {}),
  } as StepData;
}

describe("reconcileStepDerived", () => {
  it("heals the canonical stale alpha2 → GAMMA14 box-M step", () => {
    // blue nw→ne, red sw→se; stale stored alpha2/alpha4 from a pre-edit seed
    const stale = step(
      { start: GridLocation.NORTHWEST, end: GridLocation.NORTHEAST },
      { start: GridLocation.SOUTHWEST, end: GridLocation.SOUTHEAST },
      {
        startPlacement: GridPlacement.ALPHA2,
        endPlacement: GridPlacement.ALPHA4,
        letter: "M" as StepData["letter"],
      }
    );

    const fixed = reconcileStepDerived(stale);

    expect(fixed.startPlacement).toBe(GridPlacement.GAMMA14);
    expect(fixed.endPlacement).toBe(GridPlacement.GAMMA4);
    expect(fixed.gridMode).toBe(GridMode.BOX);
    // letter is Layer 2 (async) — reconcileStepDerived leaves it untouched here
    expect(fixed.letter).toBe("M");
  });

  it("derives DIAMOND + correct placement for a cardinal pair", () => {
    const s = step(
      { start: GridLocation.SOUTH, end: GridLocation.NORTH },
      { start: GridLocation.NORTH, end: GridLocation.SOUTH }
    );
    const fixed = reconcileStepDerived(s);
    expect(fixed.gridMode).toBe(GridMode.DIAMOND);
    expect(fixed.startPlacement).toBe(GridPlacement.ALPHA1);
  });

  it("derives SKEWED + zeta placement for a mixed cardinal/intercardinal pair", () => {
    const s = step(
      { start: GridLocation.SOUTHWEST, end: GridLocation.NORTH },
      { start: GridLocation.NORTH, end: GridLocation.SOUTHWEST }
    );
    const fixed = reconcileStepDerived(s);
    expect(fixed.gridMode).toBe(GridMode.SKEWED);
    expect(fixed.startPlacement).toBe(GridPlacement.ZETA1);
  });

  it("stamps the derived gridMode onto both motions", () => {
    const s = step(
      { start: GridLocation.NORTHWEST, end: GridLocation.NORTHEAST },
      { start: GridLocation.SOUTHWEST, end: GridLocation.SOUTHEAST }
    );
    const fixed = reconcileStepDerived(s);
    expect(fixed.motions[HandSide.LEFT]?.gridMode).toBe(GridMode.BOX);
    expect(fixed.motions[HandSide.RIGHT]?.gridMode).toBe(GridMode.BOX);
  });

  it("preserves the step-level gridMode field (createStepData-drop trap)", () => {
    const s = step(
      { start: GridLocation.NORTHWEST, end: GridLocation.NORTHEAST },
      { start: GridLocation.SOUTHWEST, end: GridLocation.SOUTHEAST }
    );
    const fixed = reconcileStepDerived(s);
    expect(fixed.gridMode).toBeDefined();
    expect(fixed.gridMode).toBe(GridMode.BOX);
  });

  it("is idempotent on already-correct data", () => {
    const s = step(
      { start: GridLocation.SOUTH, end: GridLocation.NORTH },
      { start: GridLocation.NORTH, end: GridLocation.SOUTH }
    );
    const once = reconcileStepDerived(s);
    const twice = reconcileStepDerived(once);
    expect(twice.startPlacement).toBe(once.startPlacement);
    expect(twice.endPlacement).toBe(once.endPlacement);
    expect(twice.gridMode).toBe(once.gridMode);
  });

  it("keeps prior placements and does not throw on a corrupt location", () => {
    const s = step(
      { start: GridLocation.SOUTH, end: GridLocation.NORTH },
      { start: GridLocation.NORTH, end: GridLocation.SOUTH },
      { startPlacement: GridPlacement.ALPHA1 }
    );
    // Corrupt blue start location → not a valid pair key
    const corrupt: StepData = {
      ...s,
      motions: {
        ...s.motions,
        [HandSide.LEFT]: {
          ...s.motions[HandSide.LEFT]!,
          startLocation: "xyz" as GridLocation,
        },
      },
    };
    expect(() => reconcileStepDerived(corrupt)).not.toThrow();
    const fixed = reconcileStepDerived(corrupt);
    expect(fixed.startPlacement).toBe(GridPlacement.ALPHA1); // prior kept
  });

  it("returns blank/incomplete steps unchanged", () => {
    const blank = createStepData({ isBlank: true });
    expect(reconcileStepDerived(blank)).toBe(blank);
    const oneHand = createStepData({
      motions: { [HandSide.LEFT]: createMotionData({}) },
    });
    expect(reconcileStepDerived(oneHand)).toBe(oneHand);
  });
});

describe("normalizeSequenceDerived", () => {
  it("heals every step and sets sequence.gridMode from the reconciled steps", () => {
    const boxStep = step(
      { start: GridLocation.NORTHWEST, end: GridLocation.NORTHEAST },
      { start: GridLocation.SOUTHWEST, end: GridLocation.SOUTHEAST },
      { startPlacement: GridPlacement.ALPHA2, stepNumber: 1 }
    );
    const seq = {
      id: "s1",
      name: "t",
      word: "",
      steps: [boxStep],
      gridMode: GridMode.DIAMOND, // STALE sequence-level value
      difficulty: 1,
      metadata: {},
    } as unknown as SequenceData;

    const fixed = normalizeSequenceDerived(seq);

    expect(fixed.steps[0]!.startPlacement).toBe(GridPlacement.GAMMA14);
    expect(fixed.steps[0]!.gridMode).toBe(GridMode.BOX);
    expect(fixed.gridMode).toBe(GridMode.BOX); // sequence-level healed too
  });

  it("is a no-op (value-equal) on already-correct sequences", () => {
    const good = step(
      { start: GridLocation.SOUTH, end: GridLocation.NORTH },
      { start: GridLocation.NORTH, end: GridLocation.SOUTH },
      { stepNumber: 1 }
    );
    const seq = {
      id: "s2",
      name: "t",
      word: "",
      steps: [good],
      gridMode: GridMode.DIAMOND,
      difficulty: 1,
      metadata: {},
    } as unknown as SequenceData;

    const once = normalizeSequenceDerived(seq);
    const twice = normalizeSequenceDerived(once);
    expect(twice.steps[0]!.startPlacement).toBe(once.steps[0]!.startPlacement);
    expect(twice.gridMode).toBe(once.gridMode);
  });
});

describe("rotateSequenceGeometry", () => {
  function alphaSeq(): SequenceData {
    const sp = {
      isStartPlacement: true,
      id: "sp",
      motions: {
        [HandSide.LEFT]: createMotionData({
          hand: HandSide.LEFT,
          startLocation: GridLocation.NORTH,
          endLocation: GridLocation.NORTH,
        }),
        [HandSide.RIGHT]: createMotionData({
          hand: HandSide.RIGHT,
          startLocation: GridLocation.SOUTH,
          endLocation: GridLocation.SOUTH,
        }),
      },
    };
    const step1 = createStepData({
      stepNumber: 1,
      motions: {
        [HandSide.LEFT]: createMotionData({
          hand: HandSide.LEFT,
          startLocation: GridLocation.NORTH,
          endLocation: GridLocation.EAST,
        }),
        [HandSide.RIGHT]: createMotionData({
          hand: HandSide.RIGHT,
          startLocation: GridLocation.SOUTH,
          endLocation: GridLocation.WEST,
        }),
      },
    });
    return {
      id: "a",
      name: "t",
      word: "",
      steps: [step1],
      startPlacement: sp,
      gridMode: GridMode.DIAMOND,
      difficulty: 1,
      metadata: {},
    } as unknown as SequenceData;
  }

  it("rotates a diamond alpha seed +1 (CW 45°) into box, reconciling placements+gridMode", () => {
    const out = rotateSequenceGeometry(alphaSeq(), 1);
    const sp = out.startPlacement!;
    expect(sp.motions[HandSide.LEFT]!.startLocation).toBe(GridLocation.NORTHEAST); // N → NE
    expect(sp.motions[HandSide.RIGHT]!.startLocation).toBe(GridLocation.SOUTHWEST); // S → SW
    expect(sp.gridMode).toBe(GridMode.BOX);
    expect(out.steps[0]!.gridMode).toBe(GridMode.BOX);
  });

  it("round-trips: +1 then -1 restores original locations + diamond", () => {
    const there = rotateSequenceGeometry(alphaSeq(), 1);
    const back = rotateSequenceGeometry(there, -1);
    expect(back.steps[0]!.motions![HandSide.LEFT]!.startLocation).toBe(GridLocation.NORTH);
    expect(back.steps[0]!.motions![HandSide.RIGHT]!.endLocation).toBe(GridLocation.WEST);
    expect(back.steps[0]!.gridMode).toBe(GridMode.DIAMOND);
  });

  it("steps=0 is identity (same ref)", () => {
    const s = alphaSeq();
    expect(rotateSequenceGeometry(s, 0)).toBe(s);
  });
});
