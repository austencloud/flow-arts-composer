/**
 * Undo/redo integrity for the Create module history.
 *
 * These are silent-failure guards: every case here leaves the UI looking like
 * it worked. The undo toast still fires, no error is logged, and the only
 * evidence is that the sequence in front of the user is wrong.
 *
 * The manager, the controller, the removal handler and (where it matters) the
 * real sequence-state orchestrator are all the shipping implementations. Only
 * the workspace stand-in below is fake.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { UndoManager, UndoOperationType } from "../../../services/undo-manager";
import { createUndoController } from "../undo-controller.svelte";
import { removeStep } from "../../../services/step-operations/step-removal-handler";
import { createSequenceState } from "../../sequence-state-orchestrator.svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

function makeSequence(word: string, stepCount: number): SequenceData {
  return {
    id: "seq-1",
    word,
    steps: Array.from({ length: stepCount }, (_, index) => ({
      id: `step-${index + 1}`,
      stepNumber: index + 1,
      motions: {},
    })),
  } as unknown as SequenceData;
}

/** Lets the controller's deferred snapshot capture land. */
const settleSnapshots = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A workspace that behaves like the real one for the parts history touches:
 * every edit replaces the sequence object rather than mutating it.
 */
function createWorkspace(initial: SequenceData | null = null) {
  let current: SequenceData | null = initial;
  let selected: number | null = null;

  return {
    get currentSequence() {
      return current;
    },
    get selectedStepNumber() {
      return selected;
    },
    animationState: { startHistoryTransition: vi.fn() },
    setCurrentSequence(sequence: SequenceData | null) {
      current = sequence;
    },
    selectStep(stepNumber: number) {
      selected = stepNumber;
    },
    clearSelection() {
      selected = null;
    },
    clearSequenceCompletely: vi.fn(async () => {
      current = null;
      selected = null;
    }),
    removeStepAndSubsequentWithAnimation(stepIndex: number, done: () => void) {
      current = makeSequence("AB", stepIndex);
      done();
    },
    selectStartPositionForEditing: vi.fn(),
  };
}

function createHistory(workspace: ReturnType<typeof createWorkspace>) {
  const manager = new UndoManager();
  const controller = createUndoController({
    UndoManager: manager,
    sequenceState: workspace as never,
    getActiveSection: () => "construct",
    setActiveSectionInternal: async () => {},
  });
  return { manager, controller };
}

describe("Create history: undo/redo round trips", () => {
  it("walks a three-edit trace all the way back and all the way forward", async () => {
    const workspace = createWorkspace(makeSequence("A", 1));
    const { controller } = createHistory(workspace);

    for (const word of ["AB", "ABC", "ABCD"]) {
      controller.pushUndoSnapshot(UndoOperationType.ADD_BEAT, {
        description: `Add ${word}`,
      });
      await settleSnapshots();
      workspace.setCurrentSequence(makeSequence(word, word.length));
    }

    const undone: (string | undefined)[] = [];
    while (controller.canUndo) {
      controller.undo();
      undone.push(workspace.currentSequence?.word);
    }
    expect(undone).toEqual(["ABC", "AB", "A"]);

    const redone: (string | undefined)[] = [];
    while (controller.canRedo) {
      controller.redo();
      redone.push(workspace.currentSequence?.word);
    }
    expect(redone).toEqual(["AB", "ABC", "ABCD"]);
  });

  it("drops the redo future once a new edit lands on top of an undo", async () => {
    const workspace = createWorkspace(makeSequence("A", 1));
    const { controller } = createHistory(workspace);

    controller.pushUndoSnapshot(UndoOperationType.ADD_BEAT);
    await settleSnapshots();
    workspace.setCurrentSequence(makeSequence("AB", 2));

    controller.undo();
    expect(controller.canRedo).toBe(true);

    controller.pushUndoSnapshot(UndoOperationType.ADD_BEAT);
    await settleSnapshots();
    workspace.setCurrentSequence(makeSequence("AZ", 2));

    expect(controller.canRedo).toBe(false);
    expect(workspace.currentSequence?.word).toBe("AZ");
  });

  it("keeps the newest 50 edits reachable and forgets only the oldest", async () => {
    const workspace = createWorkspace(makeSequence("W0", 1));
    const { controller } = createHistory(workspace);

    for (let i = 1; i <= 55; i++) {
      controller.pushUndoSnapshot(UndoOperationType.ADD_BEAT);
      await settleSnapshots();
      workspace.setCurrentSequence(makeSequence(`W${i}`, 1));
    }

    let presses = 0;
    while (controller.canUndo) {
      controller.undo();
      presses++;
    }
    expect(presses).toBe(50);
    expect(workspace.currentSequence?.word).toBe("W5");
  });
});

