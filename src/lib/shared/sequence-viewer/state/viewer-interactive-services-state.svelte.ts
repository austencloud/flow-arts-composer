import type { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
import type { getAnimationPlaybackController } from "$lib/shared/animation-engine/get-animation-playback-controller";
import type { AnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
import type { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
import type { getSettings } from "$lib/shared/application/state/app-state.svelte";
import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { hashSequenceContent } from "$lib/shared/foundation/services/content-hasher";
import type { getLanSyncCoordinator } from "$lib/shared/lan-sync/get-lan-sync-coordinator";
import type { PlaybackControllerState } from "../components/playback-controller.svelte";
import type { ViewMode } from "../domain/viewer-orchestrator-context";
import type { isViewerReadyToAutoplay } from "../services/viewer-autoplay-readiness";
import type { shouldAutoplayViewer } from "../services/viewer-autoplay-policy";
import type { createViewerState } from "./viewer-state.svelte";

interface ViewerInteractiveServicesInputs {
  modalAnimationState: AnimationPanelState;
  playback: PlaybackControllerState;
  viewerState: ReturnType<typeof createViewerState>;
  cloudBackedScan: boolean;
  getCellsLoaded: () => number;
  getTotalCells: () => number;
  getViewMode: () => ViewMode;
  getPlaybackReleased: () => boolean;
}

interface ViewerInteractiveServicesDependencies {
  getAnimationPlaybackController: typeof getAnimationPlaybackController;
  getHapticFeedback: typeof getHapticFeedback;
  getLanSyncCoordinator: typeof getLanSyncCoordinator;
  initializeLanSync: (
    coordinator: ReturnType<typeof getLanSyncCoordinator>
  ) => void;
  hydrateSequence: (sequence: SequenceData) => Promise<SequenceData | null>;
  preWarmSequence: (sequence: SequenceData, priority: "user-blocking") => void;
  setAnimationPlaybackRef: (
    controller: AnimationPlaybackController | null
  ) => void;
  isViewerReadyToAutoplay: typeof isViewerReadyToAutoplay;
  shouldAutoplayViewer: typeof shouldAutoplayViewer;
  getSettings: typeof getSettings;
}

export function createViewerInteractiveServicesState(
  inputs: ViewerInteractiveServicesInputs,
  dependencies: ViewerInteractiveServicesDependencies
) {
  let animationServicesReady = $state(false);
  let animationLoading = $state(false);
  let playbackController = $state<AnimationPlaybackController | null>(null);
  let hapticService: HapticFeedback | null = null;
  let lastLoadedSequenceId: string | null = null;
  let lastLoadedContent: string | null = null;
  let loadRevision = 0;
  let servicesLoadPromise: Promise<void> | null = null;
  let autoplayReadyTimer: ReturnType<typeof setInterval> | null = null;
  let pausedForPlaybackGate = false;

  function tryCompleteAutoplay(startedAt: number): boolean {
    if (!inputs.getPlaybackReleased()) return false;

    const ready = dependencies.isViewerReadyToAutoplay({
      cloudBackedScan: inputs.cloudBackedScan,
      loadedCells: inputs.getCellsLoaded(),
      totalCells: inputs.getTotalCells(),
      elapsedMs: Date.now() - startedAt,
    });
    if (!ready) return false;

    const systemPrefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const autoplayAllowed = dependencies.shouldAutoplayViewer({
      viewMode: inputs.getViewMode(),
      reducedMotionSetting: dependencies.getSettings().reducedMotion ?? false,
      systemPrefersReducedMotion,
    });
    if (!autoplayAllowed) return true;

    if (!inputs.playback.isPlayingLocal) {
      playbackController?.togglePlayback();
    }

    // The shared controller reports the transition synchronously. Keep the
    // readiness poll alive if a stale owner made the start call a no-op, so a
    // scan never spends its one autoplay attempt before motion actually began.
    return inputs.playback.isPlayingLocal;
  }

  function ensureInteractiveServices(): void {
    if (animationServicesReady || servicesLoadPromise) return;
    servicesLoadPromise = loadServices().finally(() => {
      servicesLoadPromise = null;
    });
  }

  async function loadServices(): Promise<void> {
    try {
      playbackController = dependencies.getAnimationPlaybackController();
      hapticService = dependencies.getHapticFeedback();

      inputs.playback.setPlaybackController(playbackController);
      inputs.playback.setHapticService(hapticService);
      inputs.playback.setAnimationVisible(
        () => inputs.viewerState.viewerMode !== "card"
      );

      dependencies.initializeLanSync(dependencies.getLanSyncCoordinator());
      animationServicesReady = true;
    } catch (error) {
      console.error(
        "[SequenceViewerOrchestrator] Failed to load services:",
        error
      );
      inputs.modalAnimationState.setError("Failed to load animation services");
    }
  }

  async function initializeAnimation(sequence: SequenceData): Promise<void> {
    if (!playbackController) return;

    const sequenceId = sequence.id || sequence.word || "unknown";
    const content = hashSequenceContent(sequence);
    const revision = ++loadRevision;
    if (sequenceId === lastLoadedSequenceId && content === lastLoadedContent) {
      animationLoading = false;
      inputs.modalAnimationState.setLoading(false);
      return;
    }
    const updating = sequenceId === lastLoadedSequenceId;

    animationLoading = !updating;
    inputs.modalAnimationState.setLoading(!updating);
    inputs.modalAnimationState.setError(null);

    try {
      const loadedSequence = await dependencies.hydrateSequence(sequence);
      if (revision !== loadRevision) return;
      if (!loadedSequence) throw new Error("Failed to load sequence");

      if (updating) {
        playbackController.updateSequenceData(loadedSequence);
        lastLoadedContent = content;
        return;
      }

      if (!inputs.cloudBackedScan) {
        dependencies.preWarmSequence(loadedSequence, "user-blocking");
      }

      inputs.modalAnimationState.setShouldLoop(true);
      inputs.modalAnimationState.setPlaybackMode("continuous");
      const initialized = playbackController.initialize(
        loadedSequence,
        inputs.modalAnimationState
      );
      if (!initialized) throw new Error("Failed to initialize playback");

      dependencies.setAnimationPlaybackRef(playbackController);
      lastLoadedSequenceId = sequenceId;
      lastLoadedContent = content;
      inputs.modalAnimationState.setSequenceData(loadedSequence);
      playbackController.setSpeed(inputs.playback.bpmLocal / 60);

      const startedAt = Date.now();
      if (autoplayReadyTimer !== null) clearInterval(autoplayReadyTimer);

      // QR startup is intentionally deferred until the complete card has
      // painted. At that point readiness is already true, so begin the visible
      // motion now instead of making the first impression wait on a browser
      // timer that mobile webviews may throttle. Other viewer paths retain the
      // readiness poll while their cells are still settling.
      if (!tryCompleteAutoplay(startedAt)) {
        autoplayReadyTimer = setInterval(() => {
          if (!tryCompleteAutoplay(startedAt)) return;

          clearInterval(autoplayReadyTimer!);
          autoplayReadyTimer = null;
        }, 50);
      }
    } catch (error) {
      if (revision !== loadRevision) return;
      console.warn(
        "[SequenceViewerOrchestrator] Animation not available:",
        error
      );
      inputs.modalAnimationState.setError("Animation data not available");
    } finally {
      if (revision === loadRevision) {
        animationLoading = false;
        inputs.modalAnimationState.setLoading(false);
      }
    }
  }

  function clearAutoplayTimer(): void {
    if (autoplayReadyTimer === null) return;
    clearInterval(autoplayReadyTimer);
    autoplayReadyTimer = null;
  }

  function syncPlaybackRelease(released: boolean): void {
    if (!released) {
      if (inputs.playback.isPlayingLocal && playbackController) {
        playbackController.togglePlayback();
        pausedForPlaybackGate = true;
      }
      return;
    }

    // A failed scan hands the existing viewer back to the user. Resume only
    // when this gate itself paused that viewer; replacement viewers use their
    // normal autoplay readiness poll.
    if (
      pausedForPlaybackGate &&
      !inputs.playback.isPlayingLocal &&
      playbackController
    ) {
      playbackController.togglePlayback();
      pausedForPlaybackGate = false;
    }
  }

  return {
    get animationServicesReady() {
      return animationServicesReady;
    },
    get animationLoading() {
      return animationLoading;
    },
    get playbackController() {
      return playbackController;
    },
    get hapticService() {
      return hapticService;
    },
    ensureInteractiveServices,
    initializeAnimation,
    clearAutoplayTimer,
    syncPlaybackRelease,
  };
}

export type ViewerInteractiveServicesState = ReturnType<
  typeof createViewerInteractiveServicesState
>;
