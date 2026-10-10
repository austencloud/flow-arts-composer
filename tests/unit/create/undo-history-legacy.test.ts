import { describe, expect, it } from "vitest";
import {
  UndoOperationType,
  normalizeUndoHistoryEntries,
} from "#lib/features/create/shared/services/undo-manager.js";

describe("Create undo history compatibility", () => {
  it("restores literal blue/red motions in both history snapshots", async () => {
    const legacySequence = {
      steps: [
        {
          motions: {
            blue: { color: "blue", motionType: "pro" },
            red: { color: "red", motionType: "anti" },
          },
        },
      ],
    };
    const [entry] = normalizeUndoHistoryEntries([
      {
        id: "legacy-entry",
        type: UndoOperationType.UPDATE_BEAT,
        timestamp: 1,
        beforeState: {
          sequence: legacySequence,
          selectedStepNumber: 1,
          activeSection: "construct",
          timestamp: 1,
        },
        afterState: {
          sequence: legacySequence,
          selectedStepNumber: 1,
          activeSection: "construct",
          timestamp: 2,
        },
      },
    ]);

    expect(entry?.beforeState.sequence?.steps[0]?.motions).toMatchObject({
      left: { hand: "left" },
      right: { hand: "right" },
    });
    expect(entry?.afterState?.sequence?.steps[0]?.motions).toMatchObject({
      left: { hand: "left" },
      right: { hand: "right" },
    });
  });
});
