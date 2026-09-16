import { describe, it, expect } from "vitest";
import {
  encodeSequenceForQR,
  decodeSequenceFromQR,
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

function step(stepNumber: number, left: unknown, right: unknown) {
  return {
    stepNumber, duration: 1, leftReversal: false, rightReversal: false, isBlank: false,
    motions: { left, right },
    id: `s${stepNumber}`, letter: null, startPlacement: null, endPlacement: null,
  };
}

describe("QR round-trip preserves derived endOrientation", () => {
  it("encodeSequenceForQR -> decodeSequenceFromQR preserves derived endOrientation", async () => {
    // Consistent chain: STATIC start position (in/in), then one step.
    const spLeft = motion({ motionType: MotionType.STATIC, startLocation: GridLocation.NORTH, endLocation: GridLocation.NORTH, rotationDirection: RotationDirection.NO_ROTATION, startOrientation: Orientation.IN, endOrientation: Orientation.IN });
    const spRight = motion({ motionType: MotionType.STATIC, startLocation: GridLocation.SOUTH, endLocation: GridLocation.SOUTH, rotationDirection: RotationDirection.NO_ROTATION, startOrientation: Orientation.IN, endOrientation: Orientation.IN });
    // blue: n->e cw orbit + ccw rot => anti, anti 0 switches in->out
    const s1Left = motion({ turns: 0, rotationDirection: RotationDirection.COUNTER_CLOCKWISE, startLocation: GridLocation.NORTH, endLocation: GridLocation.EAST, startOrientation: Orientation.IN, endOrientation: Orientation.OUT });
    // red: s->w cw orbit + cw rot => pro, pro 0 preserves in->in
    const s1Right = motion({ turns: 0, rotationDirection: RotationDirection.CLOCKWISE, startLocation: GridLocation.SOUTH, endLocation: GridLocation.WEST, startOrientation: Orientation.IN, endOrientation: Orientation.IN });

    const original = {
      id: "x", name: "", word: "", steps: [
        step(0, spLeft, spRight),
        step(1, s1Left, s1Right),
      ],
      thumbnails: [], isFavorite: false, isCircular: false, tags: [], metadata: {}, sequenceLength: 1,
    } as never;

    const qr = await encodeSequenceForQR(original);
    expect(qr.startsWith("s~")).toBe(true);

    const back = await decodeSequenceFromQR(qr);
    // Start position (stepNumber 0) lands on startPlacement; the lone real step at steps[0].
    expect(back.steps.length).toBe(1);
    expect(back.steps[0]!.motions.left!.endOrientation).toBe(Orientation.OUT); // anti 0 switches
    expect(back.steps[0]!.motions.right!.endOrientation).toBe(Orientation.IN); // pro 0 preserves
  });
});
