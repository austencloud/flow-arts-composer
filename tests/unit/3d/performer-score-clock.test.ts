import { describe, expect, it } from "vitest";
import { performerScoreClock } from "#lib/shared/3d/domain/performer-score-clock.js";

// A sequence with a static start pose plays it as step 0, so beat 1 is step
// `motionStepOffset`. The raw score clock already runs 0 to 1 across it.
describe("performer score clock", () => {
  it("holds where beat 1 starts while the start pose plays", () => {
    expect(
      performerScoreClock({
        currentStepIndex: 0,
        motionStepOffset: 1,
        scoreTime: 0.6,
      })
    ).toBe(0);
  });

  it("reads the score from beat 1 on", () => {
    expect(
      performerScoreClock({
        currentStepIndex: 1,
        motionStepOffset: 1,
        scoreTime: 0.6,
      })
    ).toBe(0.6);
    expect(
      performerScoreClock({
        currentStepIndex: 7,
        motionStepOffset: 1,
        scoreTime: 6.25,
      })
    ).toBe(6.25);
  });

  it("reads the score throughout a sequence without a start pose", () => {
    expect(
      performerScoreClock({
        currentStepIndex: 0,
        motionStepOffset: 0,
        scoreTime: 0.6,
      })
    ).toBe(0.6);
  });
});
