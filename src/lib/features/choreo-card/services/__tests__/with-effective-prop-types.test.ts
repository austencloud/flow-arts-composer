import { describe, it, expect } from "vitest";
import { withEffectivePropTypes } from "../with-effective-prop-types";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

function makeStep(): StepData {
  return {
    id: "s1",
    letter: "A",
    stepNumber: 1,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    motions: {
      [HandSide.LEFT]: {
        motionType: "pro",
        rotationDirection: "cw",
        propType: "staff",
      } as never,
      [HandSide.RIGHT]: {
        motionType: "anti",
        rotationDirection: "ccw",
        propType: "staff",
      } as never,
    },
  } as unknown as StepData;
}

describe("withEffectivePropTypes", () => {
  it("sets left and right motion propType to the effective prop types", () => {
    const out = withEffectivePropTypes(makeStep(), PropType.FAN, PropType.CLUB);
    expect(out.motions?.[HandSide.LEFT]?.propType).toBe(PropType.FAN);
    expect(out.motions?.[HandSide.RIGHT]?.propType).toBe(PropType.CLUB);
  });

  it("does not mutate the input step", () => {
    const input = makeStep();
    withEffectivePropTypes(input, PropType.FAN, PropType.FAN);
    expect(input.motions?.[HandSide.LEFT]?.propType).toBe("staff");
  });

  it("returns the step unchanged when a motion is missing", () => {
    const step = { ...makeStep(), motions: {} as never } as StepData;
    const out = withEffectivePropTypes(step, PropType.FAN, PropType.FAN);
    expect(out.motions).toEqual({});
  });
});
