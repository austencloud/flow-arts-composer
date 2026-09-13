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
import { createSequence } from "$lib/shared/create/services/sequence-domain-manager";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { createStartPositionData } from "$lib/shared/create/factories/create-start-position-data";
import { reversalDetector } from "$lib/shared/create/services/reversal-detector";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  GridLocation,
  GridMode,
  GridPosition,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

/**
 * Canonical alpha1 -> alpha3 shift: left hand south to west, right hand north
 * to east. Both hands are visible, so the sequence takes the real start-position
 * and reversal paths through setCurrentSequence instead of the derivation
 * failure branch.
 */
function shiftMotion(hand: HandSide, start: GridLocation, end: GridLocation) {
  return createMotionData({
    hand,
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: start,
    endLocation: end,
    arrowLocation: end,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    gridMode: GridMode.DIAMOND,
    turns: 0,
  });
}

function staticMotion(hand: HandSide, at: GridLocation) {
  return createMotionData({
    hand,
    motionType: MotionType.STATIC,
    rotationDirection: RotationDirection.NO_ROTATION,
    startLocation: at,
    endLocation: at,
    arrowLocation: at,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    gridMode: GridMode.DIAMOND,
    turns: 0,
  });
}

function alpha1StartPosition() {
  return createStartPositionData({
    id: "start-alpha1",
    startPosition: GridPosition.ALPHA1,
    endPosition: GridPosition.ALPHA1,
    gridPosition: GridPosition.ALPHA1,
    motions: {
      [HandSide.LEFT]: staticMotion(HandSide.LEFT, GridLocation.SOUTH),
      [HandSide.RIGHT]: staticMotion(HandSide.RIGHT, GridLocation.NORTH),
    },
  });
}

function canonicalStep(stepNumber: number) {
  return createStepData({
    id: `step-${stepNumber}`,
    stepNumber,
    startPosition: GridPosition.ALPHA1,
    endPosition: GridPosition.ALPHA3,
    motions: {
      [HandSide.LEFT]: shiftMotion(
        HandSide.LEFT,
        GridLocation.SOUTH,
        GridLocation.WEST
      ),
      [HandSide.RIGHT]: shiftMotion(
        HandSide.RIGHT,
        GridLocation.NORTH,
        GridLocation.EAST
      ),
    },
  });
}

