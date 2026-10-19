import { describe, expect, it, vi } from "vitest";
import { createReviewTransformActions } from "../../../src/routes/test/sequence-actions/_components/review-transform-actions.js";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { SequenceTransformActionState } from "#lib/features/create/shared/services/sequence-transform-action-dispatcher.js";

vi.mock("#lib/shared/create/analytics/sequence-action-events.js", () => ({
  logSequenceActionInvoked: vi.fn(),
  logSequenceActionResult: vi.fn(),
}));

describe("sequence actions review dispatcher", () => {
  it("executes transforms and can finish a changed sequence without an undo history", async () => {
    const state: SequenceTransformActionState = {
      currentSequence: createSequenceData({ id: "before" }),
      mirrorSequence: vi.fn(async () => {
        state.currentSequence = createSequenceData({ id: "after" });
      }),
      flipSequence: vi.fn(async () => {}),
      swapHands: vi.fn(async () => {}),
      invertSequence: vi.fn(async () => {}),
      rewindSequence: vi.fn(async () => {}),
      rotateSequence: vi.fn(async () => {}),
      shiftStartPlacement: vi.fn(async () => {}),
    };
    const dispatcher = createReviewTransformActions(() => state);

    expect(await dispatcher.execute("mirror", { source: "panel" })).toEqual({
      status: "completed",
    });
    expect(state.mirrorSequence).toHaveBeenCalledWith("both");
    expect(state.currentSequence?.id).toBe("after");

    expect(await dispatcher.execute("swap", { source: "panel" })).toEqual({
      status: "completed",
    });
    expect(state.swapHands).toHaveBeenCalledOnce();
  });
});
