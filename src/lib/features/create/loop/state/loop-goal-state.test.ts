import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { describe, expect, it } from "vitest";
import { sequenceKey, stepIdsKey } from "./loop-goal-state.svelte";

function step(letter: string, leftTurns: number, duration = 1) {
  return {
    id: `step-${letter}`,
    letter,
    duration,
    motions: {
      left: { turns: leftTurns, startOrientation: "in" },
      right: { turns: 0, startOrientation: "in" },
    },
  };
}

function sequence(...steps: ReturnType<typeof step>[]): SequenceData {
  return {
    startPlacement: { endPlacement: "alpha1" },
    steps,
  } as unknown as SequenceData;
}

describe("sequenceKey", () => {
  // A LOOP whose turns were changed by hand is not swapped out from under the
  // person when they pick another kind: it has to count as edited.
  it("changes when a step's turns change", () => {
    expect(sequenceKey(sequence(step("A", 0)))).not.toBe(
      sequenceKey(sequence(step("A", 1)))
    );
  });

  it("changes when a step is held longer", () => {
    expect(sequenceKey(sequence(step("A", 0)))).not.toBe(
      sequenceKey(sequence(step("A", 0, 2)))
    );
  });

  it("is the same for the same steps", () => {
    expect(sequenceKey(sequence(step("A", 0), step("B", 1)))).toBe(
      sequenceKey(sequence(step("A", 0), step("B", 1)))
    );
  });

  it("changes when a step is added", () => {
    expect(sequenceKey(sequence(step("A", 0)))).not.toBe(
      sequenceKey(sequence(step("A", 0), step("B", 0)))
    );
  });
});

describe("stepIdsKey", () => {
  // Turning a prop in a made LOOP must not send the person back to building.
  it("stays the same when a turn or a duration changes", () => {
    expect(stepIdsKey(sequence(step("A", 0), step("B", 0)))).toBe(
      stepIdsKey(sequence(step("A", 2), step("B", 0, 3)))
    );
  });

  it("changes when a step is taken away or moved", () => {
    const both = stepIdsKey(sequence(step("A", 0), step("B", 0)));
    expect(stepIdsKey(sequence(step("A", 0)))).not.toBe(both);
    expect(stepIdsKey(sequence(step("B", 0), step("A", 0)))).not.toBe(both);
  });

  it("is empty without steps, so no empty grid counts as a LOOP", () => {
    expect(stepIdsKey(sequence())).toBe("");
    expect(stepIdsKey(null)).toBe("");
  });
});
