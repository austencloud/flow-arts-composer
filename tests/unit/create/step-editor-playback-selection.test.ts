/**
 * Play keeps the step editor's selection for Stop to restore.
 *
 * Play hides the step editor drawer as soon as the player starts loading, and
 * the drawer reports that as a close. Handled like a user closing the editor,
 * it cleared the selected step: nothing stayed selected during playback, and
 * Stop had no step to reopen the editor on. The bug is silent. Playback still
 * runs, and only the missing selection gives it away.
 *
 * Mounts the real coordinator, drawer, panel state, selection state and auto
 * editor effects. Only the editor bodies and other visual leaves are stubbed.
 */
import { flushSync, mount, unmount } from "svelte";
import { effect_root } from "svelte/internal/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PanelCoordinationState } from "$lib/shared/create/state/panel-coordination-state.svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

const nav = vi.hoisted(() => ({ activeTab: "generate" }));
// Props the coordinator passes to its editor bodies. Svelte props are live
// getters, so these read the coordinator's current values.
const shown = vi.hoisted(() => ({
  editor: null as Record<string, unknown> | null,
  batch: null as Record<string, unknown> | null,
}));

vi.mock("$lib/shared/navigation/state/navigation-state.svelte", () => ({
  navigationState: nav,
}));
vi.mock(
  "$lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte",
  () => ({ getSequenceOverlayState: () => ({ isOpen: false }) })
);
vi.mock("$lib/features/create/shared/get-step-operator", () => ({
  getStepOperator: () => ({}),
}));
vi.mock("$lib/shared/application/get-haptic-feedback", () => ({
  getHapticFeedback: () => ({ trigger: () => {} }),
}));
vi.mock("$lib/shared/application/state/app-state.svelte", () => ({
  getSettings: () => ({}),
  updateSettings: () => {},
}));
vi.mock("$lib/shared/components/Crossfade.svelte", async () => ({
  default: (await import("./PassthroughStub.svelte")).default,
}));
vi.mock(
  "$lib/features/create/shared/components/sequence-actions/StepEditorPanel.svelte",
  () => ({
    default: (_anchor: unknown, props: Record<string, unknown>) => {
      shown.editor = props;
    },
  })
);
vi.mock(
  "$lib/features/create/shared/components/sequence-actions/BatchStepEditor.svelte",
  () => ({
    default: (_anchor: unknown, props: Record<string, unknown>) => {
      shown.batch = props;
    },
  })
);
vi.mock(
  "$lib/features/create/shared/components/sequence-actions/MandalaViewerPanel.svelte",
  () => ({ default: () => {} })
);
vi.mock(
  "$lib/features/create/shared/components/sequence-actions/StepControlsZone.svelte",
  () => ({ default: () => {} })
);
vi.mock(
  "$lib/shared/settings/components/tabs/prop-type/PropSelectionSheet.svelte",
  () => ({ default: () => {} })
);

const { createPanelCoordinationState } =
  await import("$lib/shared/create/state/panel-coordination-state.svelte");
const { createSequenceSelectionState } =
  await import("$lib/features/create/shared/state/selection/sequence-selection-state.svelte");
const { createAutoEditPanelEffect, createAutoStepEditorEffect } =
  await import("$lib/features/create/shared/state/managers/auto-edit-panel-manager.svelte");
const { default: StepEditorCoordinator } =
  await import("$lib/features/create/shared/components/coordinators/StepEditorCoordinator.svelte");

type Selection = ReturnType<typeof createSequenceSelectionState>;

// vitest-setup.ts swaps document.createElement for canvas stubs that are not
// DOM nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;
let stubbedCreateElement: typeof document.createElement;
const cleanups: Array<() => void> = [];

beforeEach(() => {
  // The drawer finishes opening and closing on animation frames and timers.
  // Holding them keeps its content mounted and nothing firing after teardown.
  vi.useFakeTimers();
  localStorage.clear();
  shown.editor = null;
  shown.batch = null;
  stubbedCreateElement = document.createElement;
  document.createElement = realCreateElement.bind(document);
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  document.body.innerHTML = "";
  document.createElement = stubbedCreateElement;
  localStorage.clear();
});

function draft(): SequenceData {
  return {
    id: "draft",
    name: "",
    word: "",
    steps: Array.from(
      { length: 8 },
      (_, index) =>
        ({ id: `step-${index + 1}`, stepNumber: index + 1 }) as StepData
    ),
    thumbnails: [],
    isFavorite: false,
    isCircular: false,
    tags: [],
    metadata: {},
  };
}

