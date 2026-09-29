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
import { afterEach, describe, it, expect, vi } from "vitest";
import { UndoManager, UndoOperationType } from "../../../services/undo-manager";
import { createUndoController } from "../undo-controller.svelte";
import { removeStep } from "../../../services/step-operations/step-removal-handler";
import { createSequenceState } from "../../sequence-state-orchestrator.svelte";
import { registerCreateShortcuts } from "$lib/shared/keyboard/registration/register-create-shortcuts";
import { KeyboardShortcutManager } from "$lib/shared/keyboard/services/keyboard-shortcut-manager";
import { ShortcutRegistry } from "$lib/shared/keyboard/services/shortcut-registry";
import type { ShortcutRegistrationOptions } from "$lib/shared/keyboard/domain/types/keyboard-types";
import type { createKeyboardShortcutState } from "$lib/shared/keyboard/state/keyboard-shortcut-state.svelte";
import { setCreateModuleStateRef } from "$lib/shared/create/state/create-module-state-ref.svelte";
import { createPanelCoordinationState } from "$lib/shared/create/state/panel-coordination-state.svelte";
import { createSequence } from "$lib/shared/create/services/sequence-domain-manager";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { createStartPlacementData } from "$lib/shared/create/factories/create-start-placement-data";
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
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

/**
 * Canonical alpha1 -> alpha3 shift: left hand south to west, right hand north
 * to east. Both hands are visible, so the sequence takes the real start-placement
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

function alpha1StartPlacement() {
  return createStartPlacementData({
    id: "start-alpha1",
    startPlacement: GridPlacement.ALPHA1,
    endPlacement: GridPlacement.ALPHA1,
    gridPlacement: GridPlacement.ALPHA1,
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
    startPlacement: GridPlacement.ALPHA1,
    endPlacement: GridPlacement.ALPHA3,
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
  const startPlacement = alpha1StartPlacement();
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
    startPlacement,
    startingPlacement: startPlacement,
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
    selectStartPlacementForEditing: vi.fn(),
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

describe("Create history: a keyboard delete is one history entry", () => {
  /**
   * Delete and Backspace on a selected step reach Create's window shortcut
   * before anything else. It used to remove the steps itself, so the Undo
   * button never offered them back. The shortcuts run here as registered,
   * against the real orchestrator, removal handler and history.
   */
  function registerDeleteShortcuts() {
    const registered = new Map<string, ShortcutRegistrationOptions>();
    const service = {
      register: (options: ShortcutRegistrationOptions) => {
        registered.set(options.id, options);
        return () => {};
      },
    } as unknown as KeyboardShortcutManager;
    const state = {
      settings: { enableSingleKeyShortcuts: true },
    } as unknown as ReturnType<typeof createKeyboardShortcutState>;
    registerCreateShortcuts(service, state);
    return registered;
  }

  afterEach(() => {
    setCreateModuleStateRef(null);
    vi.useRealTimers();
  });

  it.each([
    ["Backspace", "create.delete-beat"],
    ["Delete", "create.delete-beat-delete-key"],
  ])(
    "%s brings back the step and every step after it with one Undo",
    async (key, shortcutId) => {
      vi.useFakeTimers();
      const sequenceState = createSequenceState({
        tabId: "construct",
        ReversalDetector: reversalDetector,
      });
      sequenceState.setCurrentSequence(makeSequence("ABCDE", 5));
      const built = sequenceState.currentSequence;
      const manager = new UndoManager();
      const controller = createUndoController({
        UndoManager: manager,
        sequenceState: sequenceState as never,
        getActiveSection: () => "construct",
        setActiveSectionInternal: async () => {},
      });
      const createModuleState = {
        sequenceState,
        pushUndoSnapshot: controller.pushUndoSnapshot,
        setActiveToolPanel: vi.fn(),
      };
      setCreateModuleStateRef({
        CreateModuleState: createModuleState as never,
        constructTabState: {} as never,
        panelState: {} as never,
        executeSequenceAction: vi.fn(),
        requestClearSequence: vi.fn(),
        removeStep: (stepIndex: number) =>
          removeStep(stepIndex, createModuleState as never),
      });
      const shortcut = registerDeleteShortcuts().get(shortcutId);
      if (!shortcut) throw new Error(`${shortcutId} was not registered`);

      sequenceState.selectStep(3);
      await shortcut.action(new KeyboardEvent("keydown", { key }));
      // Past the fade the steps play before they leave.
      await vi.advanceTimersByTimeAsync(1000);

      expect(sequenceState.currentSequence?.steps).toHaveLength(2);
      expect(manager.undoHistory).toHaveLength(1);
      expect(manager.undoHistory[0]?.type).toBe(UndoOperationType.REMOVE_BEATS);
      expect(manager.undoHistory[0]?.metadata?.description).toBe(
        "Remove steps 3 to 5"
      );

      controller.undo();
      expect(sequenceState.currentSequence?.steps).toEqual(built?.steps);
      expect(controller.canUndo).toBe(false);
    }
  );
});

