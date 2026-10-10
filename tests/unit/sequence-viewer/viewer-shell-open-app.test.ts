import { describe, expect, it, vi } from "vitest";
import { createViewerShellInteractionState } from "#lib/shared/sequence-viewer/state/viewer-shell-interaction-state.svelte.js";

function makeState() {
  const openExternalHref = vi.fn();
  const navigate = vi.fn();
  const captureScanAction = vi.fn();
  const endScanViewerSession = vi.fn();
  const state = createViewerShellInteractionState(
    {
      getContext: () =>
        ({
          isExporting: false,
          exportProgress: null,
          playback: { isPlaying: false, currentStep: 0, bpmLocal: 60 },
        }) as never,
      getExportOverrides: () => undefined,
      getOnRemix: () => undefined,
      getOpenAppHref: () =>
        "intent://tkaflowarts.com/store/open#Intent;scheme=https;end",
      getOnAccountSignIn: () => undefined,
      onClose: vi.fn(),
    },
    {
      navigate,
      openExternalHref,
      captureScanAction,
      captureScanExport: vi.fn(),
      captureScanPlaybackChanged: vi.fn(),
      captureScanPracticeChanged: vi.fn(),
      captureScanSettingChanged: vi.fn(),
      captureScanViewChanged: vi.fn(),
      endScanViewerSession,
      registerScanSessionCleanup: vi.fn(() => vi.fn()),
    }
  );
  return { state, openExternalHref, navigate, captureScanAction };
}

describe("viewer Open Flow Arts Composer handoff", () => {
  it.each([
    ["overflow", "handleOpenApp"],
    ["account_entry", "handleAccountOpenApp"],
  ] as const)("launches the target from %s", (source, method) => {
    const { state, openExternalHref, navigate, captureScanAction } =
      makeState();

    state[method]();

    expect(openExternalHref).toHaveBeenCalledWith(
      "intent://tkaflowarts.com/store/open#Intent;scheme=https;end"
    );
    expect(navigate).not.toHaveBeenCalled();
    expect(captureScanAction).toHaveBeenCalledWith("open_app", { source });
  });
});
