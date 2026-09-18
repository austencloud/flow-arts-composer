// tests/generation/constraints/style/prop-relationship-constraint.test.ts
import { describe, expect, it } from "vitest";
import {
  PropRelationshipConstraint,
  propRelatedRotationDirection,
  propRelationshipCouldHold,
} from "../../../../src/generation/constraints/style/prop-relationship-constraint.js";
import { ConstraintType } from "../../../../src/generation/constraints/constraint-types.js";
import { buildConstraintSet } from "../../../../src/generation/constraints/composition/build-constraint-set.js";
import type {
  ConstraintContext,
  MotionData,
  PictographData,
} from "../../../../src/generation/constraints/types.js";

function motion(
  motionType: string,
  rotationDirection: string,
  start = "n",
  end = "e"
): MotionData {
  return {
    motionType,
    rotationDirection,
    startLocation: start,
    endLocation: end,
    startOrientation: "in",
    endOrientation: "in",
    turns: 0,
  } as unknown as MotionData;
}

function candidate(left: MotionData, right: MotionData): PictographData {
  return {
    letter: "?",
    startPlacement: "?",
    endPlacement: "?",
    timing: "split",
    direction: "same",
    leftMotion: left,
    rightMotion: right,
  };
}

const proCw = motion("pro", "cw");
const proCcw = motion("pro", "ccw");
const dash = motion("dash", "noRotation");
const stat = motion("static", "noRotation", "n", "n");

describe("propRelationshipCouldHold", () => {
  it("checks the spin relation of two shifts", () => {
    expect(
      propRelationshipCouldHold(candidate(proCw, proCw), { direction: "same" })
    ).toBe(true);
    expect(
      propRelationshipCouldHold(candidate(proCw, proCcw), { direction: "same" })
    ).toBe(false);
    expect(
      propRelationshipCouldHold(candidate(proCw, proCcw), { direction: "opp" })
    ).toBe(true);
    expect(
      propRelationshipCouldHold(candidate(proCw, proCw), { direction: "opp" })
    ).toBe(false);
  });

  it("passes dash and static pairs through: their spin is settled later", () => {
    expect(
      propRelationshipCouldHold(candidate(dash, dash), { direction: "opp" })
    ).toBe(true);
    expect(
      propRelationshipCouldHold(candidate(stat, stat), { direction: "same" })
    ).toBe(true);
    expect(
      propRelationshipCouldHold(candidate(dash, proCw), { direction: "same" })
    ).toBe(true);
  });

  it("rejects a shift paired with a dash or static once a timing is set", () => {
    expect(
      propRelationshipCouldHold(candidate(dash, proCw), {
        direction: "same",
        timing: "tog",
      })
    ).toBe(false);
    expect(
      propRelationshipCouldHold(candidate(proCw, stat), {
        direction: "same",
        timing: "split",
      })
    ).toBe(false);
    expect(
      propRelationshipCouldHold(candidate(dash, stat), {
        direction: "same",
        timing: "tog",
      })
    ).toBe(true);
    expect(
      propRelationshipCouldHold(candidate(proCw, proCw), {
        direction: "same",
        timing: "tog",
      })
    ).toBe(true);
  });
});

describe("PropRelationshipConstraint", () => {
  it("is a hard variation constraint that scores what couldSatisfy says", () => {
    const constraint = new PropRelationshipConstraint({ direction: "opp" });
    expect(constraint.type).toBe(ConstraintType.PROP_RELATIONSHIP);
    expect(constraint.mode).toBe("hard");
    const ok: ConstraintContext = {
      stepIndex: 0,
      totalSteps: 2,
      previousSteps: [],
      letter: "?",
      candidate: candidate(proCw, proCcw),
    };
    expect(constraint.evaluate(ok).satisfied).toBe(true);
    expect(constraint.couldSatisfy(candidate(proCw, proCw))).toBe(false);
  });

  it("is added to the hard set by buildConstraintSet", () => {
    const set = buildConstraintSet({ propRelationship: { direction: "same" } });
    expect(
      set.hard.some((c) => c.type === ConstraintType.PROP_RELATIONSHIP)
    ).toBe(true);
    expect(
      buildConstraintSet({}).hard.some(
        (c) => c.type === ConstraintType.PROP_RELATIONSHIP
      )
    ).toBe(false);
  });
});

describe("propRelatedRotationDirection", () => {
  it("copies or flips the right hand's spin", () => {
    expect(propRelatedRotationDirection("cw", "same")).toBe("cw");
    expect(propRelatedRotationDirection("cw", "opp")).toBe("ccw");
    expect(propRelatedRotationDirection("ccw", "opp")).toBe("cw");
    expect(propRelatedRotationDirection("noRotation", "opp")).toBeUndefined();
    expect(propRelatedRotationDirection(undefined, "same")).toBeUndefined();
  });
});
