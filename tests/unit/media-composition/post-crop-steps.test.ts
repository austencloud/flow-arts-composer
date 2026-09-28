import { describe, expect, it } from "vitest";
import {
  createTakeTiming,
  resolveTakeTiming,
  type TakeTiming,
} from "$lib/shared/media-composition/domain/take-timing";
import {
  adjacentStepSeconds,
  clipSteps,
} from "$lib/shared/share/components/post-studio/editor/post-crop-steps";
import { video } from "./post-project-fixtures";

/** Four one-beat moves at 60 BPM with move 1 landing at 2 s of the take. */
const MOVE_BEATS = [1, 1, 1, 1];

function timed(): TakeTiming {
  const timing = createTakeTiming({
    sequenceId: "seq",
    takeKey: "take",
    durationSeconds: 20,
    bpm: 60,
    now: 0,
  });
  return {
    ...timing,
    sections: [{ ...timing.sections[0]!, tempo: "locked", beatOneSeconds: 2 }],
  };
}

describe("clipSteps", () => {
  it("has none for a take nobody tapped", () => {
    const item = video("v", { sourceOut: 20 });
    expect(clipSteps(item, null, null)).toEqual([]);
  });

  it("puts each landing on the clip's clock and counts it like the Timing tool", () => {
    const timing = timed();
    const resolved = resolveTakeTiming(timing, MOVE_BEATS);
    // The clip starts 3 s into the post, shows take seconds 4 to 12, twice as fast.
    const item = video("v", { start: 3, sourceIn: 4, sourceOut: 12, speed: 2 });
    const steps = clipSteps(item, timing, resolved);
    const landings = resolved.sections[0]!.landings.filter(
      (landing) => landing.seconds >= 4 - 1e-6 && landing.seconds <= 12 + 1e-6
    );
    expect(steps.map((step) => step.position)).toEqual(
      landings.map((landing) => landing.position)
    );
    for (const [index, step] of steps.entries()) {
      const landing = landings[index]!;
      expect(step.seconds).toBeCloseTo(3 + (landing.seconds - 4) / 2, 9);
      expect(step.label).toBe(String(((landing.position - 1) % 4) + 1));
      expect(step.stepIndex).toBe((landing.position - 1) % 4);
      expect(step.passStart).toBe((landing.position - 1) % 4 === 0);
    }
    expect(steps.length).toBeGreaterThan(4);
    expect(
      steps.every(
        (step, index) => index === 0 || step.seconds > steps[index - 1]!.seconds
      )
    ).toBe(true);
  });

  it("names the opening pose S", () => {
    const timing = timed();
    const resolved = resolveTakeTiming(timing, MOVE_BEATS);
    const item = video("v", { sourceOut: 20 });
    const opening = clipSteps(item, timing, resolved).find(
      (step) => step.position === 0
    );
    expect(opening?.label).toBe("S");
    expect(opening?.stepIndex).toBeNull();
    expect(opening?.passStart).toBe(false);
  });
});

describe("adjacentStepSeconds", () => {
  const steps = [1, 2, 3].map((seconds, index) => ({
    seconds,
    position: index + 1,
    stepIndex: index,
    label: String(index + 1),
    passStart: index === 0,
  }));

  it("steps past the one the playhead sits on", () => {
    expect(adjacentStepSeconds(steps, 2, "next")).toBe(3);
    expect(adjacentStepSeconds(steps, 2, "previous")).toBe(1);
    expect(adjacentStepSeconds(steps, 1.5, "next")).toBe(2);
    expect(adjacentStepSeconds(steps, 1.5, "previous")).toBe(1);
  });

  it("stops at either end", () => {
    expect(adjacentStepSeconds(steps, 3, "next")).toBeNull();
    expect(adjacentStepSeconds(steps, 1, "previous")).toBeNull();
    expect(adjacentStepSeconds([], 1, "next")).toBeNull();
  });
});
