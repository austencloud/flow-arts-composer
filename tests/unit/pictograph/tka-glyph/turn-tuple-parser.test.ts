import { describe, it, expect } from "vitest";
import { parseTurnsTuple } from "#lib/shared/pictograph/tka-glyph/utils/turn-tuple-parser.js";
import { TurnsTupleGenerator } from "#lib/shared/pictograph/arrow/positioning/placement/services/turns-tuple-generator.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  HandSide,
  MotionType,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";

describe("parseTurnsTuple — direct forms", () => {
  it("parses empty input defensively", () => {
    const out = parseTurnsTuple("");
    expect(out).toEqual({
      direction: null,
      top: 0,
      bottom: 0,
      topOpenClose: null,
      bottomOpenClose: null,
      topHalved: false,
      bottomHalved: false,
    });
  });

  it("parses 2-part numeric tuple", () => {
    expect(parseTurnsTuple("(1, 2)")).toEqual({
      direction: null,
      top: 1,
      bottom: 2,
      topOpenClose: null,
      bottomOpenClose: null,
      topHalved: false,
      bottomHalved: false,
    });
  });

  it("parses 2-part with float", () => {
    expect(parseTurnsTuple("(1.5, fl)")).toEqual({
      direction: null,
      top: 1.5,
      bottom: "fl",
      topOpenClose: null,
      bottomOpenClose: null,
      topHalved: false,
      bottomHalved: false,
    });
  });

  it("parses 3-part direction-prefixed tuple", () => {
    expect(parseTurnsTuple("(s, 1, 2)")).toEqual({
      direction: "s",
      top: 1,
      bottom: 2,
      topOpenClose: null,
      bottomOpenClose: null,
      topHalved: false,
      bottomHalved: false,
    });
  });

  it("parses 3-part rotation-direction-prefixed tuple", () => {
    expect(parseTurnsTuple("(cw, 0, 1)")).toEqual({
      direction: "cw",
      top: 0,
      bottom: 1,
      topOpenClose: null,
      bottomOpenClose: null,
      topHalved: false,
      bottomHalved: false,
    });
  });

  it("parses 3-part single-hand op/cl with bottom-only rotation", () => {
    expect(parseTurnsTuple("(0, 1, op)")).toEqual({
      direction: null,
      top: 0,
      bottom: 1,
      topOpenClose: null,
      bottomOpenClose: "op",
      topHalved: false,
      bottomHalved: false,
    });
  });

  it("parses 3-part single-hand op/cl with top-only rotation", () => {
    expect(parseTurnsTuple("(1, 0, cl)")).toEqual({
      direction: null,
      top: 1,
      bottom: 0,
      topOpenClose: "cl",
      bottomOpenClose: null,
      topHalved: false,
      bottomHalved: false,
    });
  });

  it("parses 5-part both-hands op/cl", () => {
    expect(parseTurnsTuple("(s, 1, 1, op, cl)")).toEqual({
      direction: "s",
      top: 1,
      bottom: 1,
      topOpenClose: "op",
      bottomOpenClose: "cl",
      topHalved: false,
      bottomHalved: false,
    });
  });

  it("parses 5-part opposite-direction with mixed op/cl", () => {
    expect(parseTurnsTuple("(o, 0.5, 1, cl, op)")).toEqual({
      direction: "o",
      top: 0.5,
      bottom: 1,
      topOpenClose: "cl",
      bottomOpenClose: "op",
      topHalved: false,
      bottomHalved: false,
    });
  });

  it("ignores unknown tokens in op/cl slots", () => {
    const out = parseTurnsTuple("(s, 1, 1, xx, yy)");
    expect(out.topOpenClose).toBeNull();
    expect(out.bottomOpenClose).toBeNull();
  });
});

