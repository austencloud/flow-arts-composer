import { afterEach, describe, expect, it } from "vitest";
import { effect_root } from "svelte/internal/client";
import {
  createPanelCoordinationState,
  type PanelCoordinationState,
} from "$lib/shared/create/state/panel-coordination-state.svelte";
import { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";

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

const customizeProps = {
  constraintPreset: "smooth",
  handPathMode: "smooth",
  motionTypeFilter: null,
  startEndOptions: null,
  level: 2,
  gridMode: "diamond",
  isFreeformMode: true,
  onConstraintPresetChange: () => {},
  onHandPathModeChange: () => {},
  onMotionTypeFilterChange: () => {},
  onStartEndChange: null,
} as unknown as Parameters<PanelCoordinationState["openCustomizeOverlay"]>[0];

describe("openGenerateCard", () => {
  it("is null when nothing is open", () => {
    const state = createState();
    expect(state.openGenerateCard).toBeNull();
  });

  it("names the open card and switches when another opens", () => {
    const state = createState();

    state.openCustomizeOverlay(customizeProps);
    expect(state.openGenerateCard).toBe("customize");

    state.openLOOPPanel(LOOPType.MIRRORED, new Set(), () => {});
    expect(state.openGenerateCard).toBe("loop");
    expect(state.isCustomizeOverlayOpen).toBe(false);

    state.openPresetDrawer();
    expect(state.openGenerateCard).toBe("preset");
    expect(state.isLOOPPanelOpen).toBe(false);

    state.openTnDPanel();
    expect(state.openGenerateCard).toBe("tnd");
    expect(state.isPresetDrawerOpen).toBe(false);
    expect(state.isAnyPanelOpen).toBe(true);
  });

  it("closeGenerateCard closes whichever card is open", () => {
    const state = createState();

    state.openPresetDrawer();
    state.closeGenerateCard();
    expect(state.openGenerateCard).toBeNull();
    expect(state.isPresetDrawerOpen).toBe(false);

    state.openLOOPPanel(LOOPType.MIRRORED, new Set(), () => {});
    state.closeGenerateCard();
    expect(state.isLOOPPanelOpen).toBe(false);
    expect(state.loopOnChange).toBeNull();

    state.openCustomizeOverlay(customizeProps);
    state.closeGenerateCard();
    expect(state.isCustomizeOverlayOpen).toBe(false);
    expect(state.customizeOverlayProps).toBeNull();

    state.openTnDPanel();
    state.closeGenerateCard();
    expect(state.isTnDPanelOpen).toBe(false);
    expect(state.openGenerateCard).toBeNull();
  });

  it("closeGenerateCard is a no-op when nothing is open", () => {
    const state = createState();
    expect(() => state.closeGenerateCard()).not.toThrow();
    expect(state.openGenerateCard).toBeNull();
  });
});
