import { describe, it, expect } from "vitest";
import { turnsTupleGenerator } from "../turns-tuple-generator";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { createPictographData } from "#lib/shared/pictograph/shared/domain/factories/create-pictograph-data.js";
import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import {
  HandSide,
  MotionType,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

// Coverage for the halved-motion "/" marker
// (docs/superpowers/specs/2026-07-16-half-notation-canon-design.md): a
// motion with MotionData.segment set (frozen at t=0.5) must serialize its
// turn slot with a trailing "/", and ONLY that hand's slot - the sibling
// hand's slot is untouched.
describe("TurnsTupleGenerator - halved motion marker", () => {
  it("appends '/' only to the halved hand's slot (Type1 non-hybrid, letter A)", () => {
    const leftMotion = createMotionData({
      hand: HandSide.LEFT,
      motionType: MotionType.PRO,
      turns: 1,
      isVisible: true,
      segment: { t0: 0, t1: 0.5 },
    });
    const rightMotion = createMotionData({
      hand: HandSide.RIGHT,
      motionType: MotionType.ANTI,
      turns: 2,
      isVisible: true,
    });

    const pictograph = createPictographData({
      letter: Letter.A,
      motions: { left: leftMotion, right: rightMotion },
    });

    const tuple = turnsTupleGenerator.generateTurnsTuple(pictograph);

    expect(tuple).toBe("(1/, 2)");
  });

  it("marks the red slot when red is the halved hand", () => {
    const leftMotion = createMotionData({
      hand: HandSide.LEFT,
      motionType: MotionType.PRO,
      turns: 1,
      isVisible: true,
    });
    const rightMotion = createMotionData({
      hand: HandSide.RIGHT,
      motionType: MotionType.ANTI,
      turns: 1.5,
      isVisible: true,
      segment: { t0: 0, t1: 0.5 },
    });

    const pictograph = createPictographData({
      letter: Letter.A,
      motions: { left: leftMotion, right: rightMotion },
    });

    const tuple = turnsTupleGenerator.generateTurnsTuple(pictograph);

    expect(tuple).toBe("(1, 1.5/)");
  });

  it("does NOT append '/' for a non-midpoint segment fraction (e.g. a future quarter-freeze)", () => {
    const leftMotion = createMotionData({
      hand: HandSide.LEFT,
      motionType: MotionType.PRO,
      turns: 1,
      isVisible: true,
      segment: { t0: 0, t1: 0.25 },
    });
    const rightMotion = createMotionData({
      hand: HandSide.RIGHT,
      motionType: MotionType.ANTI,
      turns: 2,
      isVisible: true,
    });

    const pictograph = createPictographData({
      letter: Letter.A,
      motions: { left: leftMotion, right: rightMotion },
    });

    const tuple = turnsTupleGenerator.generateTurnsTuple(pictograph);

    expect(tuple).toBe("(1, 2)");
    expect(tuple).not.toContain("/");
  });

  it("regression: no motion carries a segment, no '/' appears anywhere", () => {
    const leftMotion = createMotionData({
      hand: HandSide.LEFT,
      motionType: MotionType.PRO,
      turns: 1,
      isVisible: true,
    });
    const rightMotion = createMotionData({
      hand: HandSide.RIGHT,
      motionType: MotionType.ANTI,
      turns: 2,
      isVisible: true,
    });

    const pictograph = createPictographData({
      letter: Letter.A,
      motions: { left: leftMotion, right: rightMotion },
    });

    const tuple = turnsTupleGenerator.generateTurnsTuple(pictograph);

    expect(tuple).toBe("(1, 2)");
    expect(tuple).not.toContain("/");
  });
});
