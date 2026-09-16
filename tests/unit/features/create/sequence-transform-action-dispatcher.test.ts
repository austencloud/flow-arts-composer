import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  createSequenceTransformActionDispatcher,
  type SequenceTransformActionState,
} from "$lib/features/create/shared/services/sequence-transform-action-dispatcher";
import { UndoOperationType } from "$lib/features/create/shared/services/undo-manager";

const analytics = vi.hoisted(() => ({
  invoked: vi.fn(),
  result: vi.fn(),
}));

vi.mock("$lib/shared/create/analytics/sequence-action-events", () => ({
  logSequenceActionInvoked: analytics.invoked,
  logSequenceActionResult: analytics.result,
}));

function sequence(): SequenceData {
  return {
    id: "test-sequence",
    name: "Test",
    word: "AB",
    steps: [{}, {}],
    startPlacement: {},
  } as SequenceData;
}

function state(): SequenceTransformActionState {
  return {
    currentSequence: sequence(),
    mirrorSequence: vi.fn().mockResolvedValue(undefined),
    flipSequence: vi.fn().mockResolvedValue(undefined),
    swapHands: vi.fn().mockResolvedValue(undefined),
    invertSequence: vi.fn().mockResolvedValue(undefined),
    rewindSequence: vi.fn().mockResolvedValue(undefined),
    rotateSequence: vi.fn().mockResolvedValue(undefined),
    shiftStartPlacement: vi.fn().mockResolvedValue(undefined),
  };
}

function setup(activeState: SequenceTransformActionState | null = state()) {
  const pushUndoSnapshot = vi.fn();
  const setGridRotationDirection = vi.fn();
  const hapticService = { trigger: vi.fn() };
  const dispatcher = createSequenceTransformActionDispatcher({
    getSequenceState: () => activeState,
    getCreateMode: () => "construct",
    pushUndoSnapshot,
    hapticService,
    setGridRotationDirection,
  });

  return {
    activeState,
    dispatcher,
    pushUndoSnapshot,
    setGridRotationDirection,
    hapticService,
  };
}

describe("createSequenceTransformActionDispatcher", () => {
  beforeEach(() => {
    analytics.invoked.mockReset();
    analytics.result.mockReset();
  });

  it("routes a header transform through Undo, both-hand targeting, and analytics", async () => {
    const { activeState, dispatcher, pushUndoSnapshot, hapticService } =
      setup();

    await expect(
      dispatcher.execute("mirror", {
        source: "header",
        targetHand: "both",
      })
    ).resolves.toEqual({ status: "completed" });

    expect(pushUndoSnapshot).toHaveBeenCalledWith(
      UndoOperationType.MIRROR_SEQUENCE
    );
    expect(activeState?.mirrorSequence).toHaveBeenCalledWith("both");
    expect(hapticService.trigger).toHaveBeenCalledWith("selection");
    expect(analytics.invoked).toHaveBeenCalledWith({
      action: "mirror",
      source: "header",
      targetHand: "both",
      createMode: "construct",
      stepCount: 2,
      hasStartPlacement: true,
    });
    expect(analytics.result).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "mirror",
        source: "header",
        outcome: "completed",
      })
    );
  });

  it("preserves panel hand targeting and rotation direction", async () => {
    const { activeState, dispatcher, setGridRotationDirection } = setup();

    await dispatcher.execute("rotate_counterclockwise", {
      source: "panel",
      targetHand: "left",
    });

    expect(setGridRotationDirection).toHaveBeenCalledWith(-1);
    expect(activeState?.rotateSequence).toHaveBeenCalledWith(
      "counterclockwise",
      "left"
    );
    expect(analytics.invoked).toHaveBeenCalledWith(
      expect.objectContaining({ source: "panel", targetHand: "left" })
    );
  });

  it("records a busy result instead of applying two transforms at once", async () => {
    let release!: () => void;
    const activeState = state();
    vi.mocked(activeState.mirrorSequence).mockImplementation(
      () => new Promise<void>((resolve) => (release = resolve))
    );
    const { dispatcher, pushUndoSnapshot } = setup(activeState);

    const first = dispatcher.execute("mirror", {
      source: "keyboard",
      targetHand: "both",
    });
    await Promise.resolve();
    const second = await dispatcher.execute("flip", {
      source: "header",
      targetHand: "both",
    });

    expect(second).toEqual({ status: "busy" });
    expect(pushUndoSnapshot).toHaveBeenCalledTimes(1);
    expect(analytics.result).toHaveBeenCalledWith(
      expect.objectContaining({ action: "flip", outcome: "busy" })
    );

    release();
    await first;
  });

  it("records a failed transform without letting analytics break the workspace", async () => {
    const activeState = state();
    vi.mocked(activeState.invertSequence).mockRejectedValue(
      new TypeError("bad transform")
    );
    const { dispatcher, hapticService } = setup(activeState);

    await expect(
      dispatcher.execute("invert", {
        source: "keyboard",
        targetHand: "both",
      })
    ).resolves.toEqual({ status: "failed", message: "bad transform" });

    expect(hapticService.trigger).toHaveBeenCalledWith("error");
    expect(analytics.result).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "invert",
        source: "keyboard",
        outcome: "failed",
        errorName: "TypeError",
      })
    );
  });

  it("routes the Shift Start shortcut through the same Undo path", async () => {
    const { activeState, dispatcher, pushUndoSnapshot } = setup();

    await dispatcher.execute("shift_start", {
      source: "keyboard",
      targetHand: "both",
      stepNumber: 2,
    });

    expect(pushUndoSnapshot).toHaveBeenCalledWith(
      UndoOperationType.SHIFT_START
    );
    expect(activeState?.shiftStartPlacement).toHaveBeenCalledWith(2);
  });
});
