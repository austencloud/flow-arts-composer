import { describe, expect, it } from "vitest";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  HandSide,
  Orientation,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  createHistoryTransitionPlan,
  createStableStepIdentities,
} from "$lib/features/create/shared/services/history-transition-planner";
import { UndoOperationType } from "$lib/features/create/shared/services/undo-manager";

function step(id: string, stepNumber: number) {
  return createStepData({ id, stepNumber });
}

function sequence(steps: ReturnType<typeof step>[]): SequenceData {
  return {
    id: "sequence",
    name: "Sequence",
    word: "",
    steps,
  } as SequenceData;
}

function plan(
  fromSequence: SequenceData | null,
  toSequence: SequenceData | null,
  operation = UndoOperationType.UPDATE_BEAT
) {
  return createHistoryTransitionPlan({
    direction: "undo",
    operation,
    label: "History change",
    fromSequence,
    toSequence,
    fromSelectedStepNumber: 2,
    toSelectedStepNumber: 1,
  });
}

describe("history transition planner", () => {
  it("keeps canonical step identity while steps reorder", () => {
    const first = step("first", 1);
    const second = step("second", 2);
    const result = plan(
      sequence([first, second]),
      sequence([
        createStepData({ ...second, stepNumber: 1 }),
        createStepData({ ...first, stepNumber: 2 }),
      ]),
      UndoOperationType.REWIND_SEQUENCE
    );

    expect(result.movedStepIdentities).toEqual(
      new Set(["step:first", "step:second"])
    );
    expect(result.removedStepIdentities.size).toBe(0);
    expect(result.insertedStepIdentities.size).toBe(0);
    expect(result.kind).toBe("mixed");
  });

  it("separates inserted, removed, and retained steps", () => {
    const first = step("first", 1);
    const second = step("second", 2);
    const third = step("third", 3);
    const result = plan(
      sequence([first, second]),
      sequence([first, third, createStepData({ ...second, stepNumber: 3 })])
    );

    expect(result.insertedStepIdentities).toEqual(new Set(["step:third"]));
    expect(result.movedStepIdentities).toEqual(new Set(["step:second"]));
    expect(result.removedStepIdentities.size).toBe(0);
  });

  it("classifies prop, arrow, notation, and duration consequences", () => {
    const original = createStepData({
      id: "changed",
      stepNumber: 1,
      letter: "A",
      duration: 1,
    });
    const changed = createStepData({
      ...original,
      letter: "B",
      duration: 2,
      motions: {
        ...original.motions,
        [HandSide.LEFT]: createMotionData({
          ...original.motions.left,
          hand: HandSide.LEFT,
          endOrientation: Orientation.OUT,
        }),
      },
    });
    const result = plan(sequence([original]), sequence([changed]));
    const changes = result.steps[0]!.changes;

    expect(changes).toEqual(new Set(["duration", "notation", "prop", "arrow"]));
    expect(result.changedStepIdentities).toEqual(new Set(["step:changed"]));
    expect(result.kind).toBe("content");
  });

  it("classifies blank-state and pictograph-placement consequences", () => {
    const original = createStepData({
      id: "visibility",
      stepNumber: 1,
      isBlank: false,
    });
    const changed = createStepData({
      ...original,
      isBlank: true,
      startPlacement: "alpha1",
    });

    const result = plan(sequence([original]), sequence([changed]));

    expect([...result.steps[0]!.changes]).toEqual(
      expect.arrayContaining(["grid", "visibility"])
    );
  });

  it("treats unrelated non-empty sequences as a coordinated replacement", () => {
    const result = plan(
      sequence([step("old-1", 1), step("old-2", 2)]),
      sequence([step("new-1", 1), step("new-2", 2)]),
      UndoOperationType.GENERATE_SEQUENCE
    );

    expect(result.kind).toBe("replacement");
    expect(result.removedStepIdentities.size).toBe(2);
    expect(result.insertedStepIdentities.size).toBe(2);
  });

  it("produces unique deterministic keys for duplicate and missing legacy IDs", () => {
    const duplicateA = step("duplicate", 1);
    const duplicateB = step("duplicate", 2);
    const missingA = createStepData({ id: "", stepNumber: 3, letter: "A" });
    const missingB = createStepData({ id: "", stepNumber: 4, letter: "A" });

    const identities = createStableStepIdentities([
      duplicateA,
      duplicateB,
      missingA,
      missingB,
    ]);

    expect(new Set(identities).size).toBe(4);
    expect(identities).toEqual(
      createStableStepIdentities([duplicateA, duplicateB, missingA, missingB])
    );
  });

  it.each(Object.values(UndoOperationType))(
    "carries operation %s without coupling motion to the enum",
    (operation) => {
      const result = plan(sequence([step("one", 1)]), null, operation);

      expect(result.operation).toBe(operation);
      expect(result.removedStepIdentities).toEqual(new Set(["step:one"]));
    }
  );
});