describe("parseTurnsTuple — roundtrip with TurnsTupleGenerator", () => {
  const generator = new TurnsTupleGenerator();

  function makePictograph(
    letter: string,
    left: Parameters<typeof createMotionData>[0],
    right: Parameters<typeof createMotionData>[0]
  ): PictographData {
    return {
      id: `test-${letter}`,
      letter: letter as Letter,
      motions: {
        [HandSide.LEFT]: createMotionData({
          ...left,
          hand: HandSide.LEFT,
        }),
        [HandSide.RIGHT]: createMotionData({
          ...right,
          hand: HandSide.RIGHT,
        }),
      },
    };
  }

  it("Λ with static-only rotation roundtrips op/cl", () => {
    const pictograph = makePictograph(
      "Λ",
      {
        motionType: MotionType.DASH,
        turns: 0,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.SOUTH,
        rotationDirection: RotationDirection.NO_ROTATION,
      },
      {
        motionType: MotionType.STATIC,
        turns: 1,
        startLocation: GridLocation.EAST,
        endLocation: GridLocation.EAST,
        rotationDirection: RotationDirection.CLOCKWISE,
      }
    );
    const raw = generator.generateTurnsTuple(pictograph);
    const parsed = parseTurnsTuple(raw);

    expect(parsed.top).toBe(0);
    expect(parsed.bottom).toBe(1);
    expect(parsed.topOpenClose).toBeNull();
    expect(parsed.bottomOpenClose).not.toBeNull();
  });

  it("Λ with dash-only rotation roundtrips op/cl", () => {
    const pictograph = makePictograph(
      "Λ",
      {
        motionType: MotionType.DASH,
        turns: 1,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.SOUTH,
        rotationDirection: RotationDirection.CLOCKWISE,
      },
      {
        motionType: MotionType.STATIC,
        turns: 0,
        startLocation: GridLocation.EAST,
        endLocation: GridLocation.EAST,
        rotationDirection: RotationDirection.NO_ROTATION,
      }
    );
    const raw = generator.generateTurnsTuple(pictograph);
    const parsed = parseTurnsTuple(raw);

    expect(parsed.top).toBe(1);
    expect(parsed.bottom).toBe(0);
    expect(parsed.topOpenClose).not.toBeNull();
    expect(parsed.bottomOpenClose).toBeNull();
  });

  it("Λ- with both hands rotating roundtrips both op/cl slots", () => {
    const pictograph = makePictograph(
      "Λ-",
      {
        motionType: MotionType.DASH,
        turns: 1,
        startLocation: GridLocation.EAST,
        endLocation: GridLocation.WEST,
        rotationDirection: RotationDirection.CLOCKWISE,
      },
      {
        motionType: MotionType.DASH,
        turns: 1,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.SOUTH,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
      }
    );
    const raw = generator.generateTurnsTuple(pictograph);
    const parsed = parseTurnsTuple(raw);

    expect(parsed.direction).toBe("o");
    expect(parsed.top).toBe(1);
    expect(parsed.bottom).toBe(1);
    expect(parsed.topOpenClose).not.toBeNull();
    expect(parsed.bottomOpenClose).not.toBeNull();
  });

  it("γ with both hands rotating roundtrips both op/cl slots", () => {
    const pictograph = makePictograph(
      "γ",
      {
        motionType: MotionType.STATIC,
        turns: 1,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.NORTH,
        rotationDirection: RotationDirection.CLOCKWISE,
      },
      {
        motionType: MotionType.STATIC,
        turns: 1,
        startLocation: GridLocation.EAST,
        endLocation: GridLocation.EAST,
        rotationDirection: RotationDirection.CLOCKWISE,
      }
    );
    const raw = generator.generateTurnsTuple(pictograph);
    const parsed = parseTurnsTuple(raw);

    expect(parsed.direction).toBe("s");
    expect(parsed.top).toBe(1);
    expect(parsed.bottom).toBe(1);
    expect(parsed.topOpenClose).not.toBeNull();
    expect(parsed.bottomOpenClose).not.toBeNull();
  });
});