describe("Create history: one delete is one history entry", () => {
  it("records a single REMOVE_BEATS entry for a step deletion", async () => {
    const workspace = createWorkspace(makeSequence("ABC", 3));
    const { manager, controller } = createHistory(workspace);
    const createModuleState = {
      sequenceState: workspace,
      pushUndoSnapshot: controller.pushUndoSnapshot,
      setActiveToolPanel: vi.fn(),
    };

    removeStep(2, createModuleState as never);
    await settleSnapshots();

    expect(workspace.currentSequence?.steps).toHaveLength(2);
    expect(manager.undoHistory).toHaveLength(1);

    // One press restores the step and exhausts the history for this edit. A
    // second entry here would spend a press restoring the same three steps
    // while the toast still announced an undo.
    controller.undo();
    expect(workspace.currentSequence?.steps).toHaveLength(3);
    expect(controller.canUndo).toBe(false);
  });

  it("leaves the delete snapshot to the removal handler alone", () => {
    // StepEditorCoordinator used to push its own REMOVE_BEATS snapshot right
    // before delegating to StepOperator.removeStep, which pushes one too. Both
    // captured the same pre-delete state, so a single delete cost two undo
    // presses and the second press changed nothing.
    const source = readFileSync(
      path.resolve(
        process.cwd(),
        "src/lib/features/create/shared/components/coordinators/StepEditorCoordinator.svelte"
      ),
      "utf8"
    );
    const handler = source.slice(
      source.indexOf("function handleStepDelete()"),
      source.indexOf("function handleStepSelect(")
    );

    expect(handler).toContain("StepOperator.removeStep");
    expect(handler).not.toMatch(/pushUndoSnapshot\s*\(/);
  });
});

describe("Create history: clearing animation cannot outlive the state it clears", () => {
  it("does not wipe a redone sequence that lands during the clear animation", async () => {
    vi.useFakeTimers();
    try {
      // Real orchestrator: clearSequenceCompletely() waits out the 300ms
      // step-grid transition before nulling the sequence, and the undo
      // controller fires it without awaiting.
      const sequenceState = createSequenceState({ tabId: "construct" });
      const manager = new UndoManager();
      const controller = createUndoController({
        UndoManager: manager,
        sequenceState: sequenceState as never,
        getActiveSection: () => "construct",
        setActiveSectionInternal: async () => {},
      });

      controller.pushUndoSnapshot(UndoOperationType.SELECT_START_POSITION, {
        description: "Select start position",
      });
      await vi.advanceTimersByTimeAsync(0);
      sequenceState.setCurrentSequence(makeSequence("A", 1));

      controller.undo();
      expect(controller.canRedo).toBe(true);

      // Redo inside the clearing window — a double-tap on the history buttons.
      controller.redo();
      expect(sequenceState.currentSequence?.word).toBe("A");

      await vi.advanceTimersByTimeAsync(1000);
      expect(sequenceState.currentSequence?.word).toBe("A");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not wipe a sequence created during the clear animation", async () => {
    vi.useFakeTimers();
    try {
      const sequenceState = createSequenceState({ tabId: "construct" });
      sequenceState.setCurrentSequence(makeSequence("A", 1));

      const clearing = sequenceState.clearSequenceCompletely();
      // The user picks a new start position before the animation finishes.
      sequenceState.setCurrentSequence(makeSequence("B", 1));

      await vi.advanceTimersByTimeAsync(1000);
      await clearing;

      expect(sequenceState.currentSequence?.word).toBe("B");
    } finally {
      vi.useRealTimers();
    }
  });

  it("still clears when nothing else claimed the workspace", async () => {
    vi.useFakeTimers();
    try {
      const sequenceState = createSequenceState({ tabId: "construct" });
      sequenceState.setCurrentSequence(makeSequence("A", 1));

      const clearing = sequenceState.clearSequenceCompletely();
      await vi.advanceTimersByTimeAsync(1000);
      await clearing;

      expect(sequenceState.currentSequence).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
