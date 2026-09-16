import { describe, it, expect } from "vitest";
import {
  __test__,
  encodeSequence,
} from "$lib/shared/navigation/services/sequence-encoder";
import {
  MotionType,
  RotationDirection,
  Orientation,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

function motion(over: Record<string, unknown> = {}) {
  return {
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: GridLocation.NORTH,
    endLocation: GridLocation.EAST,
    turns: 0,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    propType: PropType.STAFF,
    ...over,
  } as never;
}

// Whole-turn orientation algebra (rotationDirection irrelevant for integer turns):
//   pro  even -> preserve, pro  odd -> switch
//   anti even -> switch,   anti odd -> preserve
// In the canonical format endOrientation is never stored AND motionType is never
// stored — the decoder derives motionType from the orbit direction vs rotation,
// then derives endOrientation from the irreducible fields plus the chained start
// orientation. For the n->e path the orbit is cw, so cw rotation => pro and ccw
// rotation => anti. The fixtures therefore drive pro/anti via rotationDirection.
const CASES = [
  { name: "pro 0 preserves (in->in)", m: motion({ rotationDirection: RotationDirection.CLOCKWISE, turns: 0 }), expected: Orientation.IN },
  { name: "pro 1 switches (in->out)", m: motion({ rotationDirection: RotationDirection.CLOCKWISE, turns: 1 }), expected: Orientation.OUT },
  { name: "anti 0 switches (in->out)", m: motion({ rotationDirection: RotationDirection.COUNTER_CLOCKWISE, turns: 0 }), expected: Orientation.OUT },
  { name: "anti 1 preserves (in->in)", m: motion({ rotationDirection: RotationDirection.COUNTER_CLOCKWISE, turns: 1 }), expected: Orientation.IN },
];

describe("decodeMotion derives endOrientation (hand-known algebra)", () => {
  for (const c of CASES) {
    it(c.name, () => {
      // No stored endOrientation in the canonical format; the decoder must
      // derive it from the irreducible fields + the seed start orientation.
      const enc = __test__.encodeMotion(c.m);
      const decoded = __test__.decodeMotion(enc, "blue", Orientation.IN, PropType.STAFF);
      expect(decoded!.endOrientation).toBe(c.expected);
    });
  }
});

describe("sequence encoding carries no version sentinel", () => {
  it("encodeSequence does NOT emit a v1/v2/v3 prefix", () => {
    function staticMotion(loc: GridLocation) {
      return motion({
        motionType: MotionType.STATIC,
        startLocation: loc,
        endLocation: loc,
        rotationDirection: RotationDirection.NO_ROTATION,
        turns: 0,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.IN,
      });
    }
    const original = {
      id: "x", name: "", word: "", steps: [
        { stepNumber: 0, duration: 1, leftReversal: false, rightReversal: false, isBlank: false,
          motions: { left: staticMotion(GridLocation.NORTH), right: staticMotion(GridLocation.SOUTH) },
          id: "s0", letter: null, startPlacement: null, endPlacement: null },
        { stepNumber: 1, duration: 1, leftReversal: false, rightReversal: false, isBlank: false,
          motions: {
            left: motion({ startLocation: GridLocation.NORTH, endLocation: GridLocation.EAST, rotationDirection: RotationDirection.CLOCKWISE, turns: 0 }),
            right:  motion({ startLocation: GridLocation.SOUTH, endLocation: GridLocation.WEST, rotationDirection: RotationDirection.CLOCKWISE, turns: 0 }),
          },
          id: "s1", letter: null, startPlacement: null, endPlacement: null },
      ],
      thumbnails: [], isFavorite: false, isCircular: false, tags: [], metadata: {}, sequenceLength: 1,
    } as never;

    const encoded = encodeSequence(original);
    expect(encoded).not.toMatch(/^v[123]\|/);
  });
});