describe("Create history: a keyboard delete goes through the workspace's own rules", () => {
  /**
   * Each key press arrives through the real shortcut manager, the way the
   * browser delivers it: the manager skips a shortcut whose condition says no,
   * and otherwise cancels the key's default before the action runs.
   */
  let disposeShortcuts: (() => void) | undefined;

  afterEach(() => {
    disposeShortcuts?.();
    disposeShortcuts = undefined;
    setCreateModuleStateRef(null);
    vi.useRealTimers();
  });

  function createWorkspaceWithShortcuts() {
    const sequenceState = createSequenceState({
      tabId: "construct",
      ReversalDetector: reversalDetector,
    });
    sequenceState.setCurrentSequence(makeSequence("ABCDE", 5));
    const manager = new UndoManager();
    const controller = createUndoController({
      UndoManager: manager,
      sequenceState: sequenceState as never,
      getActiveSection: () => "construct",
      setActiveSectionInternal: async () => {},
    });
    const createModuleState = {
      sequenceState,
      // Every key press asks each Create shortcut whether it applies, and the
      // Alt+key transforms look at the active tab's sequence to answer.
      getActiveTabSequenceState: () => sequenceState,
      pushUndoSnapshot: controller.pushUndoSnapshot,
      setActiveToolPanel: vi.fn(),
    };
    const panelState = createPanelCoordinationState();
    // Stands in for CreateModule's clear, which opens the confirmation dialog.
    const requestClearSequence = vi.fn();
    setCreateModuleStateRef({
      CreateModuleState: createModuleState as never,
      constructTabState: {} as never,
      panelState,
      executeSequenceAction: vi.fn(),
      requestClearSequence,
      removeStep: (stepIndex: number) =>
        removeStep(stepIndex, createModuleState as never),
    });

    const shortcuts = new KeyboardShortcutManager(new ShortcutRegistry());
    registerCreateShortcuts(shortcuts, {
      settings: { enableSingleKeyShortcuts: true },
    } as unknown as ReturnType<typeof createKeyboardShortcutState>);
    shortcuts.setContext("create");
    shortcuts.initialize();
    disposeShortcuts = () => shortcuts.dispose();

    return {
      sequenceState,
      manager,
      panelState,
      requestClearSequence,
      press(key: string) {
        const event = new KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
        });
        document.body.dispatchEvent(event);
        return event;
      },
      play() {
        panelState.startWorkspacePlayback(
          sequenceState.currentSequence!,
          1,
          "construct"
        );
        panelState.confirmWorkspacePlaybackReady(
          panelState.workspacePlaybackPreparation!
        );
        expect(panelState.workspacePlayback).not.toBeNull();
      },
    };
  }

  // Backspace used to ask first and Delete cleared straight away, still
  // leaving a Clear entry in history. Both now take the path the step
  // editor's Delete button takes, which shows the confirmation dialog unless
  // the user turned it off.
  it.each(["Backspace", "Delete"])(
    "%s on the start position asks before clearing anything",
    async (key) => {
      vi.useFakeTimers();
      const workspace = createWorkspaceWithShortcuts();
      workspace.sequenceState.selectStep(0);
      expect(workspace.sequenceState.selectedStepData?.stepNumber).toBe(0);

      workspace.press(key);
      // Past the clear's 300 ms fade.
      await vi.advanceTimersByTimeAsync(1000);

      expect(workspace.requestClearSequence).toHaveBeenCalledOnce();
      expect(workspace.sequenceState.currentSequence?.steps).toHaveLength(5);
      expect(workspace.manager.undoHistory).toHaveLength(0);
    }
  );

  // The grid ignores clicks while the workspace player runs, but a selection
  // made before Play survives it, so the keys used to reach it anyway.
  it.each([
    ["Backspace", "step 3", 3],
    ["Delete", "step 3", 3],
    ["Backspace", "the start position", 0],
    ["Delete", "the start position", 0],
  ])(
    "%s on %s does nothing while the workspace plays",
    async (key, _label, stepNumber) => {
      vi.useFakeTimers();
      const workspace = createWorkspaceWithShortcuts();
      workspace.sequenceState.selectStep(stepNumber);
      workspace.play();

      const event = workspace.press(key);
      await vi.advanceTimersByTimeAsync(1000);

      expect(workspace.sequenceState.currentSequence?.steps).toHaveLength(5);
      expect(workspace.manager.undoHistory).toHaveLength(0);
      expect(workspace.requestClearSequence).not.toHaveBeenCalled();
      expect(workspace.panelState.workspacePlayback).not.toBeNull();
      // Skipped outright rather than swallowed, so the manager also left any
      // open sheet beside the player where it was.
      expect(event.defaultPrevented).toBe(false);
    }
  );
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
   * A canonical fixture reaches the real start-placement and reversal paths, so
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

      controller.pushUndoSnapshot(UndoOperationType.SELECT_START_PLACEMENT, {
        description: "Select start placement",
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
      // The user picks a new start placement before the animation finishes.
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
