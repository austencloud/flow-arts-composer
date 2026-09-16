import type { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
import type { VideoOpener } from "$lib/shared/share/domain/video-opener";
import type { getExportOptionsState } from "$lib/shared/animation-panel/state/export-options-state.svelte";
import type {
  AnimationPanelState,
  PlaybackMode,
} from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
import type { VideoExportProgress } from "$lib/shared/compose/domain/video-export-types";
import type { ExportRequestOptions } from "$lib/shared/sequence-viewer/components/export-coordinator.svelte";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { ResolvedAutoLayout } from "$lib/shared/render/services/container-aware-layout";
import type { TempoPracticeConfig } from "$lib/shared/sequence-viewer/services/tempo-practice-orchestrator";
import type { PracticeViewPrefs } from "$lib/shared/sequence-viewer/state/practice-view-prefs.svelte";
import type { createTempoPracticeState } from "$lib/shared/sequence-viewer/state/tempo-practice-state.svelte";
import type { createViewerState } from "$lib/shared/sequence-viewer/state/viewer-state.svelte";
import type { SequenceViewerVisibilityState } from "$lib/shared/sequence-viewer/state/viewer-visibility-state.svelte";
import type { TunnelViewController } from "$lib/shared/sequence-viewer/tunnel/tunnel-view-controller.svelte";
import type { MandalaViewerController } from "$lib/shared/sequence-viewer/state/mandala-viewer-controller.svelte";
import type { PendingActionType } from "$lib/shared/sequence-viewer/services/pending-action-queue";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { ViewerPropHand } from "$lib/shared/sequence-viewer/state/viewer-prop-visibility-state.svelte";
import type { FanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";
import type { CardPresentation } from "$lib/shared/share/domain/models/card-presentation";
import type { StepMap } from "$lib/shared/video-collaboration/domain/collaborative-video";
import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";
import type {
  ImageCompositionProps,
  PropRenderingProps,
  ViewerPlaybackState,
} from "./viewer-prop-groups";
import type { createViewer3DState } from "$lib/shared/3d/state/viewer-3d-state.svelte";

export type ViewMode = "animation" | "image" | "split";
export type ExportType = "animation" | "image" | "both";
export type PlaybackSource = "animation" | "video";

export interface OrchestratorContext {
  sequence: SequenceData | null;
  effectiveSequence: SequenceData | null;
  hasSequence: boolean;

  isPlayingLocal: boolean;
  currentStepLocal: number;
  bpmLocal: number;
  currentLetter: Letter | null;
  currentStepData: StartPlacementData | StepData | null;
  highlightedStepIndex: number | null;
  animationLoading: boolean;
  cardReady: boolean;
  ensureInteractiveServices: () => void;

  playbackSource: PlaybackSource;
  videoPlaybackBeatIndex: number | null;
  activeStepMap: StepMap | null;
  /** Null when no performance footage is on screen. */
  activeHandLabeling: HandLabeling | null;
  setPlaybackSource: (source: PlaybackSource) => void;
  setActiveStepMap: (beatMap: StepMap | null) => void;
  setActiveHandLabeling: (labeling: HandLabeling | null) => void;
  onVideoTimeUpdate: (currentTime: number) => void;
  modalAnimationState: AnimationPanelState;

  viewMode: ViewMode;
  isMobile: boolean;
  isFullscreen: boolean;
  fullscreenControlsVisible: boolean;
  fullscreenStackVertical: boolean;
  editingPane: "animation" | "image" | "video-upload" | null;

  isExportMode: boolean;
  exportType: ExportType | null;
  exportOptions: ReturnType<typeof getExportOptionsState>;
  isExporting: boolean;
  exportProgress: VideoExportProgress | null;
  exportError: string | null;
  previewBlobUrl: string | null;
  singlePlayDuration: number;

  practiceActive: boolean;
  practiceRunning: boolean;
  practiceCountdown: number;
  practiceState: ReturnType<typeof createTempoPracticeState>;
  practiceViewPrefs: PracticeViewPrefs;
  metronomeEnabled: boolean;
  handleToggleMetronome: () => void;
  mirrorEnabled: boolean;
  handleToggleMirror: () => void;

  collectionPropType?: PropType | null;
  leftPropType: PropType | undefined;
  rightPropType: PropType | undefined;
  catDogModeEnabled: boolean | undefined;
  /** Hand the Props picker edits while cat/dog mode is on. */
  propHand: ViewerPropHand;
  setPropHand: (hand: ViewerPropHand) => void;
  handleCatDogToggle: () => void;
  handlePropTypeChange: (
    propType: PropType,
    hand?: ViewerPropHand | "both"
  ) => void;
  fanAppearance: FanAppearance;
  handleFanAppearanceChange: (appearance: FanAppearance) => void;

  imgShowWord: boolean;
  imgShowStartPos: boolean;
  imgShowDifficulty: boolean;
  imgShowStepNumbers: boolean;
  imgShowNotes: boolean;
  imgCustomNotesText: string;
  imgDarkMode: boolean;

  isSyncToggling: boolean;
  isSyncActive: boolean;
  isSyncConnected: boolean;
  canvasReady: boolean;
  onRenderProgress: (loaded: number, total: number) => void;

  isLoggedIn: boolean;
  isOwned: boolean;
  isOwnedLibraryRecord: boolean;
  isSaved: boolean;
  isSaving: boolean;
  isPublished: boolean;
  isFavorite: boolean;
  handleFavoriteToggle: () => void;
  handlePublishAction: () => Promise<void>;
  handleUnpublishAction: () => Promise<void>;
  saveCardPresentation: (presentation: CardPresentation) => Promise<boolean>;

  playbackMode: PlaybackMode;
  handlePlaybackModeChange: (mode: PlaybackMode) => void;
  handlePlaybackToggle: () => void;
  handleBpmChange: (bpm: number) => void;
  handleStepClick: (stepIndex: number) => void;
  handleProgressBarSeek: (targetStep: number) => void;
  handleProgressBarScrubStart: () => void;
  handleProgressBarScrubEnd: () => void;
  enterEditMode: (pane: "animation" | "image" | "video-upload") => void;
  exitEditMode: () => void;
  enterFullscreen: () => void;
  immersive: boolean;
  toggleImmersive: (host: HTMLElement | null) => Promise<void> | void;
  exitFullscreen: () => void;
  handleFullscreenTap: () => void;
  /** Resolves `false` when the export was refused before any render started. */
  handleExport: (options?: ExportRequestOptions) => Promise<boolean>;
  resolvedCardAutoLayout: ResolvedAutoLayout | null;
  setResolvedCardAutoLayout: (layout: ResolvedAutoLayout | null) => void;
  handleCanvasReady: (canvas: HTMLCanvasElement | null) => void;
  /** Captures the already-mounted 2D animation surface for share presentation. */
  captureAnimationPreview: () => string;
  /**
   * The image a shared 2D clip opens with, for the sheet's stage and as the
   * hold baked into the render. Empty in 3D, where no opener is offered.
   */
  captureVideoOpener: (kind: VideoOpener) => Promise<string>;
  handleSyncToggle: () => Promise<void>;
  handleOpenInCompose: (
    preset?: "stagger" | "mirror" | "combo-export"
  ) => Promise<void>;
  handleEdit: () => void;
  handleSave: () => Promise<void>;
  handleVideoUpload: () => Promise<void>;
  handleShare: () => void;
  handleCopyLink: () => Promise<boolean>;
  /** Canonical share link for the current sequence. Seeds share-sheet captions. */
  getShareUrl: () => string;
  handleDelete: () => Promise<void>;
  handleOpenInBrowser: (pendingType?: PendingActionType | null) => void;
  invokeGatedAction: (
    type: PendingActionType,
    realHandler: (() => void) | (() => Promise<void>) | undefined
  ) => void;
  openSignInPrompt: () => void;
  handleUnifiedDarkModeToggle: () => void;
  handlePracticeStart: () => void;
  enterPracticeMode: () => void;
  exitPracticeMode: () => void;
  handlePracticeStepLevel: (dir: 1 | -1) => void;
  handlePracticeToggleHold: () => void;
  handlePracticeSetConfig: (patch: Partial<TempoPracticeConfig>) => void;
  handlePracticeStop: () => void;
  onClose: () => void;
  stepHalfBeatBackward: () => void;
  stepHalfBeatForward: () => void;
  stepFullBeatBackward: () => void;
  stepFullBeatForward: () => void;
  restartToStart: () => void;
  handleCancelExport: () => void;
  handleRetryExport: () => void;
  dismissPreview: () => void;
  saveExportedVideo: () => Promise<void>;

  playbackController: AnimationPlaybackController | null;
  /** Resolves `false` when the render was refused before it began. */
  handleArtExport: (args: {
    artType: "mandala" | "tunnel";
    controller: TunnelViewController;
    mandalaController: MandalaViewerController;
  }) => Promise<boolean>;

  splitPanePlayback: ViewerPlaybackState;
  splitPaneImageComposition: ImageCompositionProps;
  splitPanePropRendering: PropRenderingProps;

  renderMode: "2d" | "3d";
  viewer3DState: ReturnType<typeof createViewer3DState>;
  countdownValue: number;
  isRecording3D: boolean;
  recordingElapsed: number;
  handleStopRecording: () => void;
  /** Non-null while the render card is up: recording has stopped and the
   *  offline render is waiting on a quality choice. */
  pendingFilmRender: { durationSeconds: number } | null;
  handleConfirmFilmRender: () => void;
  handleDiscardFilmRender: () => void;

  viewerState: ReturnType<typeof createViewerState>;
  viewerVisibility: SequenceViewerVisibilityState;
}
