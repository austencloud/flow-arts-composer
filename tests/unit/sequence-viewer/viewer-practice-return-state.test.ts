import { describe, expect, it, vi } from "vitest";
import { createViewerShellInteractionState } from "#lib/shared/sequence-viewer/state/viewer-shell-interaction-state.svelte.js";
import { createViewerState } from "#lib/shared/sequence-viewer/state/viewer-state.svelte.js";

type PracticeOrigin = "animation" | "card";

function createPracticeHarness(
  mode: PracticeOrigin,
  options: { ready?: boolean } = {}
) {
  const ready = options.ready ?? true;
  const viewerState = createViewerState({
    initialMode: mode,
    initialSplit: { leftPane: "animation", rightPane: "card" },
    persist: false,
  });
  let practiceActive = false;
  const enterPracticeMode = vi.fn(() => {
    viewerState.exitExport();
    viewerState.setSplitConfig({ leftPane: "animation", rightPane: "card" });
    viewerState.setViewerMode("split");
    practiceActive = ready;
    return ready;
  });
  const exitPracticeMode = vi.fn(() => {
    practiceActive = false;
  });
  const handlePracticeStop = vi.fn(() => {
    practiceActive = false;
  });
  const captureScanPracticeChanged = vi.fn();
  const state = createViewerShellInteractionState(
    {
      getContext: () =>
        ({
          viewerState,
          get practiceActive() {
            return practiceActive;
          },
          get practiceRunning() {
            return practiceActive;
          },
          bpmLocal: 72,
          practiceState: { userConfig: {} },
          enterPracticeMode,
          exitPracticeMode,
          handlePracticeStop,
        }) as never,
      getExportOverrides: () => undefined,
      getOnRemix: () => undefined,
      getOpenAppHref: () => undefined,
      getOnAccountSignIn: () => undefined,
      onClose: vi.fn(),
    },
    {
      navigate: vi.fn(),
      openExternalHref: vi.fn(),
      captureScanAction: vi.fn(),
      captureScanExport: vi.fn(),
      captureScanPlaybackChanged: vi.fn(),
      captureScanPracticeChanged,
      captureScanSettingChanged: vi.fn(),
      captureScanViewChanged: vi.fn(),
      endScanViewerSession: vi.fn(),
      registerScanSessionCleanup: vi.fn(() => vi.fn()),
    }
  );

  return {
    state,
    viewerState,
    enterPracticeMode,
    exitPracticeMode,
    handlePracticeStop,
    captureScanPracticeChanged,
    isActive: () => practiceActive,
  };
}

describe("viewer Practice return state", () => {
  it.each([
    ["2D", "animation", "animation-export"],
    ["Card", "card", "image-export"],
  ] as const)(
    "restores the original %s surface and settings on exit",
    (_, mode, exportContext) => {
      const { state, viewerState } = createPracticeHarness(mode);

      state.handleEnterPractice();
      state.handleExitPractice();

      expect(viewerState.rawViewerMode).toBe(mode);
      expect(viewerState.exportContext).toBe(exportContext);
    }
  );

  it("does not replace the saved return surface during a rapid repeated toggle", () => {
    const { state, viewerState, enterPracticeMode, exitPracticeMode } =
      createPracticeHarness("card");

    state.handleEnterPractice();
    state.handleEnterPractice();
    state.handleExitPractice();
    state.handleExitPractice();

    expect(enterPracticeMode).toHaveBeenCalledOnce();
    expect(exitPracticeMode).toHaveBeenCalledOnce();
    expect(viewerState.rawViewerMode).toBe("card");
    expect(viewerState.exportContext).toBe("image-export");
  });

  it("keeps a surface selected while practicing instead of restoring stale state", () => {
    const { state, viewerState } = createPracticeHarness("animation");

    state.handleEnterPractice();
    viewerState.setViewerMode("card");
    viewerState.setExportContext("image-export");
    state.handleExitPractice();

    expect(viewerState.rawViewerMode).toBe("card");
    expect(viewerState.exportContext).toBe("image-export");
  });

  it("one tap enters and starts: entered and started fire together", () => {
    const { state, captureScanPracticeChanged, isActive } =
      createPracticeHarness("animation");

    state.handleEnterPractice();

    expect(isActive()).toBe(true);
    expect(captureScanPracticeChanged.mock.calls.map((call) => call[0])).toEqual(
      ["entered", "started"]
    );
  });

  it.each([
    ["2D", "animation", "animation-export"],
    ["Card", "card", "image-export"],
  ] as const)(
    "Stop leaves practice completely and restores the %s surface",
    (_, mode, exportContext) => {
      const {
        state,
        viewerState,
        handlePracticeStop,
        captureScanPracticeChanged,
        isActive,
      } = createPracticeHarness(mode);

      state.handleEnterPractice();
      state.handlePracticeStop();

      expect(handlePracticeStop).toHaveBeenCalledOnce();
      expect(isActive()).toBe(false);
      expect(viewerState.rawViewerMode).toBe(mode);
      expect(viewerState.exportContext).toBe(exportContext);
      expect(
        captureScanPracticeChanged.mock.calls.map((call) => call[0])
      ).toEqual(["entered", "started", "stopped", "exited"]);
    }
  );

  it("a run that ends by itself leaves like the back button", () => {
    const { state, viewerState, exitPracticeMode, isActive } =
      createPracticeHarness("card");

    state.handleEnterPractice();
    state.handlePracticeRunEnded();

    expect(exitPracticeMode).toHaveBeenCalledOnce();
    expect(isActive()).toBe(false);
    expect(viewerState.rawViewerMode).toBe("card");
  });

  it("puts the view back and reports nothing when the animation isn't ready", () => {
    const { state, viewerState, captureScanPracticeChanged, isActive } =
      createPracticeHarness("card", { ready: false });

    state.handleEnterPractice();

    expect(isActive()).toBe(false);
    expect(viewerState.rawViewerMode).toBe("card");
    expect(viewerState.exportContext).toBe("image-export");
    expect(captureScanPracticeChanged).not.toHaveBeenCalled();
  });
});
