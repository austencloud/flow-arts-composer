// @vitest-environment jsdom
/**
 * Selecting steps and Sequence Actions are one mode at a time; selection wins.
 *
 * The bug was silent in state: opening Actions closed the step editor but left
 * the selection behind, so the auto-open effects reopened the editor beside
 * Actions. Selecting a step while Actions was open left Actions open too. Both
 * looked like a layout problem, but the cause is which flags and selections
 * survive each open call, which a screenshot can't show.
 *
 * Uses the real panel state and the real selection state, wired together the
 * way CreateModule wires them: through the module state ref.
 */
import { afterEach, describe, expect, it } from "vitest";
import { effect_root } from "svelte/internal/client";
import {
  createPanelCoordinationState,
  type PanelCoordinationState,
} from "#lib/shared/create/state/panel-coordination-state.svelte.js";
import { setCreateModuleStateRef } from "#lib/shared/create/state/create-module-state-ref.svelte.js";
import {
  createSequenceSelectionState,
  type SequenceSelectionState,
} from "#lib/features/create/shared/state/selection/sequence-selection-state.svelte.js";

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  setCreateModuleStateRef(null);
  localStorage.clear();
});

function setup(): {
  panel: PanelCoordinationState;
  selection: SequenceSelectionState;
} {
  let panel!: PanelCoordinationState;
  let selection!: SequenceSelectionState;
  cleanup = effect_root(() => {
    panel = createPanelCoordinationState();
    selection = createSequenceSelectionState();
  });
  const sequenceState = {
    clearSelection: () => selection.clearSelection(),
    exitMultiSelectMode: () => selection.exitMultiSelectMode(),
  };
  setCreateModuleStateRef({
    CreateModuleState: {
      sequenceState,
      getActiveTabSequenceState: () => sequenceState,
    },
    constructTabState: {},
    panelState: panel,
  } as unknown as Parameters<typeof setCreateModuleStateRef>[0]);
  return { panel, selection };
}

describe("selection wins over Sequence Actions", () => {
  it("opening Actions over a multi-selection drops the selection", () => {
    const { panel, selection } = setup();
    selection.applyClickSelection(2, { range: false, toggle: false });
    selection.applyClickSelection(4, { range: false, toggle: true });
    panel.openStepEditorPanel();
    expect(selection.selectedStepNumbers.size).toBe(2);

    panel.openSequenceActionsPanel("workspace_button");

    expect(panel.isSequenceActionsPanelOpen).toBe(true);
    expect(panel.isStepEditorPanelOpen).toBe(false);
    expect(selection.hasSelection).toBe(false);
    expect(selection.isMultiSelectMode).toBe(false);
  });

  it("opening Actions over a single step drops that step too", () => {
    const { panel, selection } = setup();
    selection.selectStep(3);
    panel.openStepEditorPanel();

    panel.openSequenceActionsPanel("workspace_button");

    expect(panel.isSequenceActionsPanelOpen).toBe(true);
    expect(selection.selectedStepNumber).toBeNull();
  });

  it("a repeat open while Actions is up leaves a later selection alone", () => {
    // Step operations re-call openSequenceActionsPanel while it is open; that
    // path must not wipe what the user is doing.
    const { panel, selection } = setup();
    panel.openSequenceActionsPanel("workspace_button");
    selection.selectStep(5);

    panel.openSequenceActionsPanel("step_edit");

    expect(selection.selectedStepNumber).toBe(5);
  });

  it("opening the step editor closes Actions", () => {
    const { panel } = setup();
    panel.openSequenceActionsPanel("workspace_button");

    panel.openStepEditorPanel();

    expect(panel.isSequenceActionsPanelOpen).toBe(false);
    expect(panel.isStepEditorPanelOpen).toBe(true);
  });

  it("opening the step editor ends Actions' duration preview", () => {
    const { panel } = setup();
    panel.openSequenceActionsPanel("workspace_button");
    panel.enterDurationPreviewMode({ steps: [] } as never);

    panel.openStepEditorPanel();

    expect(panel.isDurationPreviewMode).toBe(false);
  });

  it("notes that the editor replaced Actions until the editor closes", () => {
    // The tool slot reads this to show the editor at once under the leaving
    // drawer. A step picked from the tools has no drawer to hand off from.
    const { panel } = setup();
    panel.openStepEditorPanel();
    expect(panel.stepEditorReplacedActions).toBe(false);
    panel.closeStepEditorPanel();

    panel.openSequenceActionsPanel("workspace_button");
    panel.openStepEditorPanel();
    expect(panel.stepEditorReplacedActions).toBe(true);

    // Another step picked while the editor is open keeps the note.
    panel.openStepEditorPanel();
    expect(panel.stepEditorReplacedActions).toBe(true);

    panel.closeStepEditorPanel();
    expect(panel.stepEditorReplacedActions).toBe(false);
  });
});
