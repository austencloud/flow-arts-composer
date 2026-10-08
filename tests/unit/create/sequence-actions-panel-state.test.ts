import { describe, expect, it } from "vitest";
import {
  createSequenceActionsPanelState,
  type SequenceActionsRestoreEffect,
} from "$lib/features/create/shared/state/sequence-actions-panel-state.svelte";

describe("sequence actions panel state", () => {
  it("restores Duration through the real view and requests preview setup", () => {
    const state = createSequenceActionsPanelState();

    const effect = state.restoreSubView("duration");

    expect(effect satisfies SequenceActionsRestoreEffect).toBe(
      "enter-duration-preview"
    );
    expect(state.subView).toBe("duration");
    expect(state.restorationComplete).toBe(true);
    expect(state.hasRestoredSubView).toBe(true);
  });

  it("re-analyzes an explicitly restored Extend view instead of restoring stale data", () => {
    const state = createSequenceActionsPanelState({
      initialSubView: "turnPattern",
    });

    const effect = state.restoreSubView("extend");

    expect(effect).toBe("start-extend-flow");
    expect(state.subView).toBeNull();
    expect(state.extensionAnalysis).toBeNull();
  });

  it("backs through Direction one level at a time before returning to the root", () => {
    const state = createSequenceActionsPanelState({
      initialSubView: "rotation",
      initialDirectionRoute: "reversals",
    });

    // Back out of Reversals lands on the Direction hub, still inside the
    // drill-down rather than dropping straight out to the actions grid.
    expect(state.exitSubView()).toBe("none");
    expect(state.directionRoute).toBe("hub");
    expect(state.subView).toBe("rotation");
    expect(state.navDirection).toBe(-1);

    expect(state.exitSubView()).toBe("none");
    expect(state.subView).toBeNull();
  });

  it("signals Duration preview cleanup when leaving Duration", () => {
    const state = createSequenceActionsPanelState({
      initialSubView: "duration",
    });

    expect(state.exitSubView()).toBe("discard-duration-preview");
    expect(state.subView).toBeNull();
    expect(state.navDirection).toBe(-1);
  });

  it("persists stateless drill-downs but never transient Extend analysis", () => {
    const state = createSequenceActionsPanelState();

    state.openTurnPatterns();
    expect(state.getPersistedSubDrawer()).toBe("turnPattern");

    state.openExtend({
      analysis: { availableLOOPOptions: [] },
      circularizationOptions: [],
      directUnavailableReason: null,
    } as never);
    expect(state.getPersistedSubDrawer()).toBeNull();

    state.resetRestorationOnClose();
    expect(state.subView).toBeNull();
    expect(state.extensionAnalysis).toBeNull();
  });

  it("returns direct mobile help to actions and selector help to its browser", () => {
    const direct = createSequenceActionsPanelState();
    direct.openDirectHelp("mirror");
    direct.closeHelpDetail();
    expect(direct.helpMode).toBe("inactive");

    const selector = createSequenceActionsPanelState();
    selector.enterHelpMode();
    selector.selectTransformHelp("mirror");
    selector.closeHelpDetail();
    expect(selector.helpMode).toBe("selecting");
  });
});

describe("the Grid join page", () => {
  it("opens from the Grid tile and backs out to the actions", () => {
    const state = createSequenceActionsPanelState();

    state.openGridJoin();
    expect(state.subView).toBe("gridJoin");
    expect(state.subViewTitle).toBe("Grid join");
    expect(state.navDirection).toBe(1);

    expect(state.exitSubView()).toBe("none");
    expect(state.subView).toBeNull();
    expect(state.navDirection).toBe(-1);
  });
});