function makeSequence(word: string, stepCount: number): SequenceData {
  const startPosition = alpha1StartPosition();
  return {
    ...createSequence({ name: word, word, length: 0 }),
    // A stable id across edits: the orchestrator treats a changed id as loading
    // a different sequence and drops the selection.
    id: "seq-1",
    word,
    gridMode: GridMode.DIAMOND,
    steps: Array.from({ length: stepCount }, (_, index) =>
      canonicalStep(index + 1)
    ),
    startPosition,
    startingPosition: startPosition,
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

  it("bounds the redo stack at the undo cap within one tab", () => {
    // The redo stack has no cap of its own. It does not need one here: entries
    // only reach it one press at a time from an undo stack that is already
    // capped, so draining a saturated tab lands exactly at the cap.
    const manager = new UndoManager();
    for (let i = 0; i < 200; i++) {
      manager.pushUndo(UndoOperationType.ADD_BEAT, {
        sequence: makeSequence(`C${i}`, 1),
        selectedStepNumber: null,
        activeSection: "construct" as never,
        timestamp: 0,
      });
    }
    expect(manager.undoHistory).toHaveLength(50);

    let presses = 0;
    while (
      manager.undo("construct", {
        sequence: makeSequence("now", 1),
        selectedStepNumber: null,
        activeSection: "construct" as never,
        timestamp: 0,
      })
    ) {
      presses++;
    }
    expect(presses).toBe(50);
    expect(manager.redoHistory).toHaveLength(50);
  });

  it("keeps another tab's redo alive, so the combined stack can pass the cap", () => {
    // pushUndo only invalidates the redo entries of the tab that pushed —
    // deliberate, since the tabs hold independent sequences. The consequence is
    // that the persisted redo stack grows by one cap per tab that has been
    // saturated and drained, so it is bounded by cap x tabs, not by cap.
    const manager = new UndoManager();
    const drain = (section: string) => {
      while (
        manager.undo(section, {
          sequence: makeSequence("now", 1),
          selectedStepNumber: null,
          activeSection: section as never,
          timestamp: 0,
        })
      ) {
        /* drain this tab */
      }
    };
    const saturate = (section: string) => {
      for (let i = 0; i < 60; i++) {
        manager.pushUndo(UndoOperationType.ADD_BEAT, {
          sequence: makeSequence(`${section}${i}`, 1),
          selectedStepNumber: null,
          activeSection: section as never,
          timestamp: 0,
        });
      }
    };

    saturate("construct");
    drain("construct");
    expect(manager.redoHistory).toHaveLength(50);

    saturate("generate");
    expect(manager.redoHistory).toHaveLength(50); // construct's future survives
    drain("generate");
    expect(manager.redoHistory).toHaveLength(100);

    // Still reachable in both directions, which is the point of keeping them.
    expect(manager.getLastRedoEntry("construct")).not.toBeNull();
    expect(manager.getLastRedoEntry("generate")).not.toBeNull();
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
  /**
   * The real orchestrator, wired the way the Construct tab wires it.
   * clearSequenceCompletely() waits out the 300ms step-grid transition before
   * nulling the sequence, and the undo controller fires it without awaiting.
   */
  function realWorkspace() {
    return createSequenceState({
      tabId: "construct",
      ReversalDetector: reversalDetector,
    });
  }

  /**
   * A canonical fixture reaches the real start-position and reversal paths, so
   * these traces must run without a single recoverable-error log. A fixture
   * that fell back to the derivation failure branch would still satisfy the
   * assertions below while exercising a path the app never takes.
   */
  function watchForRecoverableErrors() {
    // spyOn without a mock implementation keeps writing to stderr; this
    // observes the noise rather than hiding it.
    return {
      warn: vi.spyOn(console, "warn"),
      error: vi.spyOn(console, "error"),
    };
  }

  function expectQuiet(spies: ReturnType<typeof watchForRecoverableErrors>) {
    expect(spies.warn).not.toHaveBeenCalled();
    expect(spies.error).not.toHaveBeenCalled();
    spies.warn.mockRestore();
    spies.error.mockRestore();
  }

  it("does not wipe a redone sequence that lands during the clear animation", async () => {
    vi.useFakeTimers();
    const spies = watchForRecoverableErrors();
    try {
      const sequenceState = realWorkspace();
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
      expectQuiet(spies);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not wipe a sequence created during the clear animation", async () => {
    vi.useFakeTimers();
    const spies = watchForRecoverableErrors();
    try {
      const sequenceState = realWorkspace();
      sequenceState.setCurrentSequence(makeSequence("A", 1));

      const clearing = sequenceState.clearSequenceCompletely();
      // The user picks a new start position before the animation finishes.
      sequenceState.setCurrentSequence(makeSequence("B", 1));

      await vi.advanceTimersByTimeAsync(1000);
      await clearing;

      expect(sequenceState.currentSequence?.word).toBe("B");
      expectQuiet(spies);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still clears when nothing else claimed the workspace", async () => {
    vi.useFakeTimers();
    const spies = watchForRecoverableErrors();
    try {
      const sequenceState = realWorkspace();
      sequenceState.setCurrentSequence(makeSequence("A", 1));

      const clearing = sequenceState.clearSequenceCompletely();
      await vi.advanceTimersByTimeAsync(1000);
      await clearing;

      expect(sequenceState.currentSequence).toBeNull();
      expectQuiet(spies);
    } finally {
      vi.useRealTimers();
    }
  });
});
