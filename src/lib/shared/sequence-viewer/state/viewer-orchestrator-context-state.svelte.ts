import type { AnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { ResolvedAutoLayout } from "$lib/shared/render/services/container-aware-layout";
import type { PendingActionType } from "../services/pending-action-queue";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { ViewerPropHand } from "./viewer-prop-visibility-state.svelte";
import type { FanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";
import type { TempoPracticeConfig } from "../services/tempo-practice-orchestrator";
import type {
  ExportType,
  OrchestratorContext,
  ViewMode,
} from "../domain/viewer-orchestrator-context";
import type { PlaybackControllerState } from "../components/playback-controller.svelte";
import type { ExportCoordinatorState } from "../components/export-coordinator.svelte";
import type { ImageCompositionSyncState } from "../components/image-composition-sync.svelte";
import type { ViewerInteractiveServicesState } from "./viewer-interactive-services-state.svelte";
import type { ViewerPlaybackPresentationState } from "./viewer-playback-presentation-state.svelte";
import type { ViewerLanSyncState } from "./viewer-lan-sync-state.svelte";
import type { createFullscreenController } from "$lib/shared/fullscreen/state/fullscreen-controller.svelte";
import type { createLibraryActionHandler } from "./library-action-handler.svelte";
import type { createPracticeViewPrefs } from "./practice-view-prefs.svelte";
import type { createViewerState } from "./viewer-state.svelte";
import type { SequenceViewerVisibilityState } from "./viewer-visibility-state.svelte";
import type { createViewer3DState } from "$lib/shared/3d/state/viewer-3d-state.svelte";
import { capturePosterFrame } from "../tunnel/tunnel-poster";

type FullscreenState = ReturnType<typeof createFullscreenController>;
type LibraryActions = ReturnType<typeof createLibraryActionHandler>;
type PracticeViewPrefs = ReturnType<typeof createPracticeViewPrefs>;
type ViewerState = ReturnType<typeof createViewerState>;
type Viewer3DState = ReturnType<typeof createViewer3DState>;

interface ViewerOrchestratorContextHandlers {
  setResolvedCardAutoLayout: (layout: ResolvedAutoLayout | null) => void;
  onRenderProgress: (loaded: number, total: number) => void;
  handlePropTypeChange: (
    propType: PropType,
    hand?: ViewerPropHand | "both"
  ) => void;
  setPropHand: (hand: ViewerPropHand) => void;
  handleCatDogToggle: () => void;
  handleFanAppearanceChange: (appearance: FanAppearance) => void;
  enterEditMode: (pane: "animation" | "image" | "video-upload") => void;
  exitEditMode: () => void;
  handleExport: OrchestratorContext["handleExport"];
  handleArtExport: OrchestratorContext["handleArtExport"];
  handleOpenInCompose: OrchestratorContext["handleOpenInCompose"];
  handleEdit: () => void;
  handleVideoUpload: () => Promise<void>;
  handleShare: () => void;
  handleCopyLink: () => Promise<boolean>;
  getShareUrl: () => string;
  handleOpenInBrowser: (pendingType?: PendingActionType | null) => void;
  invokeGatedAction: OrchestratorContext["invokeGatedAction"];
  openSignInPrompt: () => void;
  handleUnifiedDarkModeToggle: () => void;
  handlePracticeStart: () => void;
  enterPracticeMode: () => void;
  handleBpmChange: (bpm: number) => void;
  handleStepClick: (stepIndex: number) => void;
  handleClose: () => void;
}

interface ViewerOrchestratorContextInputs {
  modalAnimationState: AnimationPanelState;
  playback: PlaybackControllerState;
  presentation: ViewerPlaybackPresentationState;
  interactive: ViewerInteractiveServicesState;
  lanSync: ViewerLanSyncState;
  fullscreen: FullscreenState;
  exportCoordinator: ExportCoordinatorState;
  imageComposition: ImageCompositionSyncState;
  libraryActions: LibraryActions;
  practiceViewPrefs: PracticeViewPrefs;
  viewerState: ViewerState;
  viewerVisibility: SequenceViewerVisibilityState;
  viewer3DState: Viewer3DState;
  handlers: ViewerOrchestratorContextHandlers;
  getSequence: () => SequenceData | null;
  getEffectiveSequence: () => SequenceData | null;
  getViewMode: () => ViewMode;
  getIsMobile: () => boolean;
  getFullscreenStackVertical: () => boolean;
  getEditingPane: () => "animation" | "image" | "video-upload" | null;
  getExportType: () => ExportType | null;
  getSinglePlayDuration: () => number;
  getCardReady: () => boolean;
  getResolvedCardAutoLayout: () => ResolvedAutoLayout | null;
  getIsHandPath: () => boolean;
  getCollectionPropType?: () => PropType | null | undefined;
  getLeftPropType: () => PropType;
  getRightPropType: () => PropType;
  getCatDogModeEnabled: () => boolean;
  getPropHand: () => ViewerPropHand;
  getFanAppearance: () => FanAppearance;
  getIsLoggedIn: () => boolean;
  getIsOwned: () => boolean;
  getIsPublished: () => boolean;
}

export function createViewerOrchestratorContextState(
  inputs: ViewerOrchestratorContextInputs
) {
  const value = $derived.by(
    (): OrchestratorContext => ({
      sequence: inputs.getSequence(),
      effectiveSequence: inputs.getEffectiveSequence(),
      hasSequence: inputs.getEffectiveSequence() !== null,

      isPlayingLocal: inputs.playback.isPlayingLocal,
      currentStepLocal: inputs.playback.currentStepLocal,
      bpmLocal: inputs.playback.bpmLocal,
      currentLetter: inputs.getIsHandPath()
        ? null
        : inputs.presentation.currentLetter,
      currentStepData: inputs.presentation.currentStepData,
      highlightedStepIndex: inputs.presentation.highlightedStepIndex,
      animationLoading: inputs.interactive.animationLoading,
      cardReady: inputs.getCardReady(),
      ensureInteractiveServices: inputs.interactive.ensureInteractiveServices,
      modalAnimationState: inputs.modalAnimationState,

      playbackSource: inputs.presentation.playbackSource,
      videoPlaybackBeatIndex: inputs.presentation.videoPlaybackBeatIndex,
      activeStepMap: inputs.presentation.activeStepMap,
      activeHandLabeling: inputs.presentation.activeHandLabeling,
      setPlaybackSource: inputs.presentation.setPlaybackSource,
      setActiveStepMap: inputs.presentation.setActiveStepMap,
      setActiveHandLabeling: inputs.presentation.setActiveHandLabeling,
      onVideoTimeUpdate: inputs.presentation.handleVideoTimeUpdate,

      viewMode: inputs.getViewMode(),
      isMobile: inputs.getIsMobile(),
      isFullscreen: inputs.fullscreen.isFullscreen,
      fullscreenControlsVisible: inputs.fullscreen.fullscreenControlsVisible,
      fullscreenStackVertical: inputs.getFullscreenStackVertical(),
      editingPane: inputs.getEditingPane(),

      isExportMode: inputs.getEditingPane() !== null,
      exportType: inputs.getExportType(),
      exportOptions: inputs.exportCoordinator.exportOptions,
      isExporting: inputs.exportCoordinator.isExporting,
      exportProgress: inputs.exportCoordinator.exportProgress,
      exportError: inputs.exportCoordinator.exportError,
      previewBlobUrl: inputs.exportCoordinator.previewBlobUrl,
      singlePlayDuration: inputs.getSinglePlayDuration(),

      practiceActive: inputs.playback.practiceActive,
      practiceRunning: inputs.playback.practiceRunning,
      practiceCountdown: inputs.playback.practiceCountdown,
      practiceState: inputs.playback.practiceState,
      practiceViewPrefs: inputs.practiceViewPrefs,
      metronomeEnabled: inputs.playback.metronomeEnabled,
      handleToggleMetronome: inputs.playback.handleToggleMetronome,
      mirrorEnabled: inputs.playback.mirrorEnabled,
      handleToggleMirror: inputs.playback.handleToggleMirror,

      collectionPropType: inputs.getCollectionPropType?.() ?? null,
      leftPropType: inputs.getLeftPropType(),
      rightPropType: inputs.getRightPropType(),
      catDogModeEnabled: inputs.getCatDogModeEnabled(),
      propHand: inputs.getPropHand(),
      setPropHand: inputs.handlers.setPropHand,
      handleCatDogToggle: inputs.handlers.handleCatDogToggle,
      handlePropTypeChange: inputs.handlers.handlePropTypeChange,
      fanAppearance: inputs.getFanAppearance(),
      handleFanAppearanceChange: inputs.handlers.handleFanAppearanceChange,

      imgShowWord: inputs.imageComposition.imgShowWord,
      imgShowStepNumbers: inputs.imageComposition.imgShowStepNumbers,
      imgShowStartPos: inputs.imageComposition.imgShowStartPos,
      imgShowDifficulty: inputs.imageComposition.imgShowDifficulty,
      imgShowNotes: inputs.imageComposition.imgShowNotes,
      imgCustomNotesText: inputs.imageComposition.imgCustomNotesText,
      imgDarkMode: inputs.imageComposition.imgDarkMode,

      isSyncToggling: inputs.lanSync.isSyncToggling,
      isSyncActive: inputs.lanSync.isActive,
      isSyncConnected: inputs.lanSync.isConnected,

      canvasReady:
        (inputs.viewer3DState.renderMode === "3d"
          ? !!inputs.viewer3DState.webglCanvas &&
            !!inputs.viewer3DState.threlteRenderer &&
            !!inputs.viewer3DState.threlteScene &&
            !!inputs.viewer3DState.threlteCamera &&
            !!inputs.viewer3DState.threlteRunFrame &&
            !!inputs.viewer3DState.threltePauseAutoLoop &&
            !!inputs.viewer3DState.threlteResumeAutoLoop
          : !!inputs.exportCoordinator.animationCanvas) &&
        !!inputs.interactive.playbackController,
      onRenderProgress: inputs.handlers.onRenderProgress,

      renderMode: inputs.viewer3DState.renderMode,
      viewer3DState: inputs.viewer3DState,
      countdownValue: inputs.exportCoordinator.countdownValue,
      isRecording3D: inputs.exportCoordinator.isRecording3D,
      recordingElapsed: inputs.exportCoordinator.recordingElapsed,
      handleStopRecording: inputs.exportCoordinator.handleStopRecording,
      pendingFilmRender: inputs.exportCoordinator.pendingFilmRender,
      handleConfirmFilmRender: inputs.exportCoordinator.handleConfirmFilmRender,
      handleDiscardFilmRender: inputs.exportCoordinator.handleDiscardFilmRender,

      isLoggedIn: inputs.getIsLoggedIn(),
      isOwned: inputs.getIsOwned(),
      isOwnedLibraryRecord: inputs.libraryActions.isOwnedLibraryRecord,
      isSaved: inputs.libraryActions.isSaved,
      isSaving: inputs.libraryActions.isSaving,
      isPublished: inputs.getIsPublished(),
      isFavorite: inputs.libraryActions.isFavorite,
      handleFavoriteToggle: inputs.libraryActions.handleFavoriteToggle,
      handlePublishAction: inputs.libraryActions.handlePublishAction,
      handleUnpublishAction: inputs.libraryActions.handleUnpublishAction,
      saveCardPresentation: inputs.libraryActions.saveCardPresentation,

      playbackMode: inputs.modalAnimationState.playbackMode,
      handlePlaybackModeChange: inputs.playback.handlePlaybackModeChange,
      handlePlaybackToggle: inputs.playback.handlePlaybackToggle,
      handleProgressBarSeek: inputs.playback.handleProgressBarSeek,
      handleProgressBarScrubStart: inputs.playback.handleProgressBarScrubStart,
      handleProgressBarScrubEnd: inputs.playback.handleProgressBarScrubEnd,
      handleBpmChange: inputs.handlers.handleBpmChange,
      handleStepClick: inputs.handlers.handleStepClick,
      enterEditMode: inputs.handlers.enterEditMode,
      exitEditMode: inputs.handlers.exitEditMode,
      enterFullscreen: inputs.fullscreen.enterFullscreen,
      immersive: inputs.fullscreen.immersive,
      toggleImmersive: inputs.fullscreen.toggleImmersive,
      exitFullscreen: inputs.fullscreen.exitFullscreen,
      handleFullscreenTap: inputs.fullscreen.handleFullscreenTap,
      handleExport: inputs.handlers.handleExport,
      resolvedCardAutoLayout: inputs.getResolvedCardAutoLayout(),
      setResolvedCardAutoLayout: inputs.handlers.setResolvedCardAutoLayout,
      handleCanvasReady: inputs.exportCoordinator.handleCanvasReady,
      captureAnimationPreview: () => {
        const canvas =
          inputs.viewer3DState.renderMode === "3d"
            ? inputs.viewer3DState.webglCanvas
            : null;
        return canvas
          ? capturePosterFrame(canvas, {
              width: Math.round(
                canvas.width *
                  Math.min(1, 960 / Math.max(canvas.width, canvas.height))
              ),
              height: Math.round(
                canvas.height *
                  Math.min(1, 960 / Math.max(canvas.width, canvas.height))
              ),
            })
          : inputs.exportCoordinator.captureAnimationPreview();
      },
      captureVideoOpener: (kind) =>
        inputs.viewer3DState.renderMode === "3d"
          ? Promise.resolve("")
          : inputs.exportCoordinator.captureVideoOpener(
              kind,
              inputs.interactive.playbackController,
              inputs.modalAnimationState,
              inputs.getEffectiveSequence()
            ),
      handleSyncToggle: inputs.lanSync.handleSyncToggle,
      handleOpenInCompose: inputs.handlers.handleOpenInCompose,
      handleEdit: inputs.handlers.handleEdit,
      handleSave: inputs.libraryActions.handleSave,
      handleVideoUpload: inputs.handlers.handleVideoUpload,
      handleShare: inputs.handlers.handleShare,
      handleCopyLink: inputs.handlers.handleCopyLink,
      getShareUrl: inputs.handlers.getShareUrl,
      handleDelete: inputs.libraryActions.handleDelete,
      handleOpenInBrowser: inputs.handlers.handleOpenInBrowser,
      invokeGatedAction: inputs.handlers.invokeGatedAction,
      openSignInPrompt: inputs.handlers.openSignInPrompt,
      handleUnifiedDarkModeToggle: inputs.handlers.handleUnifiedDarkModeToggle,
      handlePracticeStart: inputs.handlers.handlePracticeStart,
      enterPracticeMode: inputs.handlers.enterPracticeMode,
      exitPracticeMode: inputs.playback.exitPracticeMode,
      handlePracticeStepLevel: inputs.playback.handlePracticeStepLevel,
      handlePracticeToggleHold: inputs.playback.handlePracticeToggleHold,
      handlePracticeSetConfig: (patch: Partial<TempoPracticeConfig>) =>
        inputs.playback.handlePracticeSetConfig(patch),
      handlePracticeStop: inputs.playback.handlePracticeStop,
      onClose: inputs.handlers.handleClose,
      stepHalfBeatBackward: inputs.playback.stepHalfBeatBackward,
      stepHalfBeatForward: inputs.playback.stepHalfBeatForward,
      stepFullBeatBackward: inputs.playback.stepFullBeatBackward,
      stepFullBeatForward: inputs.playback.stepFullBeatForward,
      restartToStart: inputs.playback.restartToStart,
      handleCancelExport: inputs.exportCoordinator.handleCancelExport,
      handleRetryExport: () =>
        inputs.exportCoordinator.handleRetryExport(
          inputs.handlers.handleExport
        ),
      dismissPreview: inputs.exportCoordinator.dismissPreview,
      saveExportedVideo: () =>
        inputs.exportCoordinator.saveExportedVideo(
          inputs.getEffectiveSequence()
        ),

      playbackController: inputs.interactive.playbackController,
      handleArtExport: inputs.handlers.handleArtExport,

      splitPanePlayback: {
        animationState: inputs.modalAnimationState,
        animationLoading: inputs.interactive.animationLoading,
        currentStep: inputs.playback.currentStepLocal,
        isPlaying: inputs.playback.isPlayingLocal,
        currentLetter: inputs.getIsHandPath()
          ? null
          : inputs.presentation.currentLetter,
        currentStepData: inputs.presentation.currentStepData,
        highlightedStepIndex: inputs.presentation.highlightedStepIndex,
        getPlaybackController: () => inputs.interactive.playbackController,
      },
      splitPaneImageComposition: {
        showWord: inputs.imageComposition.imgShowWord,
        showStepNumbers: inputs.imageComposition.imgShowStepNumbers,
        showDifficulty: inputs.getIsHandPath()
          ? false
          : inputs.imageComposition.imgShowDifficulty,
        showStartPos: inputs.imageComposition.imgShowStartPos,
        showNotes: inputs.imageComposition.imgShowNotes,
        customNotesText: inputs.imageComposition.imgCustomNotesText,
        showQRCode: inputs.imageComposition.imgShowQRCode,
        showMandala: inputs.imageComposition.imgShowMandala,
        showLoopGlyph:
          !inputs.getIsHandPath() && inputs.imageComposition.imgShowLoopGlyph,
        handPathMode: inputs.getIsHandPath(),
        darkMode: inputs.imageComposition.imgDarkMode,
        columnCount: null,
        forceContain: false,
      },
      splitPanePropRendering: {
        leftPropType: inputs.getLeftPropType(),
        rightPropType: inputs.getRightPropType(),
        catDogModeEnabled: inputs.getCatDogModeEnabled(),
        fanAppearance: inputs.getFanAppearance(),
      },

      viewerState: inputs.viewerState,
      viewerVisibility: inputs.viewerVisibility,
    })
  );

  return {
    get value() {
      return value;
    },
  };
}
