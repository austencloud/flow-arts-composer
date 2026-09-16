import { describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { UndoOperationType } from "$lib/features/create/shared/services/undo-manager";
import {
  createSequenceActionsOrchestrator,
  type SequenceActionsOrchestratorDeps,
} from "$lib/features/create/shared/services/sequence-actions-orchestrator";

const sequence = { id: "sequence-1", steps: [] } as unknown as SequenceData;
const updatedSequence = {
  id: "sequence-2",
  steps: [],
} as unknown as SequenceData;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createHarness(
  overrides: Partial<SequenceActionsOrchestratorDeps> = {}
) {
  const events: string[] = [];
  let transformBusy = false;
  let extensionBusy = false;

  const sequenceState = {
    currentSequence: sequence as SequenceData | null,
    mirrorSequence: vi.fn(async () => {
      events.push("mirror");
    }),
    swapHands: vi.fn(async () => {
      events.push("swap");
    }),
    rewindSequence: vi.fn(async () => {
      events.push("rewind");
    }),
    flipSequence: vi.fn(async () => {
      events.push("flip");
    }),
    invertSequence: vi.fn(async () => {
      events.push("invert");
    }),
    rotateSequence: vi.fn(async () => {
      events.push("rotate");
    }),
    setCurrentSequence: vi.fn((next: SequenceData) => {
      events.push("set-sequence");
      sequenceState.currentSequence = next;
    }),
    shiftStartPlacement: vi.fn(async () => {
      events.push("shift");
    }),
  };

  const deps: SequenceActionsOrchestratorDeps = {
    getSequenceState: () => sequenceState,
    getTargetHand: () => "both",
    hapticService: {
      trigger: vi.fn((kind: string) => events.push(`haptic:${kind}`)),
    } as SequenceActionsOrchestratorDeps["hapticService"],
    pushUndoSnapshot: vi.fn((type: UndoOperationType) =>
      events.push(`undo:${type}`)
    ),
    executeTransformAction: vi.fn(async (action, options) => {
      events.push(
        `dispatch:${action}:${options.source}:${options.targetHand ?? "both"}`
      );
      try {
        switch (action) {
          case "mirror":
            await sequenceState.mirrorSequence(options.targetHand);
            break;
          case "flip":
            await sequenceState.flipSequence(options.targetHand);
            break;
          case "swap":
            await sequenceState.swapHands();
            break;
          case "invert":
            await sequenceState.invertSequence(options.targetHand);
            break;
          case "rewind":
            await sequenceState.rewindSequence(options.targetHand);
            break;
          case "rotate_clockwise":
            await sequenceState.rotateSequence("clockwise", options.targetHand);
            break;
          case "rotate_counterclockwise":
            await sequenceState.rotateSequence(
              "counterclockwise",
              options.targetHand
            );
            break;
          case "shift_start":
            await sequenceState.shiftStartPlacement(options.stepNumber ?? 2);
        }
        return { status: "completed" as const };
      } catch {
        return {
          status: "failed" as const,
          message: "Could not shift start placement",
        };
      }
    }),
    busyState: {
      beginTransform() {
        if (transformBusy) return false;
        transformBusy = true;
        return true;
      },
      finishTransform() {
        transformBusy = false;
      },
      beginExtension() {
        if (extensionBusy) return false;
        extensionBusy = true;
        return true;
      },
      finishExtension() {
        extensionBusy = false;
      },
    },
    extensionFlowCoordinator: null,
    finishShiftStart: vi.fn(() => events.push("finish-shift")),
    ...overrides,
  };

  return {
    events,
    sequenceState,
    deps,
    orchestrator: createSequenceActionsOrchestrator(deps),
  };
}

describe("sequence actions orchestrator", () => {
  it("delegates a transform to the shared dispatcher and blocks a duplicate invocation", async () => {
    const pending = deferred();
    const harness = createHarness();
    harness.sequenceState.mirrorSequence.mockImplementation(async () => {
      harness.events.push("mirror");
      await pending.promise;
    });

    const first = harness.orchestrator.mirror();
    const duplicate = await harness.orchestrator.mirror();

    expect(duplicate).toEqual({ status: "busy" });
    expect(harness.events).toEqual(["dispatch:mirror:panel:both", "mirror"]);

    pending.resolve();
    await expect(first).resolves.toEqual({ status: "completed" });
  });

  it("passes the visible panel hand target to a rotation command", async () => {
    const harness = createHarness({ getTargetHand: () => "left" });

    await harness.orchestrator.rotateClockwise();

    expect(harness.events).toEqual([
      "dispatch:rotate_clockwise:panel:left",
      "rotate",
    ]);
  });

  it("applies a pattern only after its undo snapshot", () => {
    const harness = createHarness();

    harness.orchestrator.applyPattern(
      UndoOperationType.APPLY_DURATION_PATTERN,
      updatedSequence,
      () => harness.events.push("before-apply")
    );

    expect(harness.events).toEqual([
      `undo:${UndoOperationType.APPLY_DURATION_PATTERN}`,
      "before-apply",
      "set-sequence",
      "haptic:success",
    ]);
  });

  it("serializes bridge appends and updates the sequence only on success", async () => {
    const pending = deferred();
    const harness = createHarness({
      extensionFlowCoordinator: {
        appendBridge: vi.fn(async () => {
          harness.events.push("append-bridge");
          await pending.promise;
          return {
            success: true,
            sequence: updatedSequence,
            analysis: { canExtend: true },
            message: "Bridge added",
          };
        }),
      } as unknown as SequenceActionsOrchestratorDeps["extensionFlowCoordinator"],
    });

    const first = harness.orchestrator.appendBridge("A");
    const duplicate = await harness.orchestrator.appendBridge("B");

    expect(duplicate).toEqual({ status: "busy" });
    expect(harness.events).toEqual([
      "haptic:selection",
      `undo:${UndoOperationType.ADD_BEAT}`,
      "append-bridge",
    ]);

    pending.resolve();
    const result = await first;
    expect(result.status).toBe("completed");
    expect(harness.events.slice(-2)).toEqual([
      "set-sequence",
      "haptic:success",
    ]);
  });

  it("always releases the transform guard and exits shift-start mode after failure", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const harness = createHarness();
    harness.sequenceState.shiftStartPlacement.mockRejectedValueOnce(
      new Error("shift failed")
    );

    await expect(harness.orchestrator.shiftStart(3)).resolves.toMatchObject({
      status: "failed",
      message: "Could not shift start placement",
    });
    expect(harness.events).toEqual([
      "dispatch:shift_start:panel:both",
      "finish-shift",
    ]);

    harness.sequenceState.shiftStartPlacement.mockResolvedValueOnce(undefined);
    await expect(harness.orchestrator.shiftStart(2)).resolves.toMatchObject({
      status: "completed",
    });
    consoleError.mockRestore();
  });
});