/** A Create workspace on the given tab, with its step editor drawer mounted. */
function openWorkspace(tab: string) {
  nav.activeTab = tab;
  const sequence = draft();
  let panelState!: PanelCoordinationState;
  let selection!: Selection;
  cleanups.push(
    effect_root(() => {
      panelState = createPanelCoordinationState();
      selection = createSequenceSelectionState();
    })
  );
  const sequenceState = Object.create(selection, {
    currentSequence: { get: () => sequence },
    getRemovingStepIndices: { value: () => [] },
  }) as Selection;
  const CreateModuleState = {
    isPersistenceInitialized: true,
    sequenceState,
    getActiveTabSequenceState: () => sequenceState,
  } as never;

  // Wired the way create-module-effect-coordinator wires them.
  const shouldAutoOpen = () => nav.activeTab !== "construct";
  cleanups.push(
    createAutoEditPanelEffect({
      CreateModuleState,
      panelState,
      shouldAutoOpen,
    }),
    createAutoStepEditorEffect({
      CreateModuleState,
      panelState,
      shouldAutoOpen,
    })
  );

  const target = document.createElement("div");
  document.body.append(target);
  const component = mount(StepEditorCoordinator, {
    target,
    context: new Map([
      [
        "createModule",
        {
          CreateModuleState,
          panelState,
          layout: { shouldUseSideBySideLayout: true },
          handlers: { requestClearSequence: () => {} },
        },
      ],
    ]),
  });
  cleanups.push(() => unmount(component));
  flushSync();

  return {
    panelState,
    selection,
    /** A step click in the workspace grid, handled as WorkspacePanel does. */
    click(stepNumber: number, range = false) {
      selection.applyClickSelection(stepNumber, { range, toggle: false });
      panelState.openStepEditorPanel();
      flushSync();
    },
    /** Play: the player starts loading, and the drawer closes for it. */
    play() {
      panelState.startWorkspacePlayback(sequence, 1, tab);
      flushSync();
      return panelState.workspacePlaybackPreparation;
    },
  };
}

describe("step editor across workspace playback", () => {
  it.each(["generate", "construct"])(
    "keeps the step selected through loading and playback on %s, and Stop reopens its editor",
    (tab) => {
      const workspace = openWorkspace(tab);
      workspace.click(7);
      expect(shown.editor?.isOpen).toBe(true);
      expect(shown.editor?.selectedStepNumber).toBe(7);

      const loading = workspace.play();
      expect(shown.editor?.isOpen).toBe(false);
      expect(workspace.selection.selectedStepNumber).toBe(7);

      workspace.panelState.confirmWorkspacePlaybackReady(loading!);
      flushSync();
      expect(workspace.panelState.workspacePlayback).toBe(loading);
      expect(workspace.selection.selectedStepNumber).toBe(7);

      workspace.panelState.stopWorkspacePlayback();
      flushSync();
      expect(shown.editor?.isOpen).toBe(true);
      expect(shown.editor?.selectedStepNumber).toBe(7);
    }
  );

  it.each([
    ["cancelled", () => {}],
    [
      "failed",
      (panelState: PanelCoordinationState) =>
        panelState.failWorkspacePlaybackPreparation(
          panelState.workspacePlaybackPreparation!
        ),
    ],
  ])(
    "reopens the editor on the kept step when loading is %s",
    (_, endLoading) => {
      const workspace = openWorkspace("generate");
      workspace.click(7);
      workspace.play();
      endLoading(workspace.panelState);
      flushSync();
      expect(workspace.selection.selectedStepNumber).toBe(7);

      // The cancel button and Escape both stop through here.
      workspace.panelState.stopWorkspacePlayback();
      flushSync();
      expect(shown.editor?.isOpen).toBe(true);
      expect(shown.editor?.selectedStepNumber).toBe(7);
    }
  );

  it("plays a multi-step selection, and Stop reopens the batch editor on it", () => {
    const workspace = openWorkspace("generate");
    workspace.click(3);
    workspace.click(5, true);
    expect(shown.batch?.stepNumbers).toEqual([3, 4, 5]);

    const loading = workspace.play();
    expect(loading).not.toBeNull();
    expect([...workspace.selection.selectedStepNumbers]).toEqual([3, 4, 5]);

    workspace.panelState.confirmWorkspacePlaybackReady(loading!);
    flushSync();
    expect(workspace.panelState.workspacePlayback).toBe(loading);

    workspace.panelState.stopWorkspacePlayback();
    flushSync();
    expect(workspace.panelState.isStepEditorPanelOpen).toBe(true);
    expect(shown.batch?.stepNumbers).toEqual([3, 4, 5]);
  });

  it("leaves the viewer open when it takes playback over from a multi-step selection", () => {
    const workspace = openWorkspace("generate");
    workspace.click(3);
    workspace.click(5, true);
    const loading = workspace.play();
    workspace.panelState.confirmWorkspacePlaybackReady(loading!);
    flushSync();

    // Space and the expand button both hand playback to the viewer.
    workspace.panelState.openSequenceViewer();
    flushSync();
    expect(workspace.panelState.isSequenceViewerOpen).toBe(true);
  });
});
