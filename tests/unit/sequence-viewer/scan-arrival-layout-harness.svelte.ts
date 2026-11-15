import { vi } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { OrchestratorContext } from "#lib/shared/sequence-viewer/domain/viewer-orchestrator-context.js";
import { createViewerShellLayoutState } from "#lib/shared/sequence-viewer/state/viewer-shell-layout-state.svelte.js";
import type { ViewerMode } from "#lib/shared/sequence-viewer/state/viewer-state.svelte.js";

const sequence = {
  id: "scan-arrival",
  word: "AB",
  steps: [],
} as unknown as SequenceData;

/**
 * The shell layout state for a scan that opened on Side by Side with its
 * animation services held, with a writable `cardReady` standing in for the
 * card's first complete paint.
 */
export function createScanArrivalHarness(startAnimationAfterCard = true) {
  let cardReady = $state(false);
  let viewerMode = $state<ViewerMode>("split");
  const setViewerMode = vi.fn((mode: ViewerMode) => {
    viewerMode = mode;
  });
  const setSplitConfig = vi.fn();
  const ensureInteractiveServices = vi.fn();
  const captureScanViewerOpened = vi.fn();

  const context = {
    viewerState: {
      get viewerMode() {
        return viewerMode;
      },
      exportContext: null,
      videoUploadOpen: false,
      splitConfig: { leftPane: "animation", rightPane: "card" },
      setViewerMode,
      setSplitConfig,
      exitExport: vi.fn(),
      enterExport: vi.fn(),
    },
    editingPane: null,
    get cardReady() {
      return cardReady;
    },
    ensureInteractiveServices,
  } as unknown as OrchestratorContext;

  let layout!: ReturnType<typeof createViewerShellLayoutState>;
  const stop = $effect.root(() => {
    layout = createViewerShellLayoutState(
      {
        getContext: () => context,
        getSequence: () => sequence,
        getIsMobile: () => true,
        getSharePanelOpen: () => false,
        getWorkspaceElement: () => null,
        startInSplit: false,
        startAnimationAfterCard,
      },
      {
        getDeviceDetector: (() => {
          throw new Error("no detector in tests");
        }) as never,
        captureScanSettingChanged: vi.fn(),
        captureScanViewChanged: vi.fn(),
        captureScanViewerOpened,
        captureScanPlaybackChanged: vi.fn(),
      }
    );
  });

  return {
    layout,
    setCardReady(value: boolean) {
      cardReady = value;
    },
    get viewerMode() {
      return viewerMode;
    },
    setViewerMode,
    setSplitConfig,
    ensureInteractiveServices,
    captureScanViewerOpened,
    dispose: stop,
  };
}
