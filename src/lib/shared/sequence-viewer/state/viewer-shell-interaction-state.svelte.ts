import type { VideoExportProgress } from "$lib/shared/compose/domain/video-export-types";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { ViewerPropHand } from "./viewer-prop-visibility-state.svelte";
import type {
  ScanAnalyticsValue,
  ScanExportStage,
} from "$lib/shared/analytics/scan-analytics";
import type {
  ViewerControlEventOptions,
  ViewerControlValue,
} from "../domain/viewer-control-analytics";
import type { TempoPracticeConfig } from "../services/tempo-practice-orchestrator";
import { buildHeaderActions } from "../services/viewer-actions";
import {
  buildCardExportAnalyticsConfig,
  buildPracticeConfigProperties,
  buildVideoExportAnalyticsConfig,
} from "../services/viewer-shell-model";
import type { OrchestratorContext } from "../domain/viewer-orchestrator-context";
import type { VideoPlayheadBridge } from "../context/video-playhead-context";
import type {
  ExportContext,
  SplitConfig,
  ViewerMode,
} from "./viewer-state.svelte";

interface PracticeReturnState {
  viewerMode: ViewerMode;
  splitConfig: SplitConfig;
  exportContext: ExportContext;
}

export interface ViewerShellExportOverrides {
  onVideoExport: () => void;
  onCardExport: () => void;
  videoBusy: boolean;
  videoProgress: VideoExportProgress | null;
  cardBusy: boolean;
  showInlineProgress?: boolean;
}

export interface ViewerShellGuideAction {
  label: string;
  onSelect: () => void;
}

interface ViewerShellInteractionInputs {
  getContext: () => OrchestratorContext;
  /**
   * The performance video and the notation share one playhead when a mapped
   * video is on screen. Absent for hosts that render no video pane.
   */
  getVideoPlayhead?: () => VideoPlayheadBridge | null;
  getExportOverrides: () => ViewerShellExportOverrides | undefined;
  getOnRemix: () => (() => void) | undefined;
  getOpenAppHref: () => string | undefined;
  getOnAccountSignIn: () => (() => void) | undefined;
  onClose: () => void;
}

interface ViewerShellInteractionDependencies {
  navigate: (href: string) => void | Promise<void>;
  openExternalHref: (href: string) => void;
  captureScanAction: typeof import("$lib/shared/analytics/scan-analytics").captureScanAction;
  captureScanExport: typeof import("$lib/shared/analytics/scan-analytics").captureScanExport;
  captureScanPlaybackChanged: typeof import("$lib/shared/analytics/scan-analytics").captureScanPlaybackChanged;
  captureScanPracticeChanged: typeof import("$lib/shared/analytics/scan-analytics").captureScanPracticeChanged;
  captureScanSettingChanged: typeof import("$lib/shared/analytics/scan-analytics").captureScanSettingChanged;
  captureScanViewChanged: typeof import("$lib/shared/analytics/scan-analytics").captureScanViewChanged;
  endScanViewerSession: typeof import("$lib/shared/analytics/scan-analytics").endScanViewerSession;
  registerScanSessionCleanup: typeof import("$lib/shared/analytics/scan-analytics").registerScanSessionCleanup;
}

