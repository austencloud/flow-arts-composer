import { afterEach, describe, expect, it } from "vitest";
import { effect_root } from "svelte/internal/client";
import {
  createPanelCoordinationState,
  type PanelCoordinationState,
} from "#lib/shared/create/state/panel-coordination-state.svelte.js";

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function createState(): PanelCoordinationState {
  let state!: PanelCoordinationState;
  cleanup = effect_root(() => {
    state = createPanelCoordinationState();
  });
  return state;
}

describe("Create mandala panel state", () => {
  it("keeps the drawer open while switching from mandala viewer to step editor", () => {
    const state = createState();

    state.openMandalaViewer({ variant: "red", pathShape: "concave" });
    expect(state.isStepEditorPanelOpen).toBe(true);
    expect(state.mandalaViewerSelection).toEqual({
      variant: "red",
      pathShape: "concave",
    });

    state.openStepEditorPanel();
    expect(state.isStepEditorPanelOpen).toBe(true);
    expect(state.mandalaViewerSelection).toBeNull();
  });

  it("clears the selected mandala when the shared drawer closes", () => {
    const state = createState();

    state.openMandalaViewer({ variant: "both", pathShape: "hybrid" });
    state.closeMandalaViewer();

    expect(state.isStepEditorPanelOpen).toBe(false);
    expect(state.mandalaViewerSelection).toBeNull();
  });
});
