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
  const result: SequenceTransformActionState = {
    currentSequence: sequence(),
    mirrorSequence: vi.fn(),
    flipSequence: vi.fn(),
    swapHands: vi.fn(),
    invertSequence: vi.fn(),
    rewindSequence: vi.fn(),
    rotateSequence: vi.fn(),
    shiftStartPlacement: vi.fn(),
  };
  for (const method of [
    "mirrorSequence",
    "flipSequence",
    "swapHands",
    "invertSequence",
    "rewindSequence",
    "rotateSequence",
    "shiftStartPlacement",
  ] as const) {
    vi.mocked(result[method]).mockImplementation(async () => {
      result.currentSequence = { ...result.currentSequence!, word: method };
    });
  }
  return result;
}

function setup(activeState: SequenceTransformActionState | null = state()) {
  const commitSnapshot = vi.fn();
  const beginUndoSnapshot = vi.fn(() => commitSnapshot);
  const setGridRotationDirection = vi.fn();
  const hapticService = { trigger: vi.fn() };
  const dispatcher = createSequenceTransformActionDispatcher({
    getSequenceState: () => activeState,
    getCreateMode: () => "construct",
    beginUndoSnapshot,
    hapticService,
    setGridRotationDirection,
  });

  return {
    activeState,
    dispatcher,
    beginUndoSnapshot,
    commitSnapshot,
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
    const {
      activeState,
      dispatcher,
      beginUndoSnapshot,
      commitSnapshot,
      hapticService,
    } = setup();

    await expect(
      dispatcher.execute("mirror", {
        source: "header",
        targetHand: "both",
      })
    ).resolves.toEqual({ status: "completed" });

    expect(beginUndoSnapshot).toHaveBeenCalledWith(
      UndoOperationType.MIRROR_SEQUENCE,
      activeState
    );
    expect(commitSnapshot).toHaveBeenCalledTimes(1);
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
    const { dispatcher, beginUndoSnapshot, commitSnapshot } =
      setup(activeState);

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
    expect(beginUndoSnapshot).toHaveBeenCalledTimes(1);
    expect(analytics.result).toHaveBeenCalledWith(
      expect.objectContaining({ action: "flip", outcome: "busy" })
    );

    release();
    await first;
    expect(commitSnapshot).not.toHaveBeenCalled();
  });

  it("records a failed transform without letting analytics break the workspace", async () => {
    const activeState = state();
    vi.mocked(activeState.invertSequence).mockRejectedValue(
      new TypeError("bad transform")
    );
    const { dispatcher, hapticService, commitSnapshot } = setup(activeState);

    await expect(
      dispatcher.execute("invert", {
        source: "keyboard",
        targetHand: "both",
      })
    ).resolves.toEqual({ status: "failed", message: "bad transform" });

    expect(hapticService.trigger).toHaveBeenCalledWith("error");
    expect(commitSnapshot).not.toHaveBeenCalled();
    expect(analytics.result).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "invert",
        source: "keyboard",
        outcome: "failed",
        errorName: "TypeError",
      })
    );
  });

  it("leaves history untouched when a transform resolves without changing the sequence", async () => {
    const activeState = state();
    vi.mocked(activeState.flipSequence).mockResolvedValue(undefined);
    const { dispatcher, commitSnapshot } = setup(activeState);

    await expect(
      dispatcher.execute("flip", {
        source: "header",
        targetHand: "both",
      })
    ).resolves.toEqual({ status: "completed" });

    expect(commitSnapshot).not.toHaveBeenCalled();
  });

  it("records a partial change even if the transform later fails", async () => {
    const activeState = state();
    vi.mocked(activeState.flipSequence).mockImplementation(async () => {
      activeState.currentSequence = {
        ...activeState.currentSequence!,
        word: "changed",
      };
      throw new Error("save failed");
    });
    const { dispatcher, commitSnapshot } = setup(activeState);

    await expect(
      dispatcher.execute("flip", {
        source: "header",
        targetHand: "both",
      })
    ).resolves.toEqual({ status: "failed", message: "save failed" });

    expect(commitSnapshot).toHaveBeenCalledTimes(1);
  });

  it("commits to the initiating state after navigation changes", async () => {
    const firstState = state();
    const otherState = state();
    let activeState = firstState;
    let release!: () => void;
    vi.mocked(firstState.mirrorSequence).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = () => {
            firstState.currentSequence = {
              ...firstState.currentSequence!,
              word: "changed",
            };
            resolve();
          };
        })
    );
    const commitSnapshot = vi.fn();
    const beginUndoSnapshot = vi.fn(() => commitSnapshot);
    const dispatcher = createSequenceTransformActionDispatcher({
      getSequenceState: () => activeState,
      getCreateMode: () => "construct",
      beginUndoSnapshot,
      hapticService: null,
      setGridRotationDirection: vi.fn(),
    });

    const pending = dispatcher.execute("mirror", {
      source: "header",
      targetHand: "both",
    });
    activeState = otherState;
    release();
    await pending;

    expect(beginUndoSnapshot).toHaveBeenCalledWith(
      UndoOperationType.MIRROR_SEQUENCE,
      firstState
    );
    expect(commitSnapshot).toHaveBeenCalledTimes(1);
    expect(otherState.currentSequence?.word).toBe("AB");
  });

  it("routes the Shift Start shortcut through the same Undo path", async () => {
    const { activeState, dispatcher, beginUndoSnapshot, commitSnapshot } =
      setup();

    await dispatcher.execute("shift_start", {
      source: "keyboard",
      targetHand: "both",
      stepNumber: 2,
    });

    expect(beginUndoSnapshot).toHaveBeenCalledWith(
      UndoOperationType.SHIFT_START,
      activeState
    );
    expect(commitSnapshot).toHaveBeenCalledTimes(1);
    expect(activeState?.shiftStartPlacement).toHaveBeenCalledWith(2);
  });
});