export function createViewerShellInteractionState(
  inputs: ViewerShellInteractionInputs,
  dependencies: ViewerShellInteractionDependencies
) {
  const activeArtExports = new Map<
    "mandala" | "tunnel",
    Record<string, ScanAnalyticsValue>
  >();
  let deleteConfirmOpen = $state(false);
  let isDeleting = $state(false);
  let practiceReturnState: PracticeReturnState | null = null;

  const headerActions = $derived(
    buildHeaderActions(inputs.getContext(), "full", {
      onDeleteRequest: () => (deleteConfirmOpen = true),
    })
  );
  const videoBusy = $derived(
    inputs.getExportOverrides()?.videoBusy ?? inputs.getContext().isExporting
  );
  const videoProgress = $derived(
    inputs.getExportOverrides()?.videoProgress ??
      inputs.getContext().exportProgress
  );
  const cardBusy = $derived(
    inputs.getExportOverrides()?.cardBusy ?? inputs.getContext().isExporting
  );
  const showInlineProgress = $derived(
    inputs.getExportOverrides()?.showInlineProgress ?? true
  );

  function mount(): () => void {
    return dependencies.registerScanSessionCleanup((reason) => {
      for (const [artType, properties] of activeArtExports) {
        dependencies.captureScanExport(artType, "canceled", {
          ...properties,
          reason,
          user_initiated: false,
        });
      }
      activeArtExports.clear();
    });
  }

  function videoExportAnalyticsConfig(): Record<string, ScanAnalyticsValue> {
    const ctx = inputs.getContext();
    const options = ctx.exportOptions.getVideoOptions();
    return buildVideoExportAnalyticsConfig({
      fps: options.fps,
      loopCount: options.loopCount,
      resolution: options.resolution,
      includeStartPlacement: options.includeStartPlacement,
      includeEndHold: options.includeEndHold,
      renderMode: ctx.renderMode,
      playbackMode: ctx.playbackMode,
      leftPropType: ctx.leftPropType,
      rightPropType: ctx.rightPropType,
    });
  }

  function cardExportAnalyticsConfig(): Record<string, ScanAnalyticsValue> {
    const ctx = inputs.getContext();
    return buildCardExportAnalyticsConfig({
      stepCount: ctx.effectiveSequence?.steps?.length ?? 0,
      darkMode: ctx.exportOptions.imageDarkMode,
      includeStartPlacement: ctx.splitPaneImageComposition.showStartPos,
      handPath: ctx.splitPaneImageComposition.handPathMode ?? false,
      leftPropType: ctx.leftPropType,
      rightPropType: ctx.rightPropType,
    });
  }

  /** Resolves when the render settles: false when it was refused or failed
   *  to start, true otherwise. A host override owns its own lifecycle. */
  function handleVideoExport(
    stage: "requested" | "retry" = "requested"
  ): Promise<boolean> {
    dependencies.captureScanExport(
      "video",
      stage,
      videoExportAnalyticsConfig()
    );
    const overrides = inputs.getExportOverrides();
    if (overrides) {
      overrides.onVideoExport();
      return Promise.resolve(true);
    }
    return inputs.getContext().handleExport();
  }

  function handleCardExport(): void {
    dependencies.captureScanExport(
      "card",
      "requested",
      cardExportAnalyticsConfig()
    );
    const overrides = inputs.getExportOverrides();
    if (overrides) overrides.onCardExport();
    else void inputs.getContext().handleExport();
  }

  function handleRemix(): void {
    dependencies.captureScanAction("remix");
    dependencies.endScanViewerSession("remix");
    const onRemix = inputs.getOnRemix();
    const ctx = inputs.getContext();
    if (onRemix) onRemix();
    else ctx.invokeGatedAction("remix", ctx.handleEdit);
  }

  function recordOpenApp(source: "overflow" | "account_entry"): void {
    dependencies.captureScanAction("open_app", { source });
    dependencies.endScanViewerSession("open_app");
  }

  function handleOpenApp(): void {
    const href = inputs.getOpenAppHref();
    if (!href) return;
    recordOpenApp("overflow");
    dependencies.openExternalHref(href);
  }

  function handleAccountOpenApp(): void {
    const href = inputs.getOpenAppHref();
    if (!href) return;
    recordOpenApp("account_entry");
    dependencies.openExternalHref(href);
  }

  function handleAccountSignIn(): void {
    dependencies.captureScanAction("signin_from_chip");
    inputs.getOnAccountSignIn()?.();
  }

  function handleClose(): void {
    dependencies.endScanViewerSession("close_button");
    inputs.onClose();
  }

  function handleFavoriteToggle(): void {
    const ctx = inputs.getContext();
    dependencies.captureScanAction("favorite", {
      value: !ctx.isFavorite,
      gated: !ctx.isLoggedIn,
    });
    ctx.invokeGatedAction("favorite", ctx.handleFavoriteToggle);
  }

  function handleSave(): void {
    const ctx = inputs.getContext();
    dependencies.captureScanAction("save", { gated: !ctx.isLoggedIn });
    ctx.invokeGatedAction("save", ctx.handleSave);
  }

  function handleHeaderVideoUpload(): void {
    dependencies.captureScanAction("video_upload");
    void headerActions.onVideoUpload?.();
  }

  function handleGalleryVideoUpload(): void {
    dependencies.captureScanAction("video_upload");
    void inputs.getContext().handleVideoUpload();
  }

  /**
   * SequenceVideos raises this when it leaves browsing for its uploader or its
   * timing editor. The viewer answers by pausing playback and announcing the
   * change; the surface itself no longer moves, so this changes no layout.
   */
  function handleVideoWorkOpenChange(open: boolean): void {
    if (open) {
      handleGalleryVideoUpload();
      return;
    }
    handleVideoUploadClose();
  }

  function handlePublish(): void {
    dependencies.captureScanAction("publish");
    void headerActions.onPublish?.();
  }

  function handleUnpublish(): void {
    dependencies.captureScanAction("unpublish");
    void headerActions.onUnpublish?.();
  }

  function handleDeleteRequest(): void {
    dependencies.captureScanAction("delete_requested");
    headerActions.onDeleteRequest?.();
  }

  function handleEnterPractice(): void {
    const ctx = inputs.getContext();
    if (ctx.practiceActive) return;

    const previousMode = ctx.viewerState.viewerMode;
    practiceReturnState = {
      viewerMode: ctx.viewerState.rawViewerMode,
      splitConfig: { ...ctx.viewerState.rawSplitConfig },
      exportContext: ctx.viewerState.exportContext,
    };
    ctx.enterPracticeMode();
    dependencies.captureScanViewChanged(
      previousMode,
      ctx.viewerState.viewerMode,
      "practice_enter",
      { count: false }
    );
    dependencies.captureScanPracticeChanged("entered");
  }

  function handleExitPractice(): void {
    const ctx = inputs.getContext();
    if (!ctx.practiceActive) return;

    dependencies.captureScanPracticeChanged("exited", {
      was_running: ctx.practiceRunning,
      bpm: ctx.bpmLocal,
    });
    ctx.exitPracticeMode();

    const returnState = practiceReturnState;
    practiceReturnState = null;
    // A mode choice made while Practice was open is newer intent than the
    // surface that opened Practice. Only restore when Practice still owns its
    // split surface, so leaving Practice never sends someone back from a view
    // they deliberately selected.
    if (!returnState || ctx.viewerState.rawViewerMode !== "split") return;

    ctx.viewerState.setSplitConfig(returnState.splitConfig);
    ctx.viewerState.setViewerMode(returnState.viewerMode);
    ctx.viewerState.setExportContext(returnState.exportContext);
  }

  function handlePlaybackToggle(source: string): void {
    const ctx = inputs.getContext();
    const wasPlaying = ctx.isPlayingLocal;
    ctx.handlePlaybackToggle();
    dependencies.captureScanPlaybackChanged({
      action: wasPlaying ? "pause" : "play",
      previous_value: wasPlaying,
      value: !wasPlaying,
      source,
      bpm: ctx.bpmLocal,
      step: ctx.currentStepLocal,
    });
  }

  function handleSystemPlaybackChange(
    playing: boolean,
    source: "system_3d_loading" | "system_studio_handoff"
  ): void {
    const ctx = inputs.getContext();
    const previous = ctx.isPlayingLocal;
    if (previous === playing) return;
    ctx.handlePlaybackToggle();
    dependencies.captureScanPlaybackChanged({
      action: playing ? "play" : "pause",
      previous_value: previous,
      value: playing,
      source,
      bpm: ctx.bpmLocal,
      step: ctx.currentStepLocal,
      count: false,
    });
  }

  function handleBpmChange(bpm: number, source: string): void {
    const ctx = inputs.getContext();
    const previous = ctx.bpmLocal;
    ctx.handleBpmChange(bpm);
    dependencies.captureScanSettingChanged({
      group: "playback",
      setting: "bpm",
      previous_value: previous,
      value: bpm,
      source,
      coalesce: true,
    });
  }

  function handlePropChange(
    propType: PropType,
    source: string,
    hand: ViewerPropHand | "both" = "both"
  ): void {
    const ctx = inputs.getContext();
    const previousLeft = ctx.leftPropType ? String(ctx.leftPropType) : null;
    const previousRight = ctx.rightPropType ? String(ctx.rightPropType) : null;
    ctx.handlePropTypeChange(propType, hand);
    const left = ctx.leftPropType ? String(ctx.leftPropType) : null;
    const right = ctx.rightPropType ? String(ctx.rightPropType) : null;
    dependencies.captureScanSettingChanged({
      group: "props",
      setting: "prop_type",
      previous_value: `left:${previousLeft ?? "none"}|right:${previousRight ?? "none"}`,
      value: `left:${left ?? "none"}|right:${right ?? "none"}`,
      previous_left_prop: previousLeft,
      previous_right_prop: previousRight,
      left_prop: left,
      right_prop: right,
      source,
    });
  }

  function handlePlaybackModeChange(
    mode: "continuous" | "step",
    source: string
  ): void {
    const ctx = inputs.getContext();
    const previous = ctx.playbackMode;
    ctx.handlePlaybackModeChange(mode);
    dependencies.captureScanPlaybackChanged({
      action: "mode",
      previous_value: previous,
      value: mode,
      source,
    });
  }

  function handleViewerControlSetting(
    group: string,
    setting: string,
    previousValue: ViewerControlValue,
    value: ViewerControlValue,
    options: ViewerControlEventOptions = {}
  ): void {
    dependencies.captureScanSettingChanged({
      group,
      setting,
      previous_value: previousValue,
      value,
      source: group === "record_scene" ? "record_scene" : "video_export",
      coalesce: options.coalesce,
      count: options.count,
    });
  }

  function handleViewer3DSetting(
    group: string,
    setting: string,
    previousValue: ViewerControlValue,
    value: ViewerControlValue,
    options: ViewerControlEventOptions = {}
  ): void {
    dependencies.captureScanSettingChanged({
      group,
      setting,
      previous_value: previousValue,
      value,
      source: "viewer_3d",
      coalesce: options.coalesce,
      count: options.count,
    });
  }

  function handleViewer3DAction(
    action: string,
    properties: Record<string, ViewerControlValue> = {},
    options: ViewerControlEventOptions = {}
  ): void {
    dependencies.captureScanAction(
      action,
      { source: "viewer_3d", ...properties },
      { count: options.count }
    );
  }

  function handleStepClick(stepIndex: number): void {
    const ctx = inputs.getContext();
    const previous = ctx.currentStepLocal;
    // A mapped performance owns the playhead while it is on screen, so the
    // click drives the footage to that move - in the pass being watched - and
    // the notation follows the video as it always does. Seeking the animation
    // as well would fight it for the highlight.
    const drivenByVideo =
      inputs.getVideoPlayhead?.()?.seekToStep(stepIndex) ?? false;
    if (!drivenByVideo) ctx.handleStepClick(stepIndex);
    dependencies.captureScanPlaybackChanged({
      action: "step_select",
      previous_value: previous,
      value: stepIndex,
      source: drivenByVideo ? "card_step_video" : "card_step",
      step: stepIndex,
    });
  }

  function handleProgressBarSeek(targetStep: number): void {
    const ctx = inputs.getContext();
    const previous = ctx.currentStepLocal;
    ctx.handleProgressBarSeek(targetStep);
    dependencies.captureScanPlaybackChanged({
      action: "seek",
      previous_value: previous,
      value: targetStep,
      source: "progress_bar",
      step: targetStep,
      coalesce: true,
    });
  }

  function handleFocusPane(pane: "animation" | "image"): void {
    dependencies.captureScanAction("focus_pane", { pane });
    inputs.getContext().enterEditMode(pane);
  }

  function handleUnfocusPane(): void {
    dependencies.captureScanAction("unfocus_pane");
    inputs.getContext().exitEditMode();
  }

  function handleMotionToggle(hand: "left" | "right"): void {
    const ctx = inputs.getContext();
    const previous =
      hand === "left"
        ? ctx.viewerVisibility.leftMotion
        : ctx.viewerVisibility.rightMotion;
    if (hand === "left") ctx.viewerVisibility.toggleLeft();
    else ctx.viewerVisibility.toggleRight();
    dependencies.captureScanSettingChanged({
      group: "motion",
      setting: `${hand}_visible`,
      previous_value: previous,
      value: !previous,
      source: "header",
    });
  }

  function handlePracticeSetConfig(patch: Partial<TempoPracticeConfig>): void {
    const ctx = inputs.getContext();
    ctx.handlePracticeSetConfig(patch);
    dependencies.captureScanPracticeChanged(
      "config_changed",
      {
        changed_fields: Object.keys(patch).sort().join(","),
        ...buildPracticeConfigProperties({
          ...ctx.practiceState.userConfig,
          ...patch,
        }),
      },
      true
    );
  }

  function handlePracticeStart(): void {
    const ctx = inputs.getContext();
    dependencies.captureScanPracticeChanged(
      "started",
      buildPracticeConfigProperties(ctx.practiceState.userConfig)
    );
    ctx.handlePracticeStart();
  }

  function handlePracticeStepLevel(direction: 1 | -1): void {
    const ctx = inputs.getContext();
    dependencies.captureScanPracticeChanged("tempo_step", {
      direction,
      bpm: ctx.bpmLocal,
      increment: ctx.practiceState.progress.increment,
    });
    ctx.handlePracticeStepLevel(direction);
  }

  function handlePracticeToggleHold(): void {
    const ctx = inputs.getContext();
    const previous = ctx.practiceState.progress.held;
    dependencies.captureScanPracticeChanged("hold_changed", {
      previous_value: previous,
      value: !previous,
      bpm: ctx.bpmLocal,
    });
    ctx.handlePracticeToggleHold();
  }

  function handlePracticeStop(): void {
    const ctx = inputs.getContext();
    dependencies.captureScanPracticeChanged("stopped", { bpm: ctx.bpmLocal });
    ctx.handlePracticeStop();
  }

  function handleToggleMetronome(): void {
    const ctx = inputs.getContext();
    dependencies.captureScanPracticeChanged("metronome_changed", {
      previous_value: ctx.metronomeEnabled,
      value: !ctx.metronomeEnabled,
    });
    ctx.handleToggleMetronome();
  }

  function handleToggleMirror(): void {
    const ctx = inputs.getContext();
    dependencies.captureScanPracticeChanged("mirror_changed", {
      previous_value: ctx.mirrorEnabled,
      value: !ctx.mirrorEnabled,
    });
    ctx.handleToggleMirror();
  }

  function handleArtSettingChange(
    group: string,
    setting: string,
    previousValue: ScanAnalyticsValue,
    value: ScanAnalyticsValue,
    coalesce = false,
    source = "art_panel"
  ): void {
    dependencies.captureScanSettingChanged({
      group,
      setting,
      previous_value: previousValue,
      value,
      source,
      coalesce,
    });
  }

  function handleArtAction(
    action: string,
    properties: Record<string, ScanAnalyticsValue> = {},
    options: ViewerControlEventOptions = {}
  ): void {
    dependencies.captureScanAction(action, properties, {
      count: options.count,
    });
  }

  function handleCardSettingChange(
    group: string,
    setting: string,
    previousValue: ScanAnalyticsValue,
    value: ScanAnalyticsValue,
    coalesce = false
  ): void {
    dependencies.captureScanSettingChanged({
      group,
      setting,
      previous_value: previousValue,
      value,
      source: "card_export",
      coalesce,
    });
  }

  function handleCardContextAction(
    control: string,
    properties: Record<string, ScanAnalyticsValue> = {},
    options: ViewerControlEventOptions = {}
  ): void {
    dependencies.captureScanAction(
      "card_context_action",
      { control, ...properties },
      { count: options.count }
    );
  }

  async function handleDeleteConfirm(): Promise<void> {
    dependencies.captureScanAction("delete_confirmed");
    isDeleting = true;
    try {
      await inputs.getContext().handleDelete();
    } finally {
      deleteConfirmOpen = false;
      isDeleting = false;
    }
  }

  function handleDeleteCancel(): void {
    dependencies.captureScanAction("delete_canceled");
    deleteConfirmOpen = false;
  }

  function handleArtExport(
    args: Parameters<OrchestratorContext["handleArtExport"]>[0]
  ): Promise<boolean> {
    return inputs.getContext().handleArtExport(args);
  }

  function handleArtExportEvent(
    artType: "mandala" | "tunnel",
    stage: ScanExportStage,
    properties: Record<string, ScanAnalyticsValue> = {}
  ): void {
    if (stage === "requested" || stage === "retry") {
      activeArtExports.set(artType, properties);
    } else if (
      stage === "completed" ||
      stage === "failed" ||
      stage === "canceled"
    ) {
      activeArtExports.delete(artType);
    }
    dependencies.captureScanExport(artType, stage, properties);
  }

  function handleCancelVideoExport(): void {
    dependencies.captureScanExport("video", "canceled", {
      ...videoExportAnalyticsConfig(),
      user_initiated: true,
    });
    inputs.getContext().handleCancelExport();
  }

  function handleStopRecording(): void {
    const ctx = inputs.getContext();
    dependencies.captureScanAction("recording_stop", {
      elapsed_seconds: Math.round(ctx.recordingElapsed),
      render_mode: "3d",
    });
    ctx.handleStopRecording();
  }

  function handleConfirmFilmRender(): void {
    const ctx = inputs.getContext();
    dependencies.captureScanAction("film_render_confirm", {
      duration_seconds: Math.round(ctx.pendingFilmRender?.durationSeconds ?? 0),
      render_mode: "3d",
    });
    ctx.handleConfirmFilmRender();
  }

  function handleDiscardFilmRender(): void {
    const ctx = inputs.getContext();
    dependencies.captureScanAction("film_render_discard", {
      duration_seconds: Math.round(ctx.pendingFilmRender?.durationSeconds ?? 0),
      render_mode: "3d",
    });
    ctx.handleDiscardFilmRender();
  }

  function handleDismissExportedVideo(): void {
    dependencies.captureScanAction("exported_video_dismiss");
    inputs.getContext().dismissPreview();
  }

  async function handleRedownloadExportedVideo(): Promise<void> {
    dependencies.captureScanAction("exported_video_redownload");
    await inputs.getContext().saveExportedVideo();
  }

  async function handleVideoUploadSaveFirst(): Promise<void> {
    dependencies.captureScanAction("video_upload_save_first");
    await inputs.getContext().handleSave();
  }

  function handleVideoUploadClose(): void {
    dependencies.captureScanAction("video_upload_close");
    inputs.getContext().exitEditMode();
  }

  return {
    get deleteConfirmOpen() {
      return deleteConfirmOpen;
    },
    get isDeleting() {
      return isDeleting;
    },
    get headerActions() {
      return headerActions;
    },
    get videoBusy() {
      return videoBusy;
    },
    get videoProgress() {
      return videoProgress;
    },
    get cardBusy() {
      return cardBusy;
    },
    get showInlineProgress() {
      return showInlineProgress;
    },
    mount,
    recordOpenApp,
    handleAccountOpenApp,
    handleVideoExport,
    handleCardExport,
    handleRemix,
    handleOpenApp,
    handleAccountSignIn,
    handleClose,
    handleFavoriteToggle,
    handleSave,
    handleHeaderVideoUpload,
    handleGalleryVideoUpload,
    handleVideoWorkOpenChange,
    handlePublish,
    handleUnpublish,
    handleDeleteRequest,
    handleEnterPractice,
    handleExitPractice,
    handlePlaybackToggle,
    handleSystemPlaybackChange,
    handleBpmChange,
    handlePropChange,
    handlePlaybackModeChange,
    handleViewerControlSetting,
    handleViewer3DSetting,
    handleViewer3DAction,
    handleStepClick,
    handleProgressBarSeek,
    handleFocusPane,
    handleUnfocusPane,
    handleMotionToggle,
    handlePracticeSetConfig,
    handlePracticeStart,
    handlePracticeStepLevel,
    handlePracticeToggleHold,
    handlePracticeStop,
    handleToggleMetronome,
    handleToggleMirror,
    handleArtSettingChange,
    handleArtAction,
    handleCardSettingChange,
    handleCardContextAction,
    handleDeleteConfirm,
    handleDeleteCancel,
    handleArtExport,
    handleArtExportEvent,
    handleCancelVideoExport,
    handleStopRecording,
    handleConfirmFilmRender,
    handleDiscardFilmRender,
    handleDismissExportedVideo,
    handleRedownloadExportedVideo,
    handleVideoUploadSaveFirst,
    handleVideoUploadClose,
  };
}
