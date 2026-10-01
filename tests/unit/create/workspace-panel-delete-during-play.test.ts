/**
 * The step grid's own Delete waits from the moment Play is pressed until Stop.
 *
 * Play keeps the step selection while it loads the player, and the card with
 * the selected step shows until the first frame. A Delete that reached the
 * grid's handler then removed that step and every step after it, and a failed
 * load showing Retry left the same opening.
 *
 * Mounts the real WorkspacePanel and panel state. The step grid is stubbed to
 * hand over the delete callback the panel gives it.
 */
import { flushSync, mount, unmount } from "svelte";
import { effect_root } from "svelte/internal/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PanelCoordinationState } from "$lib/shared/create/state/panel-coordination-state.svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

const grid = vi.hoisted(() => ({
  props: null as { onStepDelete: (stepNumber: number) => void } | null,
}));
const removeStep = vi.hoisted(() => vi.fn());

vi.mock("$lib/shared/navigation/state/navigation-state.svelte", () => ({
  navigationState: { activeTab: "generate" },
}));
vi.mock("$lib/features/create/shared/get-step-operator", () => ({
  getStepOperator: () => ({ removeStep }),
}));
vi.mock(
  "$lib/features/create/shared/workspace-panel/sequence-display/components/SequenceDisplay.svelte",
  () => ({
    default: (
      _anchor: unknown,
      props: { onStepDelete: (stepNumber: number) => void }
    ) => {
      grid.props = props;
    },
  })
);

const { createPanelCoordinationState } =
  await import("$lib/shared/create/state/panel-coordination-state.svelte");
const { default: WorkspacePanel } =
  await import("$lib/features/create/shared/workspace-panel/core/WorkspacePanel.svelte");

// vitest-setup.ts swaps document.createElement for canvas stubs that are not
// DOM nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;
let stubbedCreateElement: typeof document.createElement;
const cleanups: Array<() => void> = [];

beforeEach(() => {
  removeStep.mockReset();
  grid.props = null;
  stubbedCreateElement = document.createElement;
  document.createElement = realCreateElement.bind(document);
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  document.body.innerHTML = "";
  document.createElement = stubbedCreateElement;
});

function draft(): SequenceData {
  return {
    id: "draft",
    name: "",
    word: "",
    steps: Array.from(
      { length: 5 },
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

const createModuleState = { activeSection: "generate" };

function openWorkspace() {
  let panelState!: PanelCoordinationState;
  const disposeState = effect_root(() => {
    panelState = createPanelCoordinationState();
  });
  const target = document.body.appendChild(document.createElement("div"));
  const panel = mount(WorkspacePanel, {
    target,
    props: {
      sequenceState: { selectedStepNumber: 3 } as never,
      createModuleState: createModuleState as never,
      panelState,
    },
  });
  flushSync();
  cleanups.push(() => {
    unmount(panel);
    disposeState();
  });

  return {
    panelState,
    /** Delete on step 3's cell, as the grid hands it to the panel. */
    deleteStep3() {
      grid.props!.onStepDelete(3);
    },
    pressPlay() {
      panelState.startWorkspacePlayback(draft(), 1, "generate");
      expect(panelState.workspacePlaybackPreparation).not.toBeNull();
    },
  };
}

describe("the step grid's Delete while Play runs", () => {
  it("removes the step when nothing plays", () => {
    openWorkspace().deleteStep3();
    expect(removeStep).toHaveBeenCalledWith(2, createModuleState);
  });

  it.each([
    ["loads the player", () => {}],
    [
      "shows Retry after a failed load",
      (panelState: PanelCoordinationState) =>
        panelState.failWorkspacePlaybackPreparation(
          panelState.workspacePlaybackPreparation!
        ),
    ],
    [
      "plays",
      (panelState: PanelCoordinationState) =>
        panelState.confirmWorkspacePlaybackReady(
          panelState.workspacePlaybackPreparation!
        ),
    ],
  ])("does nothing while Play %s", (_, reach) => {
    const workspace = openWorkspace();
    workspace.pressPlay();
    reach(workspace.panelState);

    workspace.deleteStep3();
    expect(removeStep).not.toHaveBeenCalled();
  });

  it("removes the step again after Stop", () => {
    const workspace = openWorkspace();
    workspace.pressPlay();
    workspace.panelState.stopWorkspacePlayback();

    workspace.deleteStep3();
    expect(removeStep).toHaveBeenCalledWith(2, createModuleState);
  });
});
