import { describe, expect, it } from "vitest";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  getSequenceMotionProfile,
  getSequenceMotionVisibility,
} from "#lib/shared/foundation/services/sequence-motion-profile.js";

function step(left: boolean, right: boolean) {
  return createStepData({
    motions: {
      ...(left && {
        left: createMotionData({ hand: HandSide.LEFT }),
      }),
      ...(right && {
        right: createMotionData({ hand: HandSide.RIGHT }),
      }),
    },
  });
}

describe("getSequenceMotionProfile", () => {
  it("ignores invisible placeholders and classifies left-only choreography", () => {
    expect(getSequenceMotionProfile({ steps: [step(true, false)] })).toEqual({
      kind: "solo",
      hand: HandSide.LEFT,
      authoredHand: "left",
    });
  });

  it("classifies right-only choreography", () => {
    expect(getSequenceMotionProfile({ steps: [step(false, true)] })).toEqual({
      kind: "solo",
      hand: HandSide.RIGHT,
      authoredHand: "right",
    });
  });

  it("derives the same participating-hand visibility used by warming and the viewer", () => {
    expect(getSequenceMotionVisibility({ steps: [step(true, false)] })).toEqual(
      { showLeftMotion: true, showRightMotion: false }
    );
    expect(getSequenceMotionVisibility({ steps: [step(false, true)] })).toEqual(
      { showLeftMotion: false, showRightMotion: true }
    );
    expect(getSequenceMotionVisibility({ steps: [step(true, true)] })).toEqual({
      showLeftMotion: true,
      showRightMotion: true,
    });
  });

  it("classifies fully paired choreography", () => {
    expect(
      getSequenceMotionProfile({
        steps: [step(true, true), step(true, true)],
      })
    ).toEqual({ kind: "paired" });
  });

  it("classifies alternating or partly paired choreography as mixed", () => {
    expect(
      getSequenceMotionProfile({
        steps: [step(true, false), step(false, true)],
      })
    ).toEqual({ kind: "mixed" });
    expect(
      getSequenceMotionProfile({
        steps: [step(true, true), step(true, false)],
      })
    ).toEqual({ kind: "mixed" });
  });

  it("ignores fully blank beats", () => {
    expect(
      getSequenceMotionProfile({
        steps: [step(false, false), step(true, false)],
      })
    ).toMatchObject({ kind: "solo", hand: HandSide.LEFT });
    expect(getSequenceMotionProfile({ steps: [step(false, false)] })).toEqual({
      kind: "empty",
    });
  });
});
