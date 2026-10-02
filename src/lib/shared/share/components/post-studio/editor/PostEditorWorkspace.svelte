<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import EditHistoryShortcutBridge from "$lib/shared/keyboard/components/EditHistoryShortcutBridge.svelte";
  import { getKeyboardShortcutManager } from "$lib/shared/keyboard/get-keyboard-shortcut-manager";
  import { registerEditHistoryShortcuts } from "$lib/shared/keyboard/registration/register-edit-history-shortcuts";
  import { keyboardShortcutState } from "$lib/shared/keyboard/state/keyboard-shortcut-state.svelte";
  import { onDestroy, onMount, tick, untrack } from "svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { getViewerStudioSurfaces } from "$lib/shared/sequence-viewer/context/viewer-studio-surfaces-context";
  import { reparentToInspector } from "$lib/shared/sequence-viewer/components/reparent-to-inspector";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import { deriveWord } from "$lib/shared/foundation/services/word-deriver";
  import { getSequenceVideosStore } from "$lib/shared/video-collaboration/state/sequence-videos-store.svelte";
  import { createPostSequenceView } from "$lib/shared/media-composition/services/post-sequence-view.svelte";
  import { mirrorPostProject } from "$lib/shared/media-composition/domain/post-project-mirror";
  import {
    DEFAULT_HAND_LABELING,
    type HandLabeling,
  } from "$lib/shared/video-collaboration/domain/hand-labeling";
  import { POST_STUDIO_ROLE } from "$lib/shared/media-composition/domain/post-studio-presets";
  import {
    ANIMATION_OVERLAY_ROLE,
    stripModeFromRole,
    stripRole,
    takeIdFromRole,
    takeRole,
  } from "$lib/shared/media-composition/domain/post-plan-compiler";
  import {
    itemIdFromMovesAnimationRole,
    itemIdFromStaffEffectRole,
    itemIdFromTextRole,
    staffEffectRole,
    textRole,
  } from "$lib/shared/media-composition/domain/post-project-compiler";
  import {
    POST_CANVAS_RATIOS,
    POST_DEFAULT_BACKGROUND,
    POST_FRAME_RATE,
    POST_TIME_EPSILON,
    findItem,
    itemEnd,
    mainItemAt,
    type PostBackground,
    type PostCanvasRatio,
    type PostItem,
    type PostItemKind,
    type PostKeyframeChannel,
    type PostProject,
    type PostVideoItem,
  } from "$lib/shared/media-composition/domain/post-project";
  import {
    channelsOf,
    keyframeCount,
    moveKeyframe,
    removeKeyframe,
    toggleKeyframe,
  } from "$lib/shared/media-composition/domain/post-project-keyframes";
  import {
    clearProjectKeyframes,
    editItemKeyframes,
    placeMainItem,
    setTrackCutCrossfade,
    moveOverlayItem,
    moveSelectedItems,
    setProjectBackground,
    setProjectCanvas,
    setTrackFlag,
  } from "$lib/shared/media-composition/domain/post-project-edits";
  import type { StripMode } from "$lib/shared/media-composition/domain/strip-view";
  import {
    postCanvasOf,
    postOutputSize,
    ratioValue,
  } from "$lib/shared/media-composition/domain/post-canvas";
  import type { CompositionSourceBinding } from "$lib/shared/media-composition/state/media-composition-state.svelte";
  import {
    createPostEditorState,
    type CatalogTakeSource,
    type PostEdit,
  } from "$lib/shared/media-composition/state/post-editor-state.svelte";
  import type { PostStudioLayerPainter } from "$lib/shared/media-composition/services/post-studio-layer-painter";
  import { createBeatCarouselPainter } from "$lib/shared/media-composition/services/beat-carousel-painter";
  import { createSequenceStripPainter } from "$lib/shared/media-composition/services/sequence-strip-painter";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { createTextItemPainter } from "$lib/shared/media-composition/services/text-item-painter";
  import { createStaffEffectPainter } from "$lib/shared/media-composition/services/staff-effect-painter";
  import { createStaffTipAnalysis } from "$lib/shared/media-composition/state/staff-tip-analysis.svelte";
  import { loadAnimationOverlayPainter } from "$lib/shared/media-composition/services/animation-overlay-painter-registry";
  import { planProjectAudio } from "$lib/shared/media-composition/domain/post-audio-plan";
  import { buildMixedAudioTrack } from "$lib/shared/media-composition/services/post-audio-track";
  import {
    exportPostStudioVideo,
    type PostStudioExportProgress,
  } from "$lib/shared/media-composition/services/post-studio-exporter";
  import AnimationPanel from "$lib/shared/animation-panel/components/AnimationPanel.svelte";
  import ExportTakeover from "$lib/shared/video-export/components/ExportTakeover.svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { motionDuration } from "$lib/shared/transitions/motion";
  import {
    LAYOUT_MOTION_DURATION_MS,
    createLayoutMotion,
  } from "$lib/shared/transitions/layout-flip";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import type { PostStudioShareExport } from "../post-studio-share-export";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import DrawerHeader from "$lib/shared/foundation/ui/DrawerHeader.svelte";
  import PostTimingTap from "../builder/PostTimingTap.svelte";
  import PostTimingAnimationPreview from "../builder/PostTimingAnimationPreview.svelte";
  import PostTimingAnimationSettings from "../builder/PostTimingAnimationSettings.svelte";
  import PostTimingStage from "../builder/PostTimingStage.svelte";
  import PostTimingTimeline from "../builder/PostTimingTimeline.svelte";
  import PostTimingPanel from "../builder/PostTimingPanel.svelte";
  import { createPostTimingSession } from "../builder/post-timing-session.svelte";
  import { formatTakeClock } from "../builder/post-builder-format";
  import PostEditorCanvas from "./PostEditorCanvas.svelte";
  import { createPostVideoPreviews } from "$lib/shared/media-composition/state/post-video-previews.svelte";
  import PostEditorTopBar from "./PostEditorTopBar.svelte";
  import PostEditorActions from "./PostEditorActions.svelte";
  import PostSaveButton from "./PostSaveButton.svelte";
  import { getPostEditorHeader } from "./post-editor-header.svelte";
  import PostEditorTransport from "./PostEditorTransport.svelte";
  import PostCropTimeline from "./PostCropTimeline.svelte";
  import PostToolRow from "./PostToolRow.svelte";
  import PostToolPanel from "./PostToolPanel.svelte";
  import PostItemTool from "./PostItemTool.svelte";
  import PostKeyframeControls from "./PostKeyframeControls.svelte";
  import ConfirmDialog from "$lib/shared/foundation/ui/ConfirmDialog.svelte";
  import OverflowMenu from "$lib/shared/ui/components/OverflowMenu.svelte";
  import {
    showToast,
    removeToast,
  } from "$lib/shared/toast/state/toast-state.svelte";
  import PostAddPanel from "./PostAddPanel.svelte";
  import PostMediaPanel from "./PostMediaPanel.svelte";
  import PostExportPanel from "./PostExportPanel.svelte";
  import PostRatioPicker from "./PostRatioPicker.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import PostTimeline from "./timeline/PostTimeline.svelte";
  import { clampPixelsPerSecond } from "./timeline/post-timeline-geometry";
  import { channelLabel, itemDisplayLabel } from "./post-editor-labels";
  import { readVideoFile, videoFileError } from "./post-editor-files";
  import {
    readInShotRecoveryPackage,
    loadPostProjectFonts,
  } from "$lib/shared/media-composition/services/inshot-recovery-package";
  import {
    createCropSession,
    type CropShapeKind,
  } from "./post-crop-session.svelte";
  import {
    createPostDraftAutosave,
    shouldSubmitPostDraft,
    loadPostDraft,
  } from "$lib/shared/media-composition/services/post-draft-storage";
  import {
    parsePostStudioBackup,
    serializePostStudioBackup,
  } from "$lib/shared/media-composition/services/post-project-backup";
  import { downloadBlobToDisk } from "$lib/shared/foundation/services/file-downloader";
  import PostDraftStatus from "./PostDraftStatus.svelte";
  import ResizeHandle from "$lib/shared/panels/ResizeHandle.svelte";
  import {
    adjacentStepSeconds,
    clipSteps,
    type ClipStep,
  } from "./post-crop-steps";
  import {
    CROP_STAGE_MARGIN_PX,
    cropStageRatio,
    type CropSize,
  } from "./post-crop-geometry";
  import {
    availablePanels,
    isPanelTool,
    keyframeChannelFor,
    shownPanel,
    toolRow,
    type PostPanelToolId,
    type PostToolId,
    type PostToolSelection,
  } from "./post-editor-tools";

  /**
   * One post on one screen, the way a phone video editor works: the preview,
   * the timeline of clips and layers, and one row of tools that changes with
   * the selection. One tool's panel shows at a time: in place of the row on a
   * phone, beside the preview on a wide screen, or in the viewer's side
   * panel. Every part reads the same editor state, so the frame drawn here is
   * the frame the file gets.
   */
  interface Props {
    active: boolean;
    sequence: SequenceData;
    initialProject?: PostProject;
    onSaveDraft?: (project: PostProject) => Promise<void>;
    draftLoadError?: string | null;
    cardPreviewUrl: string | null;
    animationPreviewUrl: string | null;
    animationPreviewType: "video" | "image";
    cardRenderOptions: Partial<SequenceExportOptions>;
    isPreparingCard: boolean;
    isPreparingAnimation: boolean;
    onExported?: (blob: Blob) => void;
    onSharePost?: () => void;
    previewTarget: HTMLElement | null;
    sharing: boolean;
    selectedPropType: PropType;
    onPropChange: (propType: PropType) => void;
    onProjectPropChange: (propType: PropType | undefined) => void;
    /** Sound a shared link asked for, applied once on open. */
    audioSeed: "takes" | "silent" | null;
    /** `chosen` is false for the sound a saved project opens with. */
    onAudioChange: (audio: "takes" | "silent", chosen: boolean) => void;
    /** Hands the share sheet this workspace's render; returns the release. */
    registerExport: (controls: PostStudioShareExport) => () => void;
  }

  let {
    active,
    sequence,
    initialProject,
    onSaveDraft,
    draftLoadError = null,
    cardPreviewUrl,
    animationPreviewUrl,
    animationPreviewType,
    cardRenderOptions,
    isPreparingCard,
    isPreparingAnimation,
    onExported,
    onSharePost,
    previewTarget,
    sharing,
    selectedPropType,
    onPropChange,
    onProjectPropChange,
    audioSeed,
    onAudioChange,
    registerExport,
  }: Props = $props();

  const sharedSurfaces = getViewerStudioSurfaces();
  const externalInspector = $derived(
    sharedSurfaces?.externalInspectorTarget ?? null
  );

  // The per-sequence catalog, shared with the rest of the app, so a video
  // uploaded elsewhere shows up here without reopening.
  const videoLibrary = untrack(() =>
    sequence.id ? getSequenceVideosStore(sequence.id) : null
  );
  $effect(() => {
    void videoLibrary?.load();
  });

  const catalogVideos = $derived(videoLibrary?.videos ?? []);
  const catalog = $derived<CatalogTakeSource[]>(
    catalogVideos
      .filter((video) => Boolean(video.videoUrl) && video.duration > 0)
      .map((video) => ({
        videoId: video.id,
        label: video.description?.trim() || t("share_studio_saved_video"),
        url: video.videoUrl,
        durationSeconds: video.duration,
        ...(video.beatMap ? { legacyStepMap: video.beatMap } : {}),
      }))
  );

  let overlayPainter = $state.raw<PostStudioLayerPainter | null>(null);

  const editor = createPostEditorState({
    initialProject,
    getSequence: () => sequence,
    getCatalogVideo: (videoId) =>
      catalog.find((video) => video.videoId === videoId) ?? null,
    hasAnimationOverlay: () => overlayPainter !== null,
  });

  onMount(() => {
    if (!import.meta.env.DEV) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    void import("$lib/shared/media-composition/services/post-project-dev-client")
      .then(({ startPostProjectDevBridge }) => {
        if (!disposed) stop = startPostProjectDevBridge(editor);
      })
      .catch(() => {});
    return () => {
      disposed = true;
      stop?.();
    };
  });

  $effect(() => onProjectPropChange(editor.project.propType));

  function choosePropType(propType: PropType): void {
    editor.edit((project, context) =>
      project.propType === propType
        ? project
        : { ...project, propType, updatedAt: context.now }
    );
    onPropChange(propType);
  }
  const videoPreviews = createPostVideoPreviews(
    () =>
      editor.takes.map((take) => ({
        id: take.id,
        url: editor.mediaUrl(take.id),
        assetKey: take.takeKey,
      })),
    () => editor.isPlaying
  );
  const session = createPostTimingSession(editor);
  onMount(() => {
    // Standalone sequence pages have no app shortcut coordinator. Reuse its
    // manager and history bindings; both are safe to initialize again in-app.
    const manager = getKeyboardShortcutManager();
    manager.initialize();
    registerEditHistoryShortcuts(manager, keyboardShortcutState.isMac);
  });

  let draftSaving = $state(false);
  let draftError = $state<string | null>(draftLoadError);
  let templateError = $state<string | null>(null);
  let loadingTemplate = $state(false);
  /** When the last save finished, for the header's saved time. */
  let savedAt = $state<number | null>(null);
  /** The Save button was pressed and its save has not landed yet. */
  let saveRequested = $state(false);
  let saveFlash = $state(false);
  let saveFlashTimer: ReturnType<typeof setTimeout> | undefined;
  const draftAutosave = onSaveDraft
    ? createPostDraftAutosave(onSaveDraft, (saving, error) => {
        draftSaving = saving;
        draftError = error;
        if (saving) return;
        if (!error) savedAt = Date.now();
        if (saveRequested) settleSave();
      })
    : null;

  $effect(() => {
    const revision = editor.saveRevision;
    if (draftAutosave)
      untrack(() => {
        const snapshot = editor.snapshot;
        if (shouldSubmitPostDraft(snapshot, revision))
          draftAutosave.submit(snapshot);
      });
    else if (revision > 0)
      untrack(() => {
        if (!editor.saveError) savedAt = Date.now();
        if (saveRequested) settleSave();
      });
  });
  onDestroy(() => {
    draftAutosave?.dispose();
    clearTimeout(saveFlashTimer);
  });

  /** The page's header row, when it gives one, holds Save and Export. */
  const header = getPostEditorHeader();
  $effect(() => {
    if (!header) return;
    header.actions = headerActions;
    return () => {
      if (header.actions === headerActions) header.actions = undefined;
    };
  });

  const saveFailure = $derived(draftError ?? editor.saveError);
  const saveStatus = $derived(
    saveFailure
      ? "failed"
      : saveRequested
        ? "saving"
        : saveFlash
          ? "saved"
          : "idle"
  );

  function saveNow(): void {
    clearTimeout(saveFlashTimer);
    saveFlash = false;
    saveRequested = true;
    editor.saveNow();
  }

  function settleSave(): void {
    saveRequested = false;
    if (draftError ?? editor.saveError) return;
    saveFlash = true;
    saveFlashTimer = setTimeout(() => (saveFlash = false), 1600);
  }

  function protectUnsavedDraft(event: BeforeUnloadEvent): void {
    if (!draftSaving && !draftError && !editor.saveError) return;
    event.preventDefault();
    event.returnValue = "";
  }

  async function downloadDraft(): Promise<void> {
    const blob = new Blob([serializePostStudioBackup(editor.snapshot)], {
      type: "application/json",
    });
    const result = await downloadBlobToDisk(
      blob,
      `${sequence.id}-mapped.post-studio.json`
    );
    if (!result.success)
      draftError =
        "Could not download the backup. Keep this editor open and try again.";
  }
  /** The post's size in pixels, from its shape. */
  const outputSize = $derived(postOutputSize(editor.project.canvas));

  function setCanvas(canvas: PostCanvasRatio): void {
    editor.pause();
    editor.edit((project, ctx) => setProjectCanvas(project, canvas, ctx));
  }

  function setBackground(background: PostBackground): void {
    editor.edit((project, ctx) =>
      setProjectBackground(project, background, ctx)
    );
  }

  untrack(() => {
    if (audioSeed && audioSeed !== editor.project.audio) {
      editor.seedAudio(audioSeed);
    }
  });

  $effect(() => {
    void catalog;
    untrack(() => editor.attachCatalogTakes());
  });

  let audioReported = false;
  $effect(() => {
    const audio = editor.project.audio;
    untrack(() => onAudioChange(audio, audioReported));
    audioReported = true;
  });

  /**
   * The performer works in their own frame and the camera sees it reflected,
   * so beside footage the notation follows the take's hand labeling: a
   * catalog video remembers its own, anything else mirrors.
   */
  const handLabeling = $derived.by((): HandLabeling | null => {
    const take = editor.takesInUse[0] ?? editor.takes[0];
    if (!take) return null;
    if (take.ref.kind === "catalog") {
      const videoId = take.ref.videoId;
      const video = catalogVideos.find((entry) => entry.id === videoId);
      if (video?.handLabeling) return video.handLabeling;
    }
    return DEFAULT_HAND_LABELING;
  });
  const labeledCard = createPostSequenceView({
    getSequence: () => sequence,
    getLabeling: () => handLabeling,
    getMirrored: () => editor.project.mirrored ?? false,
    getActions: () => editor.project.sequenceActions ?? [],
  });
  const displaySequence = $derived(labeledCard.sequence);
  /** A notice the top bar shows beside Undo and Redo. */
  const draftNotice = $derived(
    !!templateError ||
      !!labeledCard.error ||
      (!!(editor.project.mirrored || editor.project.sequenceActions?.length) &&
        labeledCard.pending)
  );

  // ---- What each layer draws -----------------------------------------------

  const carouselPainter = $derived(createBeatCarouselPainter(displaySequence));
  const animationVisibility = getAnimationVisibilityManager();
  let progressBarVisible = $state(
    animationVisibility.getVisibility("progressBar")
  );
  function syncProgressBarVisibility(): void {
    progressBarVisible = animationVisibility.getVisibility("progressBar");
  }
  animationVisibility.registerObserver(syncProgressBarVisibility);
  onDestroy(() =>
    animationVisibility.unregisterObserver(syncProgressBarVisibility)
  );
  const stripPainters = $derived(
    new Map<StripMode, PostStudioLayerPainter>(
      (["arrows", "mandala", "alternate"] as const).map((mode) => [
        mode,
        createSequenceStripPainter({
          sequence: displaySequence,
          mode,
          showProgressBar: () => progressBarVisible,
        }),
      ])
    )
  );

  /** One painter per text item, reading its words live from the project. */
  const textPainters = new Map<string, PostStudioLayerPainter>();
  function textPainterFor(itemId: string): PostStudioLayerPainter {
    let painter = textPainters.get(itemId);
    if (!painter) {
      painter = createTextItemPainter(
        () =>
          editor.compiled?.texts.find((text) => text.itemId === itemId) ?? null
      );
      textPainters.set(itemId, painter);
    }
    return painter;
  }

  /** Where each take's LED staffs are, found once per video. */
  const staffTips = createStaffTipAnalysis();
  $effect(() => {
    for (const take of editor.takes) staffTips.ensure(take.takeKey);
  });

  function videoItem(itemId: string): PostVideoItem | null {
    const found = findItem(editor.project, itemId)?.item;
    return found?.kind === "video" ? found : null;
  }

  /** One painter per clip, reading its effect and its take's staff ends live. */
  const staffPainters = new Map<string, PostStudioLayerPainter>();
  function staffPainterFor(itemId: string): PostStudioLayerPainter {
    let painter = staffPainters.get(itemId);
    if (!painter) {
      painter = createStaffEffectPainter({
        track: () => {
          const item = videoItem(itemId);
          const take = item
            ? editor.takes.find((entry) => entry.id === item.takeId)
            : null;
          return take ? staffTips.track(take.takeKey) : null;
        },
        effect: () => videoItem(itemId)?.staffEffect?.effect ?? null,
        fit: () => videoItem(itemId)?.fit ?? "cover",
      });
      staffPainters.set(itemId, painter);
    }
    return painter;
  }

  let overlayVersion = 0;
  let overlaySequence = $state.raw<SequenceData | null>(null);
  let overlayError = $state<string | null>(null);
  $effect(() => {
    const drawn = displaySequence;
    const version = ++overlayVersion;
    overlayError = null;
    void loadAnimationOverlayPainter(drawn)
      .then((painter) => {
        if (version === overlayVersion) {
          overlayPainter = painter;
          overlaySequence = drawn;
        }
      })
      .catch((error: unknown) => {
        console.error("[PostStudio] Beat overlay unavailable:", error);
        if (version === overlayVersion) {
          overlayPainter = null;
          overlayError =
            "Could not prepare the animation. Reload the saved post to retry.";
        }
      });
  });

  function painted(
    roleKey: string,
    label: string,
    painter: PostStudioLayerPainter
  ): CompositionSourceBinding {
    return {
      roleKey,
      kind: "image",
      label,
      previewUrl: null,
      renderMode: "painted",
      painter,
      status: sequence.steps.length > 0 ? "ready" : "missing",
    };
  }

  function bindingFor(role: string): CompositionSourceBinding | null {
    if (role.startsWith("image:")) {
      const imageId = role.slice("image:".length);
      const asset = editor.images.find((entry) => entry.id === imageId);
      const url = editor.imageUrl(imageId);
      return {
        roleKey: role,
        kind: "image",
        label: asset?.label ?? "Image",
        previewUrl: url,
        previewType: "image",
        renderMode: "external-media",
        status: url ? "ready" : "missing",
        missingMessage: "Relink this image from the recovered files.",
      };
    }
    const takeId = takeIdFromRole(role);
    if (takeId) {
      const take = editor.takes.find((entry) => entry.id === takeId);
      const url = editor.mediaUrl(takeId);
      const preview = videoPreviews.resolve(takeId, url);
      return {
        roleKey: role,
        kind: "video",
        label: take?.label ?? t("share_studio_deep_take"),
        previewUrl: preview.url,
        sourceWidth: preview.sourceWidth,
        sourceHeight: preview.sourceHeight,
        onPreviewError: () => videoPreviews.reportPlaybackError(takeId),
        previewType: "video",
        renderMode: "external-media",
        ...(take ? { durationSeconds: take.durationSeconds } : {}),
        status: url ? "ready" : "missing",
        missingMessage: t("share_studio_repick_local"),
      };
    }
    const staffItemId = itemIdFromStaffEffectRole(role);
    if (staffItemId) {
      return {
        roleKey: role,
        kind: "image",
        label: t("post_staff_effect"),
        previewUrl: null,
        renderMode: "painted",
        painter: staffPainterFor(staffItemId),
        status: "ready",
      };
    }
    const textItemId = itemIdFromTextRole(role);
    if (textItemId) {
      return {
        roleKey: role,
        kind: "image",
        label: t("post_editor_kind_text"),
        previewUrl: null,
        renderMode: "painted",
        painter: textPainterFor(textItemId),
        status: "ready",
      };
    }
    if (itemIdFromMovesAnimationRole(role)) {
      return {
        roleKey: role,
        kind: "sequence-animation",
        label: t("share_studio_deep_moves"),
        previewUrl: null,
        renderMode: "sequence-animation",
        status: sequence.steps.length > 0 ? "ready" : "missing",
      };
    }
    const strip = stripModeFromRole(role);
    if (strip) {
      const painter = stripPainters.get(strip);
      return painter
        ? painted(role, t("share_studio_deep_moves"), painter)
        : null;
    }
    switch (role) {
      case POST_STUDIO_ROLE.animation:
        return {
          roleKey: role,
          kind: "sequence-animation",
          label: t("share_studio_deep_animation"),
          previewUrl: animationPreviewUrl,
          previewType: animationPreviewType,
          renderMode: "sequence-animation",
          status:
            sequence.steps.length > 0 || animationPreviewUrl
              ? "ready"
              : isPreparingAnimation
                ? "preparing"
                : "missing",
        };
      case POST_STUDIO_ROLE.carousel:
        return painted(
          role,
          t("share_studio_deep_beat_carousel"),
          carouselPainter
        );
      case ANIMATION_OVERLAY_ROLE:
        return overlayPainter
          ? painted(
              role,
              t("share_studio_deep_beat_and_letter"),
              overlayPainter
            )
          : null;
      case POST_STUDIO_ROLE.card:
        return {
          roleKey: role,
          kind: "choreo-card",
          label: t("share_studio_deep_choreo_card"),
          previewUrl: cardPreviewUrl,
          previewType: "image",
          renderMode: "choreo-card",
          status:
            sequence.steps.length > 0 || cardPreviewUrl
              ? "ready"
              : isPreparingCard
                ? "preparing"
                : "missing",
        };
      default:
        return null;
    }
  }

  /** Every painter the post draws, keyed the way the exporter looks them up. */
  function exportPainters(): Map<string, PostStudioLayerPainter> {
    const painters = new Map<string, PostStudioLayerPainter>([
      [POST_STUDIO_ROLE.carousel, carouselPainter],
    ]);
    for (const [mode, painter] of stripPainters) {
      painters.set(stripRole(mode), painter);
    }
    for (const text of editor.compiled?.texts ?? []) {
      painters.set(textRole(text.itemId), textPainterFor(text.itemId));
    }
    if (overlayPainter) painters.set(ANIMATION_OVERLAY_ROLE, overlayPainter);
    for (const track of editor.project.tracks) {
      for (const item of track.items) {
        if (item.kind === "video" && item.staffEffect) {
          painters.set(staffEffectRole(item.id), staffPainterFor(item.id));
        }
      }
    }
    return painters;
  }

  const labelFor = (item: PostItem) => itemDisplayLabel(item, editor.project);

  // ---- Screen state ----------------------------------------------------------

  let rootElement = $state<HTMLElement | null>(null);
  let canvasRoot = $state<HTMLElement | null>(null);
  let playbackCanvas: PostEditorCanvas | undefined = $state();
  /** The side column beside the preview, or in the viewer's side panel. */
  let panelHost = $state<HTMLElement | null>(null);
  /** The panel's own slot in that column, under the top bar. */
  let panelSlot = $state<HTMLElement | null>(null);
  /** A phone's bottom dock: the row, or the panel open in its place. */
  let dockElement = $state<HTMLElement | null>(null);
  /** The row over the timeline on a wide screen. */
  let rowSlot = $state<HTMLElement | null>(null);
  /** The transport, or the crop screen's time bar in its place. */
  let transportSlot = $state<HTMLElement | null>(null);
  /** The preview and its neighbors, the row that grows to fill a phone. */
  let stageRow = $state<HTMLElement | null>(null);
  /** The preview's height before a phone panel opened, kept across tool swaps. */
  let heldStageHeight = $state<number | null>(null);
  let heldStageEditorSize: { width: number; height: number } | null = null;
  /** The tallest that phone panel may grow and still clear the preview. */
  let dockPanelMax = $state<number | null>(null);
  let appearancePanelHeight = $state(0);
  let appearanceDrawerOpen = $state(false);
  let appearanceSnapPoint = $state<number | null>(1);
  let fileInput = $state<HTMLInputElement | null>(null);
  let recoveryInput = $state<HTMLInputElement | null>(null);

  $effect(() => {
    const project = editor.project;
    if (!project.fonts?.length) return;
    void loadPostProjectFonts(project).catch((error: unknown) => {
      fileError =
        error instanceof Error
          ? error.message
          : "Could not load the project font.";
    });
  });
  let readingFile = $state(false);
  let fileError = $state("");
  let showImportDifferences = $state(false);
  let pixelsPerSecond = $state(60);
  let editorWidth = $state(0);
  let editorHeight = $state(0);
  const DEFAULT_TIMELINE_HEIGHT_PX = 280;
  const MIN_TIMELINE_HEIGHT_PX = 160;
  let timelineHeightPx = $state(DEFAULT_TIMELINE_HEIGHT_PX);
  let timelineResizeStartPx = DEFAULT_TIMELINE_HEIGHT_PX;
  const maxTimelineHeightPx = $derived(
    Math.max(MIN_TIMELINE_HEIGHT_PX, Math.min(520, editorHeight - 360))
  );
  const shownTimelineHeightPx = $derived(
    Math.min(timelineHeightPx, maxTimelineHeightPx)
  );

  function resizeTimeline(delta: number): void {
    timelineHeightPx = Math.max(
      MIN_TIMELINE_HEIGHT_PX,
      Math.min(maxTimelineHeightPx, timelineResizeStartPx - delta)
    );
  }

  function resizeTimelineWithKeys(event: KeyboardEvent): void {
    let nextHeight: number;
    switch (event.key) {
      case "ArrowUp":
        nextHeight = shownTimelineHeightPx + 20;
        break;
      case "ArrowDown":
        nextHeight = shownTimelineHeightPx - 20;
        break;
      case "Home":
        nextHeight = MIN_TIMELINE_HEIGHT_PX;
        break;
      case "End":
        nextHeight = maxTimelineHeightPx;
        break;
      default:
        return;
    }
    event.preventDefault();
    timelineHeightPx = Math.max(
      MIN_TIMELINE_HEIGHT_PX,
      Math.min(maxTimelineHeightPx, nextHeight)
    );
  }
  let remPixels = $state(16);
  /** The panel last asked for. A wide screen falls back to a default. */
  let activeTool = $state<PostPanelToolId | null>(null);

  let exportProgress = $state<PostStudioExportProgress | null>(null);
  let exportError = $state("");
  let exportedUrl = $state<string | null>(null);
  let exportCancelled = false;
  let exportAbort: AbortController | null = null;

  const exporting = $derived(exportProgress !== null);
  const exportPercent = $derived(
    exportProgress && exportProgress.totalFrames > 0
      ? Math.round(
          (exportProgress.completedFrames / exportProgress.totalFrames) * 100
        )
      : 0
  );
  /** Tapping beats swaps the post for the take being mapped. */
  const showTimingStage = $derived(
    editor.mode === "timing" && !sharing && !previewTarget && !exporting
  );
  const sequenceName = $derived(
    simplifyRepeatedWord(
      sequence.displayName ||
        deriveWord(sequence) ||
        t("post_editor_default_name")
    )
  );
  const exportFilename = $derived(
    `${simplifyRepeatedWord(sequenceName || "tka-post")}.mp4`
  );
  const canRender = $derived(
    Boolean(editor.compiled) &&
      editor.durationSeconds > 0 &&
      !exporting &&
      !labeledCard.pending &&
      !labeledCard.error &&
      (!editor.project.tracks.some((track) =>
        track.items.some((item) => item.kind === "moves")
      ) ||
        (overlaySequence === displaySequence && !overlayError)) &&
      !sharedSurfaces?.moving
  );

  /** The clip Beats opens: the selected video, else the one under the playhead. */
  const beatsClip = $derived.by((): PostVideoItem | null => {
    const selected = editor.selectedItem;
    if (selected?.kind === "video") return selected;
    const under = mainItemAt(editor.project, editor.previewSeconds);
    return under?.kind === "video" ? under : null;
  });
  const canTapBeats = $derived(
    beatsClip !== null && Boolean(editor.mediaUrl(beatsClip.takeId))
  );

  // ---- Tools -----------------------------------------------------------------

  /** The editor's own width, not the window's: wide enough for a panel
   * beside a full-height preview. */
  const WIDE_REM = 56;
  /** A landscape editor this wide keeps the panel beside a shorter preview.
   * Under it, a short screen would hide the preview while a tool is open. */
  const LANDSCAPE_WIDE_REM = 36;

  $effect(() => {
    remPixels =
      Number.parseFloat(getComputedStyle(document.documentElement).fontSize) ||
      16;
  });

  const shortMappingLayout = $derived(
    showTimingStage &&
      !externalInspector &&
      editorHeight < 28 * remPixels &&
      editorWidth >= LANDSCAPE_WIDE_REM * remPixels &&
      editorWidth > editorHeight
  );
  const layout = $derived<"phone" | "wide" | "viewer">(
    externalInspector
      ? "viewer"
      : !shortMappingLayout &&
          (editorWidth >= WIDE_REM * remPixels ||
            (editorWidth > editorHeight &&
              editorWidth >= LANDSCAPE_WIDE_REM * remPixels))
        ? "wide"
        : "phone"
  );
  /** A panel always shows beside the preview or in the viewer's side panel. */
  const panelBeside = $derived(layout !== "phone");
  let timingSettingsOpen = $state(false);
  let timingAnimationOpen = $state(false);
  let timingRatio = $state(9 / 16);
  let timingAnimationSection: HTMLDivElement | undefined = $state();
  async function openTimingAnimation(): Promise<void> {
    timingAnimationOpen = true;
    if (!panelBeside) {
      timingSettingsOpen = true;
      return;
    }
    await tick();
    timingAnimationSection?.scrollIntoView({ block: "nearest" });
    timingAnimationSection?.focus({ preventScroll: true });
  }
  $effect(() => {
    if (!showTimingStage || panelBeside) timingSettingsOpen = false;
  });

  const selection = $derived.by((): PostToolSelection => {
    const item = editor.selectedItem;
    if (!item) return { kind: null, hasLayout: false };
    return {
      kind: item.kind,
      hasLayout:
        item.kind === "video" &&
        findItem(editor.project, item.id)?.trackIndex === 0,
    };
  });
  const tools = $derived(toolRow(selection));
  const rowKey = $derived(`row:${tools.join(" ")}`);
  const shown = $derived(shownPanel(activeTool, selection, panelBeside));
  const appearanceDockOpen = $derived(
    layout === "phone" &&
      !cropMode &&
      !showTimingStage &&
      shown === "appearance"
  );
  $effect(() => {
    appearanceDrawerOpen = appearanceDockOpen;
    if (appearanceDockOpen) appearanceSnapPoint = 1;
  });
  const appearanceSnapPoints = $derived.by(() => {
    if (!appearancePanelHeight || !editorHeight) return null;
    const maximum = Math.min(editorHeight * 0.88, 760);
    const compact = Math.min(appearancePanelHeight + 32, maximum * 0.8);
    return [0, compact, maximum];
  });
  /** A phone shows the panel in the row's place, else the row. */
  const dockKey = $derived(appearanceDockOpen ? rowKey : (shown ?? rowKey));
  /**
   * The crop screen: the selected clip's Crop is open, so the stage shows
   * that clip alone with its window large in the middle. The share sheet, a
   * preview lent to the viewer and the beat tapper each close it, keeping
   * its changes, and it opens again when they are done.
   */
  const cropMode = $derived(
    shown === "crop" &&
      editor.selectedItem?.kind === "video" &&
      !showTimingStage &&
      !sharing &&
      !previewTarget
  );

  /** Each clip's footage size, as its video reports it, for the crop screen. */
  let sourceSizes = $state<Record<string, CropSize>>({});
  function noteSourceSize(regionId: string, size: CropSize): void {
    const known = sourceSizes[regionId];
    if (known?.width === size.width && known.height === size.height) return;
    sourceSizes = { ...sourceSizes, [regionId]: size };
  }

  const crop = createCropSession({
    editor,
    getItemId: () => (cropMode ? editor.selectedItemId : null),
    getSource: () => {
      const id = editor.selectedItemId;
      return id ? (sourceSizes[id] ?? null) : null;
    },
  });
  let cropSourceView = $state(true);
  let cropSourceShape = $state<CropShapeKind | null>(null);

  /**
   * The crop stage's shape, so a wide screen gives the stage only the width
   * it needs and the panel sits beside the picture. It is set once the
   * footage's size is known and kept until the screen closes: it has room to
   * straighten, and a quarter turn fits inside it, so the panel never moves
   * under the pointer. Until then the window's own shape stands in.
   */
  let cropStage: { itemId: string; ratio: number } | null = null;
  const cropView = $derived.by(() => {
    const itemId = cropMode ? editor.selectedItemId : null;
    if (!itemId) {
      cropStage = null;
      return null;
    }
    if (
      cropSourceView &&
      (crop.item?.sourceGeometry ||
        crop.item?.keyframes?.sourceGeometry?.length)
    ) {
      const source = crop.source;
      return source ? source.width / source.height : 1.7778;
    }
    if (cropStage?.itemId === itemId) return cropStage.ratio;
    const pose = crop.pose;
    if (pose) {
      cropStage = { itemId, ratio: cropStageRatio(pose, crop.parts.quarter) };
      return cropStage.ratio;
    }
    const window = crop.window;
    return window ? window.width / window.height : null;
  });

  /** The panel that was open before the crop screen, to go back to. */
  let cropReturn: PostPanelToolId | null = null;

  // The screen's changes are one undo step. Done and Cancel end the session
  // themselves; leaving any other way keeps the changes, as Done would. The
  // session ends from the effect's body, not a teardown: a teardown reads
  // state as it was before the change that ended it, so it would save again
  // a project that Cancel had just put back.
  let cropSessionOpen = false;
  $effect(() => {
    if (cropMode) {
      if (!cropSessionOpen) {
        cropSessionOpen = untrack(() => editor.beginSession());
      }
      return;
    }
    if (!cropSessionOpen) return;
    cropSessionOpen = false;
    untrack(() => {
      crop.abandonGesture();
      editor.endSession(true);
    });
  });

  // The clip's region and its frame fly between their place in the post and
  // the crop window.
  const cropFlight = createLayoutMotion({
    getRoot: () => canvasRoot,
    groups: [{ selector: "[data-crop-flip]", datasetKey: "cropFlip" }],
    getDuration: () => motionDuration(LAYOUT_MOTION_DURATION_MS),
  });

  // A phone's preview takes the height the row leaves it. A panel is taller
  // than the row, so the preview keeps its height while one is open, and the
  // panel fits the room under it and scrolls inside. When that room is too
  // small to use it may take half the editor, which then scrolls under the
  // dock. Keep the preview's minimum height while the panel closes: the dock
  // crossfade retains its tall outgoing layer for a beat before easing down.
  // Releasing the minimum on Escape would squeeze the preview for that beat.
  const MIN_DOCK_PANEL_REM = 14;
  $effect.pre(() => {
    const phone = layout === "phone" && !showTimingStage;
    const cropDock = phone && cropMode;
    const holding = phone && !cropMode && shown !== null && !appearanceDockOpen;
    const size = { width: editorWidth, height: editorHeight };
    untrack(() => {
      if (
        !phone ||
        cropDock ||
        (heldStageEditorSize &&
          (heldStageEditorSize.width !== size.width ||
            heldStageEditorSize.height !== size.height))
      ) {
        heldStageHeight = null;
        heldStageEditorSize = null;
      }
      // The crop screen sizes its own dock once it is on screen, below.
      if (cropDock) {
        return;
      }
      if (!holding) {
        dockPanelMax = null;
        return;
      }
      if (!stageRow || !rootElement || !dockElement) return;
      const stage = stageRow.getBoundingClientRect();
      const stageBottom =
        stage.bottom - rootElement.getBoundingClientRect().top;
      const gap =
        Number.parseFloat(
          getComputedStyle(stageRow.parentElement ?? stageRow).rowGap
        ) || 0;
      const dock = getComputedStyle(dockElement);
      const dockChrome =
        Number.parseFloat(dock.paddingTop) +
        Number.parseFloat(dock.paddingBottom) +
        Number.parseFloat(dock.borderTopWidth);
      // The dock's edge lands mid-gap, so it hides the transport completely.
      const room =
        rootElement.clientHeight - stageBottom - gap / 2 - dockChrome;
      if (heldStageHeight === null) {
        heldStageHeight = stage.height;
        heldStageEditorSize = size;
      }
      dockPanelMax =
        room >= MIN_DOCK_PANEL_REM * remPixels
          ? room
          : Math.max(room, rootElement.clientHeight / 2);
    });
  });

  // On a phone the crop screen keeps at least half the room under the top
  // bar for its stage. Its panel fits under the timeline and scrolls inside.
  // A short phone gives the panel less, down to a slider and a half, before
  // the stage goes under its 12rem or the dock covers the keyframes.
  const MIN_CROP_PANEL_REM = 10;
  const SHORT_CROP_PANEL_REM = 6;
  const MIN_CROP_STAGE_REM = 12;
  $effect(() => {
    if (!cropMode || layout !== "phone") return;
    void editorHeight;
    void editorWidth;
    untrack(() => {
      if (!rootElement || !stageRow || !dockElement || !transportSlot) return;
      const rootTop = rootElement.getBoundingClientRect().top;
      const stageTop =
        stageRow.getBoundingClientRect().top - rootTop + rootElement.scrollTop;
      const below = rootElement.clientHeight - stageTop;
      const gap =
        Number.parseFloat(
          getComputedStyle(stageRow.parentElement ?? stageRow).rowGap
        ) || 0;
      const dock = getComputedStyle(dockElement);
      const dockChrome =
        Number.parseFloat(dock.paddingTop) +
        Number.parseFloat(dock.paddingBottom) +
        Number.parseFloat(dock.borderTopWidth);
      const underStage = transportSlot.offsetHeight + gap * 2 + dockChrome;
      const room = below / 2 - underStage + gap / 2;
      const fits = below - MIN_CROP_STAGE_REM * remPixels - underStage;
      dockPanelMax = Math.max(
        room,
        Math.min(
          MIN_CROP_PANEL_REM * remPixels,
          Math.max(fits, SHORT_CROP_PANEL_REM * remPixels)
        )
      );
    });
  });

  // A tool the new selection lacks closes, so it does not open again by
  // surprise when a later selection has it.
  $effect(() => {
    if (activeTool && !availablePanels(selection).includes(activeTool)) {
      activeTool = null;
    }
  });

  function toolDisabled(id: PostToolId): boolean {
    if (exporting) return true;
    switch (id) {
      case "split":
        return !editor.splitTarget;
      case "duplicate":
      case "delete":
        return !editor.selectionEditable;
      case "beats":
        return !canTapBeats;
      case "tutorial":
        return editor.takes.length === 0;
      case "template":
        return (
          editor.project.tracks[0]?.items.filter(
            (item) => item.kind === "video"
          ).length < 2 ||
          editor.project.sequenceId === "ΩΛ-XJ" ||
          loadingTemplate
        );
      default:
        return false;
    }
  }

  // ---- Actions ---------------------------------------------------------------

  /** Opens beat tapping on a clip's footage, starting at its first frame. */
  function openBeats(clip: PostVideoItem): void {
    editor.pause();
    session.openAt(clip.takeId, clip.sourceIn);
    editor.mode = "timing";
  }

  /** From the video list: starts where the take's first clip does. */
  function openTakeBeats(takeId: string): void {
    let firstClip: PostVideoItem | null = null;
    for (const track of editor.project.tracks) {
      for (const item of track.items) {
        if (item.kind === "video" && item.takeId === takeId) {
          if (!firstClip || item.start < firstClip.start) firstClip = item;
        }
      }
    }
    editor.pause();
    session.openAt(takeId, firstClip?.sourceIn ?? 0);
    editor.mode = "timing";
  }

  function tapBeatsHere(): void {
    if (beatsClip) openBeats(beatsClip);
  }

  function applyTutorial(): void {
    editor.pause();
    editor.applyTutorial({
      runThrough: t("post_editor_run_through"),
      slowMo: t("post_editor_slow_mo"),
      card: t("post_editor_card_label"),
    });
  }

  async function useOmegaTemplate(): Promise<void> {
    loadingTemplate = true;
    templateError = null;
    try {
      const saved = await loadPostDraft("ΩΛ-XJ");
      if (!saved.project)
        throw new Error(saved.error ?? "The ΩΛ-XJ draft could not be found.");
      editor.pause();
      if (!editor.applyTemplate(saved.project)) {
        throw new Error(
          "Add at least two video clips before using the template."
        );
      }
    } catch (error) {
      templateError =
        error instanceof Error
          ? error.message
          : "The template could not be applied.";
    } finally {
      loadingTemplate = false;
    }
  }

  function pickTool(id: PostToolId): void {
    if (cropMode && id !== "crop") {
      cropFlight.capture();
      crop.abandonGesture();
      editor.endSession(true);
      cropSessionOpen = false;
      cropReturn = null;
      activeTool = null;
      void tick().then(() => cropFlight.play());
    }
    if (isPanelTool(id)) {
      openTool(id);
      return;
    }
    switch (id) {
      case "back":
        deselect();
        void focusAfterUpdate({ kind: "row" });
        return;
      case "split":
        editor.pause();
        if (editor.splitAtPlayhead()) {
          void focusAfterUpdate({ kind: "tool", id: "split" });
        }
        return;
      case "tutorial":
        applyTutorial();
        return;
      case "template":
        void useOmegaTemplate();
        return;
      case "beats":
        tapBeatsHere();
        return;
      case "duplicate":
        if (editor.duplicateSelected()) {
          void focusAfterUpdate({ kind: "tool", id: "duplicate" });
        }
        return;
      case "delete":
        if (editor.deleteSelected()) void focusAfterUpdate({ kind: "row" });
        return;
    }
  }

  function openTool(id: PostPanelToolId): void {
    if (id === "crop") {
      void openCrop();
      return;
    }
    activeTool = id;
    // Beside the preview the row works like tabs and focus stays on it. On a
    // phone the panel takes the row's place, so focus moves into it.
    if (!panelBeside) void focusAfterUpdate({ kind: "panel" });
  }

  /** Crop opens its own screen on the selected clip, from a still frame. */
  async function openCrop(): Promise<void> {
    if (cropMode || editor.selectedItem?.kind !== "video") return;
    editor.pause();
    // Crop edits the frame under the playhead, so it starts inside the clip.
    seekInClip(editor.previewSeconds);
    cropReturn = activeTool === "crop" ? null : activeTool;
    cropSourceView = true;
    cropSourceShape = null;
    cropFlight.capture();
    activeTool = "crop";
    await tick();
    cropFlight.play();
    findShown("[data-crop-frame]")?.focus({ preventScroll: true });
  }

  /**
   * Done keeps the crop as one undo step; Cancel puts the clip back as it
   * was. Either way the panel that was open before comes back.
   */
  async function closeCrop(keep: boolean): Promise<void> {
    if (!cropMode) return;
    cropFlight.capture();
    crop.abandonGesture();
    editor.endSession(keep);
    cropSessionOpen = false;
    activeTool = cropReturn;
    cropReturn = null;
    await tick();
    cropFlight.play();
    void focusAfterUpdate({ kind: "tool", id: "crop" });
  }

  /** Crop plays its clip round and round, from the start once it ran out. */
  function toggleCropPlayback(): void {
    const clip = crop.item;
    if (!clip) return;
    if (!editor.isPlaying) {
      const seconds = editor.previewSeconds;
      if (seconds < clip.start || seconds >= itemEnd(clip) - FRAME_SECONDS) {
        editor.seek(clip.start);
      }
    }
    editor.togglePlayback();
  }

  /**
   * A seek on the crop screen stays on the clip, exactly: a playhead a hair
   * before its start, as a slider's rounding leaves it, shows the clip no
   * picture at all.
   */
  function seekInClip(seconds: number): void {
    const clip = crop.item ?? editor.selectedItem;
    if (!clip) return;
    const last = Math.max(clip.start, itemEnd(clip) - FRAME_SECONDS);
    const inside = Math.min(last, Math.max(clip.start, seconds));
    if (inside !== editor.previewSeconds) editor.seek(inside);
  }

  /** The beats tapped for the crop clip's take, where a keyframe likely goes. */
  const cropSteps = $derived.by((): ClipStep[] => {
    const clip = cropMode ? crop.item : null;
    if (!clip) return [];
    return clipSteps(
      clip,
      editor.timing(clip.takeId),
      editor.resolvedTiming(clip.takeId)
    );
  });

  function cropStepName(step: ClipStep): string {
    const time = formatTakeClock(step.seconds - (crop.item?.start ?? 0));
    return step.position === 0
      ? t("post_crop_opening_at", { time })
      : t("post_crop_beat_at", { count: step.label, time });
  }

  function stepCropBeat(direction: "previous" | "next"): void {
    const seconds = adjacentStepSeconds(
      cropSteps,
      editor.previewSeconds,
      direction
    );
    editor.pause();
    if (seconds !== null) seekInClip(seconds);
  }

  /** The crop timeline's Curve chip, apart from the stowed timeline's. */
  let cropCurveOpen = $state(false);

  function openCropCurve(fromSeconds: number): void {
    editor.pause();
    seekInClip(fromSeconds);
    cropCurveOpen = true;
  }

  /** Done on a phone: back to the row, on the tool that opened the panel. */
  function closePanel(): void {
    const tool = shown;
    activeTool = null;
    void focusAfterUpdate(tool ? { kind: "tool", id: tool } : { kind: "row" });
  }

  function deselect(): void {
    editor.selectedItemId = null;
    activeTool = null;
  }

  /** Export is the post's own panel: sound, the to-do list and the render. */
  function openExport(): void {
    editor.selectedItemId = null;
    activeTool = "export";
    void focusAfterUpdate({ kind: "panel" });
  }

  /** New text opens its words; anything else shows the new item's tools. */
  function itemAdded(kind: PostItemKind): void {
    if (kind === "text") {
      activeTool = "text";
      void focusAfterUpdate({ kind: "field", selector: "textarea" });
      return;
    }
    activeTool = null;
    void focusAfterUpdate(panelBeside ? { kind: "panel" } : { kind: "row" });
  }

  function pickDeviceVideo(): void {
    if (readingFile) return;
    fileError = "";
    fileInput?.click();
  }

  async function importRecovery(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const selected = [...(input.files ?? [])];
    input.value = "";
    if (!selected.length) return;
    readingFile = true;
    fileError = "";
    try {
      const backupFile = selected.find((file) =>
        file.name.endsWith(".post-studio.json")
      );
      const backup = backupFile
        ? parsePostStudioBackup(await backupFile.text(), sequence.id)
        : null;
      if (backup) {
        const files = new Map(selected.map((file) => [file.name, file]));
        await loadPostProjectFonts(backup, files);
        editor.importProject(backup, files);
        activeTool = null;
        return;
      }
      if (!selected.some((file) => file.name.endsWith(".post-studio.json"))) {
        const files = new Map(selected.map((file) => [file.name, file]));
        await loadPostProjectFonts(editor.project, files);
        if (!editor.relinkProjectFiles(files))
          throw new Error(
            "Select the saved post's original media files, or a .post-studio.json recovery file to import a post."
          );
        return;
      }
      const { project, files } = await readInShotRecoveryPackage(
        selected,
        sequence.id,
        Date.now()
      );
      editor.importProject(project, files);
      activeTool = null;
    } catch (error) {
      fileError =
        error instanceof Error
          ? error.message
          : "Could not import the recovered post.";
    } finally {
      readingFile = false;
    }
  }

  async function addDeviceVideo(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    readingFile = true;
    fileError = "";
    try {
      const duration = await readVideoFile(file);
      editor.pause();
      if (editor.addLocalVideo(file, duration)) itemAdded("video");
    } catch (caught) {
      fileError = videoFileError(caught);
    } finally {
      readingFile = false;
    }
  }

  /**
   * A timeline drag reports each step between its start and end; a single
   * call outside a drag (a keyboard move) is its own undo step.
   */
  function asOneStep(run: () => void): void {
    if (editor.inGesture) {
      run();
      return;
    }
    editor.beginGesture();
    run();
    editor.endGesture();
  }

  function applyMove(change: PostEdit): void {
    asOneStep(() => editor.gestureStep(change));
  }

  function seekFromTimeline(seconds: number): void {
    editor.pause();
    editor.seek(seconds);
  }

  function openCrossfade(outgoingId: string, incomingId: string): void {
    editor.pause();
    const trackIndex = findItem(editor.project, outgoingId)?.trackIndex;
    if (trackIndex === undefined) return;
    if (
      !findItem(editor.project, outgoingId)?.item.transitionOut &&
      !editor.edit((project, context) =>
        setTrackCutCrossfade(
          project,
          trackIndex,
          outgoingId,
          incomingId,
          true,
          context
        )
      )
    )
      return;
    editor.selectedItemId = outgoingId;
    const outgoing = findItem(editor.project, outgoingId)?.item;
    const incoming = findItem(editor.project, incomingId)?.item;
    if (outgoing && incoming) {
      editor.seek((incoming.start + itemEnd(outgoing)) / 2);
    }
    openTool("fade");
  }

  // ---- Keyframe rows -------------------------------------------------------

  /**
   * A keyframe row picked on the timeline. It holds only while the same clip
   * and tool stay up, so opening Fade goes back to keying Fade.
   */
  let pickedKeyRow = $state<{
    itemId: string;
    tool: PostPanelToolId | null;
    channel: PostKeyframeChannel;
  } | null>(null);
  let keyCurveOpen = $state(false);

  /** What the toolbar diamond and K key: the picked row, else the open tool's channel. */
  const keyChannel = $derived.by((): PostKeyframeChannel | null => {
    const item = editor.selectedItem;
    if (!item) return null;
    const picked = pickedKeyRow;
    if (
      picked &&
      picked.itemId === item.id &&
      picked.tool === shown &&
      channelsOf(item).includes(picked.channel)
    ) {
      return picked.channel;
    }
    if (
      (item.kind === "video" || item.kind === "image") &&
      item.sourceGeometry &&
      shown !== "fade"
    )
      return "sourceGeometry";
    return keyframeChannelFor(shown, item.kind);
  });

  function pickKeyRow(channel: PostKeyframeChannel): void {
    const item = editor.selectedItem;
    if (item) pickedKeyRow = { itemId: item.id, tool: shown, channel };
  }

  function editKeys(
    itemId: string,
    change: (item: PostItem) => PostItem
  ): void {
    editor.edit((project, ctx) =>
      editItemKeyframes(project, itemId, change, ctx)
    );
  }

  const clearablePostKeys = $derived(
    editor.project.tracks.reduce(
      (total, track) =>
        total +
        (track.locked
          ? 0
          : track.items.reduce((sum, item) => sum + keyframeCount(item), 0)),
      0
    )
  );
  const lockedPostKeys = $derived(
    editor.project.tracks.reduce(
      (total, track) =>
        total +
        (!track.locked
          ? 0
          : track.items.reduce((sum, item) => sum + keyframeCount(item), 0)),
      0
    )
  );
  let confirmClearPost = $state(false);
  let clearToast: { id: string; project: PostProject } | null = null;

  $effect(() => {
    const current = editor.project;
    if (clearToast && current !== clearToast.project) {
      removeToast(clearToast.id);
      clearToast = null;
    }
  });

  function reportCleared(count: number, edit: PostEdit): void {
    if (!count || !editor.edit(edit)) return;
    const clearedProject = editor.project;
    if (clearToast) removeToast(clearToast.id);
    const id = showToast({
      message: t("post_keyframe_cleared", { count }),
      type: "success",
      action: {
        label: t("post_editor_undo"),
        onClick: () => {
          if (editor.project === clearedProject) editor.undo();
        },
      },
    });
    clearToast = { id, project: clearedProject };
  }

  function clearClipKeys(itemId: string): void {
    const located = findItem(editor.project, itemId);
    if (!located || editor.project.tracks[located.trackIndex]?.locked) return;
    const count = keyframeCount(located.item);
    reportCleared(count, (project, ctx) =>
      clearProjectKeyframes(project, editor.previewSeconds, ctx, itemId)
    );
  }

  function clearPostKeys(): void {
    confirmClearPost = false;
    reportCleared(clearablePostKeys, (project, ctx) =>
      clearProjectKeyframes(project, editor.previewSeconds, ctx)
    );
  }

  // A curve's easing is edited from the toolbar's Curve chip, which follows
  // the playhead, so the playhead goes to the curve's first key.
  function openKeyCurve(
    itemId: string,
    channel: PostKeyframeChannel,
    fromSeconds: number
  ): void {
    pickKeyRow(channel);
    seekFromTimeline(fromSeconds);
    keyCurveOpen = true;
  }

  function zoomTimeline(factor: number): void {
    pixelsPerSecond = clampPixelsPerSecond(pixelsPerSecond * factor);
  }

  // ---- Keys ----------------------------------------------------------------

  const FRAME_SECONDS = 1 / POST_FRAME_RATE;
  const ZOOM_STEP = 1.25;

  /** Text entry, where letters are typed. A slider is not typing. */
  function isTyping(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const field = target.closest("input, textarea");
    return (
      field !== null &&
      !(
        field instanceof HTMLInputElement &&
        ["range", "checkbox", "radio", "button", "submit", "reset"].includes(
          field.type
        )
      )
    );
  }

  /** Controls that answer Enter themselves. */
  function isControl(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLElement &&
      Boolean(target.closest("button, a, [role='slider'], [role='radio']"))
    );
  }

  /** Controls that use the arrow keys, Home and End themselves. */
  function ownsArrows(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLElement &&
      Boolean(
        target.closest(
          "input[type='range'], [role='slider'], [role='radio'], [role='radiogroup'], [role='menu'], [role='menuitem'], [role='listbox'], [role='option'], [role='tab'], [role='tablist']"
        )
      )
    );
  }

  /** Playback owns Space before focused buttons and popovers can activate. */
  function handlePlaybackKey(event: KeyboardEvent): void {
    if (
      !active ||
      exporting ||
      event.key !== " " ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      isTyping(event.target)
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // Leave the action row so playback does not reactivate its last tool.
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("[data-tool]")
    ) {
      rootElement?.focus({ preventScroll: true });
    }
    if (event.repeat) return;
    if (showTimingStage) session.togglePlay();
    else if (cropMode) toggleCropPlayback();
    else editor.togglePlayback();
  }

  function mirrorWholePost(): void {
    session.pause();
    editor.pause();
    keyCurveOpen = false;
    editor.edit(mirrorPostProject);
  }

  /**
   * The editor's keys. On the beat tapper its own keys answer instead (T
   * taps, Space plays the take). A studio the viewer keeps mounted out of
   * sight ignores every key, and so does one that is rendering: the render
   * seeks the post frame by frame, and playback would move the clock between
   * a seek and its capture. Ctrl+Z and Ctrl+Y belong to the app's edit
   * history, which presses the top bar's Undo and Redo.
   */
  function handleKey(event: KeyboardEvent): void {
    if (!active || exporting) return;
    if (showTimingStage) {
      session.handleKey(event);
      return;
    }
    if (event.defaultPrevented || event.altKey || isTyping(event.target)) {
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      if (!cropMode && event.key.toLowerCase() === "d" && !event.shiftKey) {
        event.preventDefault();
        editor.duplicateSelected();
      }
      return;
    }
    if (cropMode && handleCropKey(event)) return;
    switch (event.key) {
      case "s":
      case "S":
        if (event.repeat) return;
        event.preventDefault();
        editor.pause();
        editor.splitAtPlayhead();
        return;
      case "k":
      case "K": {
        if (event.repeat) return;
        const item = editor.selectedItem;
        if (!item || editor.isLocked(item.id)) return;
        const seconds = editor.previewSeconds;
        if (
          seconds < item.start - POST_TIME_EPSILON ||
          seconds > itemEnd(item) + POST_TIME_EPSILON
        ) {
          return;
        }
        event.preventDefault();
        // K keys the picked keyframe row, else what the tool on screen
        // edits: Crop, Position or Fade.
        const channel = keyChannel ?? keyframeChannelFor(shown, item.kind);
        editor.edit((project, ctx) =>
          editItemKeyframes(
            project,
            item.id,
            (it) => toggleKeyframe(it, channel, seconds),
            ctx
          )
        );
        return;
      }
      case "Delete":
      case "Backspace":
        if (!editor.selectedItem) return;
        event.preventDefault();
        // The item's clip and tools go with it, as with the Delete tool.
        if (editor.deleteSelected()) void focusAfterUpdate({ kind: "row" });
        return;
      case "ArrowLeft":
      case "ArrowRight": {
        if (ownsArrows(event.target)) return;
        event.preventDefault();
        editor.pause();
        const step = event.shiftKey ? 1 : FRAME_SECONDS;
        editor.seek(
          editor.previewSeconds + (event.key === "ArrowLeft" ? -step : step)
        );
        return;
      }
      case "Home":
      case "End":
        if (ownsArrows(event.target)) return;
        event.preventDefault();
        editor.pause();
        editor.seek(event.key === "Home" ? 0 : editor.durationSeconds);
        return;
      case "+":
      case "=":
        event.preventDefault();
        zoomTimeline(ZOOM_STEP);
        return;
      case "-":
        event.preventDefault();
        zoomTimeline(1 / ZOOM_STEP);
        return;
      case "Escape":
        if (editor.inGesture) return;
        // A phone's open panel closes first, then the selection clears.
        if (!panelBeside && shown !== null) {
          event.preventDefault();
          closePanel();
          return;
        }
        if (!editor.selectedItemId) return;
        event.preventDefault();
        deselect();
        return;
    }
  }

  /**
   * The crop screen's keys, true when the key is the screen's to answer.
   * Enter is Done and Escape is Cancel, unless a drag or a held corner is
   * running: Escape then drops only that. Space loops the clip, the arrows,
   * Home and End stay on it, Up and Down go to the beat before or after, and
   * K still keys the framing. Split, Delete, Duplicate and the timeline's
   * zoom wait until the crop is done.
   */
  function handleCropKey(event: KeyboardEvent): boolean {
    switch (event.key) {
      case "Enter":
        if (
          event.repeat ||
          isControl(event.target) ||
          ownsArrows(event.target)
        ) {
          return true;
        }
        if (crop.busy || editor.inGesture) return true;
        event.preventDefault();
        void closeCrop(true);
        return true;
      case "Escape":
        if (crop.busy || editor.inGesture) return true;
        event.preventDefault();
        void closeCrop(false);
        return true;
      case "ArrowLeft":
      case "ArrowRight": {
        if (ownsArrows(event.target)) return true;
        event.preventDefault();
        editor.pause();
        const step = event.shiftKey ? 1 : FRAME_SECONDS;
        seekInClip(
          editor.previewSeconds + (event.key === "ArrowLeft" ? -step : step)
        );
        return true;
      }
      case "ArrowUp":
      case "ArrowDown":
        if (ownsArrows(event.target)) return true;
        event.preventDefault();
        stepCropBeat(event.key === "ArrowUp" ? "previous" : "next");
        return true;
      case "Home":
      case "End":
        if (ownsArrows(event.target)) return true;
        event.preventDefault();
        editor.pause();
        seekInClip(event.key === "Home" ? -Infinity : Infinity);
        return true;
      case "s":
      case "S":
      case "Delete":
      case "Backspace":
      case "+":
      case "=":
      case "-":
        return true;
      default:
        return false;
    }
  }

  // ---- The viewer shell ------------------------------------------------------

  // The viewer shell shows the studio's own panel in its side inspector.
  $effect(() => {
    if (active) sharedSurfaces?.setInspectorContent("studio");
  });

  $effect(() =>
    sharedSurfaces?.setControls(() => ({
      playing: editor.isPlaying,
      bpm: 60,
      propType: selectedPropType,
      toggle: editor.togglePlayback,
      setBpm: () => undefined,
      setProp: choosePropType,
    }))
  );

  let sharedEntryRevision = 0;
  $effect(() => {
    if (!active || !sharedSurfaces?.active) return;
    const entry = sharedSurfaces.entry;
    if (entry.revision === sharedEntryRevision) return;
    sharedEntryRevision = entry.revision;
    untrack(() => {
      if (editor.isPlaying !== entry.playing && editor.mode !== "timing") {
        editor.togglePlayback();
      }
    });
  });

  // ---- Focus -----------------------------------------------------------------

  type FocusTarget =
    | { kind: "tool"; id: PostToolId }
    | { kind: "row" }
    | { kind: "panel" }
    | { kind: "field"; selector: string };

  /** The first match that is not fading out. */
  function findShown(selector: string): HTMLElement | null {
    // The panel may sit in the viewer's side panel, outside this section.
    for (const scope of [rootElement, panelHost]) {
      if (!scope) continue;
      for (const element of scope.querySelectorAll<HTMLElement>(selector)) {
        if (!element.closest("[inert]")) return element;
      }
    }
    return null;
  }

  /**
   * Moves focus once swapped tools are on screen: into the new panel, to the
   * same tool in the new row, or to the row's first tool.
   */
  async function focusAfterUpdate(target: FocusTarget): Promise<void> {
    await tick();
    const firstTool = () =>
      findShown('[data-tool]:not([data-tool="back"]):not(:disabled)');
    let element: HTMLElement | null;
    switch (target.kind) {
      case "tool":
        element =
          findShown(`[data-tool="${target.id}"]:not(:disabled)`) ?? firstTool();
        break;
      case "row":
        element = firstTool();
        break;
      case "panel":
        element = findShown("[data-tool-panel]");
        break;
      case "field":
        element =
          findShown(`[data-tool-panel] ${target.selector}`) ??
          findShown("[data-tool-panel]");
        break;
    }
    element?.focus({ preventScroll: true });
    if (target.kind === "field" && element instanceof HTMLTextAreaElement) {
      element.select();
    }
  }

  // A pick on the timeline or the preview can swap the tools while focus sits
  // in them. Focus moves to their holder before the old ones fade out, so Tab
  // continues into the new ones instead of starting over at the page.
  let swapKeys = { row: "", panel: "", dock: "" };
  $effect.pre(() => {
    const next = { row: rowKey, panel: shown ?? "", dock: dockKey };
    untrack(() => {
      const previous = swapKeys;
      swapKeys = next;
      const focused = document.activeElement;
      // The preview's box goes with the selection, so focus on it would drop
      // to the page. It stays in the editor instead.
      if (
        !editor.selectedItemId &&
        focused !== canvasRoot &&
        canvasRoot?.contains(focused)
      ) {
        rootElement?.focus({ preventScroll: true });
        return;
      }
      const holders: [HTMLElement | null, boolean][] = [
        [rowSlot, next.row !== previous.row],
        [panelSlot, next.panel !== previous.panel],
        [dockElement, next.dock !== previous.dock],
      ];
      for (const [holder, swapping] of holders) {
        if (
          swapping &&
          holder &&
          focused !== holder &&
          holder.contains(focused)
        ) {
          holder.focus({ preventScroll: true });
          return;
        }
      }
    });
  });

  // Tapping beats swaps the post for the take, and Back to editing swaps it
  // back. Focus follows to the new controls instead of dropping to the page.
  let shownSurface: "timing" | "edit" | null = null;
  $effect(() => {
    const surface = showTimingStage ? "timing" : "edit";
    const changed = shownSurface !== null && shownSurface !== surface;
    shownSurface = surface;
    if (!changed) return;
    untrack(() => {
      const focused = document.activeElement;
      if (focused && focused !== document.body) return;
      if (surface === "edit") {
        void focusAfterUpdate({ kind: "tool", id: "beats" });
      } else {
        (panelBeside ? panelHost : dockElement)?.focus({ preventScroll: true });
      }
    });
  });

  $effect(() => {
    if (showTimingStage) untrack(() => editor.pause());
    else untrack(() => session.pause());
  });

  $effect(() => {
    // The shell reads the outgoing play intent before releasing its loan.
    if (!active && !sharedSurfaces?.active) {
      untrack(() => {
        editor.pause();
        session.pause();
      });
    }
  });

  let frameRequest: number | null = null;
  let previousFrameTime: number | null = null;
  let previousPreviewSeconds: number | null = null;
  let playbackNeedsAlign = false;

  function frame(now: number): void {
    if (previousFrameTime !== null) {
      if (
        playbackNeedsAlign ||
        (previousPreviewSeconds !== null &&
          editor.previewSeconds !== previousPreviewSeconds)
      ) {
        playbackCanvas?.alignPlayback();
        playbackNeedsAlign = false;
      }
      const delta =
        playbackCanvas?.playbackStep((now - previousFrameTime) / 1000) ?? 0;
      const clip = cropMode ? crop.item : null;
      if (clip) loopClip(clip, delta);
      else editor.advance(delta);
    }
    previousFrameTime = now;
    previousPreviewSeconds = editor.previewSeconds;
    if (editor.isPlaying) frameRequest = requestAnimationFrame(frame);
  }

  /** On the crop screen playback wraps from the clip's end to its start. */
  function loopClip(clip: PostVideoItem, delta: number): void {
    const length = itemEnd(clip) - clip.start;
    const next = editor.previewSeconds + delta;
    if (
      length <= FRAME_SECONDS ||
      (next >= clip.start && next < itemEnd(clip))
    ) {
      editor.advance(delta);
      return;
    }
    const into = (((next - clip.start) % length) + length) % length;
    editor.seek(clip.start + into);
    playbackNeedsAlign = true;
  }

  $effect(() => {
    if (!editor.isPlaying) return;
    frameRequest = requestAnimationFrame(frame);
    return () => {
      if (frameRequest !== null) cancelAnimationFrame(frameRequest);
      frameRequest = null;
      previousFrameTime = null;
      previousPreviewSeconds = null;
      playbackNeedsAlign = false;
    };
  });

  // ---- Render --------------------------------------------------------------

  function nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  async function renderPost(): Promise<boolean> {
    if (!canRender) {
      exportError =
        labeledCard.error ??
        overlayError ??
        "The animation is still being prepared. Try again in a moment.";
      return false;
    }
    session.pause();
    if (!canvasRoot) {
      // The beat tapper stands where the post is drawn; the render needs the
      // post back on screen.
      editor.mode = "edit";
      await tick();
      await nextFrame();
    }
    const root = canvasRoot;
    const compiled = editor.compiled;
    if (!root || !compiled) return false;

    const previousTime = editor.previewSeconds;
    const wasPlaying = editor.isPlaying;
    editor.pause();
    exportCancelled = false;
    exportAbort = new AbortController();
    exportError = "";
    const totalFrames = Math.ceil(
      compiled.durationSeconds * compiled.preset.output.frameRate
    );
    exportProgress = { completedFrames: 0, totalFrames, phase: "audio" };

    let audioUrl: string | null = null;
    try {
      await loadPostProjectFonts(editor.project);
      const takeUrls = new Map<string, string>();
      const videoSources = new Map<string, string>();
      for (const take of editor.takes) {
        const url = editor.mediaUrl(take.id);
        if (url) {
          takeUrls.set(take.id, url);
          videoSources.set(takeRole(take.id), url);
        }
      }
      const audio = await buildMixedAudioTrack({
        segments: planProjectAudio(compiled, editor.project.audio),
        durationSeconds: compiled.durationSeconds,
        takeUrls,
        signal: exportAbort.signal,
      });
      if (exportCancelled) return false;
      audioUrl = audio ? URL.createObjectURL(audio) : null;
      exportProgress = { completedFrames: 0, totalFrames, phase: "rendering" };

      const blob = await exportPostStudioVideo({
        root,
        preset: compiled.preset,
        durationSeconds: compiled.durationSeconds,
        getLayers: () => editor.frameLayers,
        seek: editor.seek,
        painters: exportPainters(),
        videoSources,
        originalAudioUrl: audioUrl,
        originalAudioStartSeconds: 0,
        onProgress: (progress) => (exportProgress = progress),
        shouldCancel: () => exportCancelled,
        signal: exportAbort.signal,
      });
      if (exportedUrl) URL.revokeObjectURL(exportedUrl);
      exportedUrl = URL.createObjectURL(blob);
      onExported?.(blob);
      return true;
    } catch (error) {
      if (!exportCancelled) {
        console.error("[PostStudio] Export failed:", error);
        exportError =
          error instanceof Error
            ? error.message
            : t("share_studio_render_failed");
      }
      return false;
    } finally {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      exportProgress = null;
      editor.seek(previousTime);
      if (wasPlaying) editor.togglePlayback();
    }
  }

  function cancelExport(): void {
    exportCancelled = true;
    exportAbort?.abort();
  }

  const releaseExport = registerExport({
    render: renderPost,
    cancel: cancelExport,
  });

  onDestroy(() => {
    exportCancelled = true;
    exportAbort?.abort();
    releaseExport();
    if (frameRequest !== null) cancelAnimationFrame(frameRequest);
    if (exportedUrl) URL.revokeObjectURL(exportedUrl);
    editor.dispose();
    staffTips.dispose();
  });
</script>

<svelte:window
  onkeydowncapture={handlePlaybackKey}
  onkeydown={handleKey}
  onbeforeunload={protectUnsavedDraft}
/>

{#snippet draftStatus()}
  {#if templateError}
    <span class="draft-notice" role="alert">{templateError}</span>
  {/if}
  {#if labeledCard.error}
    <span class="draft-notice" role="alert">{labeledCard.error}</span>
  {:else if (editor.project.mirrored || editor.project.sequenceActions?.length) && labeledCard.pending}
    <span class="draft-notice" role="status"
      >Preparing the changed animation and cards…</span
    >
  {/if}
  {#if !header}
    <PostDraftStatus
      saving={draftSaving}
      error={draftError ?? editor.saveError}
      disk={!!onSaveDraft}
    />
  {/if}
{/snippet}

{#snippet postActions(inHeader: boolean)}
  <PostEditorActions
    {exporting}
    locked={showTimingStage || (inHeader && cropMode)}
    onClearPostKeyframes={() => (confirmClearPost = true)}
    clearableKeyframes={clearablePostKeys}
    onMirror={mirrorWholePost}
    mirrored={editor.project.mirrored ?? false}
    onBackup={() => void downloadDraft()}
    onRestore={() => recoveryInput?.click()}
    onRetry={() => draftAutosave?.retry()}
    canRetry={!!onSaveDraft && !!(draftError ?? editor.saveError)}
    onExport={openExport}
    onImport={() => {
      if (!readingFile) recoveryInput?.click();
    }}
    onImportDifferences={editor.project.importSource?.unresolved.length
      ? () => (showImportDifferences = true)
      : undefined}
    trailing={cropMode && !inHeader ? cropActions : undefined}
  />
{/snippet}

{#snippet editorActions()}
  {@render postActions(false)}
{/snippet}

{#snippet headerActions()}
  <div class="header-actions" inert={sharing || undefined}>
    <PostDraftStatus
      saving={draftSaving}
      error={saveFailure}
      disk={!!onSaveDraft}
      {savedAt}
      header
    />
    <PostSaveButton status={saveStatus} onSave={saveNow} disabled={exporting} />
    {@render postActions(true)}
  </div>
{/snippet}

{#snippet cropActions()}
  <div class="crop-actions">
    <PanelButton onclick={() => void closeCrop(false)}>
      {t("common_cancel")}
    </PanelButton>
    <PanelButton variant="primary" onclick={() => void closeCrop(true)}>
      <i class="fa-solid fa-check" aria-hidden="true"></i>
      {t("share_studio_done")}
    </PanelButton>
  </div>
{/snippet}

{#snippet topBar()}
  <PostEditorTopBar
    {editor}
    {exporting}
    draftStatus={header && !draftNotice ? undefined : draftStatus}
    actions={header ? (cropMode ? cropActions : undefined) : editorActions}
  />
{/snippet}

{#snippet row()}
  <PostToolRow
    {tools}
    shown={panelBeside ? shown : null}
    isDisabled={toolDisabled}
    onpick={pickTool}
  />
{/snippet}

{#snippet panelBody(tool: PostPanelToolId, placement: "dock" | "side")}
  {#if tool === "videos"}
    <PostMediaPanel
      {editor}
      {catalog}
      catalogLoading={videoLibrary?.loading ?? false}
      catalogError={videoLibrary?.error ?? ""}
      busy={readingFile}
      onAddDeviceVideo={pickDeviceVideo}
      onTapBeats={openTakeBeats}
    />
  {:else if tool === "add"}
    <PostAddPanel
      {editor}
      {catalog}
      busy={readingFile}
      onAddDeviceVideo={pickDeviceVideo}
      onAdded={itemAdded}
    />
  {:else if tool === "canvas"}
    <div class="canvas-tool">
      <PostRatioPicker
        options={POST_CANVAS_RATIOS.map((canvas) => ({
          value: canvas,
          label: canvas,
          ratio: ratioValue(canvas),
        }))}
        value={postCanvasOf(editor.project)}
        onchange={setCanvas}
        ariaLabel={t("post_canvas_shape")}
      />
      <!-- Words, not icons: this control shows an option's icon in place of
           its label, and a drop and a square say little on their own. -->
      <SegmentedControl
        color="accent"
        options={[
          { value: "dark", label: t("post_canvas_background_dark") },
          { value: "blur", label: t("post_canvas_background_blur") },
        ]}
        value={editor.project.background ?? POST_DEFAULT_BACKGROUND}
        onchange={setBackground}
        ariaLabel={t("post_canvas_background")}
      />
    </div>
  {:else if tool === "look"}
    <AnimationPanel
      layout="sidebar"
      isExporting={false}
      isPlaying={editor.isPlaying}
      onPlaybackToggle={editor.togglePlayback}
      showTempoControls={false}
      showEffectsPlayback={false}
      {selectedPropType}
      onPropChange={choosePropType}
      sequence={displaySequence}
    />
  {:else if tool === "export"}
    <PostExportPanel
      {editor}
      {canRender}
      {exporting}
      {exportPercent}
      {exportedUrl}
      {exportFilename}
      {exportError}
      onRender={() => void renderPost()}
      onCancel={cancelExport}
      onTapBeats={openTakeBeats}
      {onSharePost}
    />
  {:else if editor.selectedItem}
    <PostItemTool
      {editor}
      item={editor.selectedItem}
      {tool}
      appearanceFill={placement === "side"}
      crop={cropMode ? crop : null}
      {cropSourceView}
      bind:chosenSourceShape={cropSourceShape}
      onCropFramingControl={() => (cropSourceView = false)}
      onCropSourceControl={() => (cropSourceView = true)}
      {staffTips}
      {cardRenderOptions}
      stepCount={displaySequence.steps?.length ?? 0}
      sequenceBusy={labeledCard.pending}
    />
  {/if}
{/snippet}

{#snippet panel(tool: PostPanelToolId, placement: "dock" | "side")}
  <PostToolPanel
    {tool}
    subject={editor.selectedItem ? labelFor(editor.selectedItem) : undefined}
    onDone={placement === "dock" && !cropMode ? closePanel : undefined}
    {placement}
    bare={(placement === "dock" && cropMode) ||
      (placement === "side" &&
        tool === "appearance" &&
        editor.selectedItem?.kind === "animation")}
  >
    {@render panelBody(tool, placement)}
  </PostToolPanel>
{/snippet}

{#snippet timelineKeys()}
  {#if editor.selectedItem && keyChannel}
    <PostKeyframeControls
      {editor}
      item={editor.selectedItem}
      channel={keyChannel}
      locked={editor.isLocked(editor.selectedItem.id)}
      label={channelLabel(keyChannel)}
      bind:curveOpen={keyCurveOpen}
      onCleared={reportCleared}
    />
    <OverflowMenu
      triggerPresentation="labelled"
      ariaLabel={t("post_keyframe_clip_actions")}
      placement="bottom"
      items={[
        {
          label: t("post_keyframe_remove_all_clip"),
          icon: "fa-solid fa-diamond",
          disabled:
            editor.isLocked(editor.selectedItem.id) ||
            keyframeCount(editor.selectedItem) === 0,
          action: () => clearClipKeys(editor.selectedItem!.id),
        },
      ]}
    >
      {#snippet trigger()}{t("post_keyframe_clip_actions")}{/snippet}
    </OverflowMenu>
  {/if}
{/snippet}

{#snippet cropKeys()}
  {#if crop.item}
    <PostKeyframeControls
      {editor}
      item={crop.item}
      channel="framing"
      locked={editor.isLocked(crop.item.id)}
      bind:curveOpen={cropCurveOpen}
      onCleared={reportCleared}
    />
  {/if}
{/snippet}

{#snippet timingPanel()}
  <div class="timing-panel">
    <PostTimingPanel
      {session}
      showPrimary={panelBeside}
      bind:animationOpen={timingAnimationOpen}
    >
      {#snippet animation()}
        <div
          class="timing-animation"
          tabindex="-1"
          bind:this={timingAnimationSection}
        >
          <PostTimingAnimationSettings {editor} {session} />
        </div>
      {/snippet}
    </PostTimingPanel>
  </div>
{/snippet}

<!-- The editor owns Space, S, K, the arrows and Delete, so the viewer's own
     handlers skip it (the app's shortcuts, Shift+P, Ctrl+Z and the rest,
     still reach it); tabindex keeps a click inside it from sending focus back
     to the page. Keep a history target inside this scope because the viewer
     moves the visible top bar into its external inspector. -->
<section
  class="post-editor"
  tabindex="-1"
  data-viewer-keys-ignore
  data-edit-history-shortcut-scope
  data-layout={layout}
  data-short-mapping={shortMappingLayout}
  data-sharing={sharing}
  data-mode={showTimingStage ? "timing" : cropMode ? "crop" : "edit"}
  style:--post-ratio={outputSize.width / outputSize.height}
  style:--crop-view={cropView}
  style:--crop-margin="{CROP_STAGE_MARGIN_PX}px"
  aria-label={t("post_editor_label", { name: sequenceName })}
  bind:this={rootElement}
  bind:offsetWidth={editorWidth}
  bind:offsetHeight={editorHeight}
>
  {#if showTimingStage}
    <EditHistoryShortcutBridge
      onUndo={session.undo}
      onRedo={session.redo}
      canUndo={session.canUndo}
      canRedo={session.canRedo}
    />
  {:else}
    <EditHistoryShortcutBridge
      onUndo={editor.undo}
      onRedo={editor.redo}
      canUndo={editor.canUndo}
      canRedo={editor.canRedo}
    />
  {/if}
  <div
    class="layout"
    style:--post-timeline-height="{shownTimelineHeightPx}px"
    style:--post-stage-min={heldStageHeight === null
      ? null
      : `${heldStageHeight}px`}
    style:--post-dock-panel-max={dockPanelMax === null
      ? null
      : `${dockPanelMax}px`}
  >
    {#if showTimingStage}
      <div class="timing-toolbar">
        <PanelButton onclick={session.exit} ariaLabel="Back to editing">
          <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
          <span class="back-label">Back to editing</span><span
            class="back-short">Back</span
          >
        </PanelButton>
        <label class="take-picker">
          <span>Take</span>
          <select
            aria-label="Take to map"
            value={session.take?.id ?? ""}
            onchange={(event) => session.selectTake(event.currentTarget.value)}
          >
            {#each session.takes as take (take.id)}<option value={take.id}
                >{take.label}</option
              >{/each}
          </select>
        </label>
        <div class="timing-save">{@render draftStatus()}</div>
      </div>
    {/if}
    {#if !showTimingStage && !panelBeside}
      <div class="top-bar-slot" inert={sharing || undefined}>
        {@render topBar()}
      </div>
    {/if}

    <div class="stage-row" bind:this={stageRow}>
      {#if showTimingStage}
        <div class="timing-stage" style:--take-ratio={timingRatio}>
          <PostTimingStage
            {session}
            bind:ratio={timingRatio}
            onOpenAnimation={openTimingAnimation}
          >
            {#snippet preview()}<PostTimingAnimationPreview
                {editor}
                {session}
                sequence={displaySequence}
              />{/snippet}
          </PostTimingStage>
        </div>
      {:else}
        <div class="preview-frame">
          <div
            class="preview-host"
            inert={!!previewTarget}
            use:reparentToInspector={previewTarget}
          >
            <div class="canvas-slot">
              <PostEditorCanvas
                bind:this={playbackCanvas}
                {editor}
                sequence={displaySequence}
                {bindingFor}
                {labelFor}
                {cardRenderOptions}
                showStripGuide={editor.selectedItem?.kind === "video"}
                interactive={!exporting && !sharing && !previewTarget}
                {exporting}
                crop={cropMode ? crop : null}
                {cropSourceView}
                keepSourceCropRatio={cropSourceShape !== "free"}
                onSourceSize={noteSourceSize}
                bind:root={canvasRoot}
              />
            </div>
          </div>
        </div>
      {/if}

      {#if panelBeside}
        <!-- Beside the preview, or moved into the viewer's side panel: the
             top bar with the panel under it, the way desktop editors keep
             Export above the settings. -->
        <aside
          class="panel-host"
          class:external={layout === "viewer"}
          class:appearance={shown === "appearance" &&
            editor.selectedItem?.kind === "animation"}
          tabindex="-1"
          data-viewer-keys-ignore
          bind:this={panelHost}
          use:reparentToInspector={externalInspector}
          inert={sharing || undefined}
          aria-label={t("post_editor_tools")}
        >
          {#if showTimingStage}
            {@render timingPanel()}
          {:else}
            <div class="side-column">
              {@render topBar()}
              <div class="panel-slot" tabindex="-1" bind:this={panelSlot}>
                {#if shown}
                  <Crossfade
                    key={shown}
                    mode="swap"
                    duration={DURATION.fast}
                    fill={layout === "wide" ||
                      (layout === "viewer" &&
                        shown === "appearance" &&
                        editor.selectedItem?.kind === "animation")}
                    animateHeight={layout === "viewer" &&
                      !(
                        shown === "appearance" &&
                        editor.selectedItem?.kind === "animation"
                      )}
                  >
                    {@render panel(shown, "side")}
                  </Crossfade>
                {/if}
              </div>
            </div>
          {/if}
        </aside>
      {/if}
    </div>

    {#if showTimingStage}
      <div class="timing-timeline">
        <PostTimingTimeline
          {session}
          squarePainter={stripPainters.get("arrows") ?? null}
        />
      </div>
    {/if}

    {#if !showTimingStage}
      <div class="transport-slot" bind:this={transportSlot}>
        {#if cropMode && crop.item}
          {@const clip = crop.item}
          <PostCropTimeline
            {editor}
            item={clip}
            steps={cropSteps}
            stepName={cropStepName}
            locked={editor.isLocked(clip.id)}
            keys={cropKeys}
            onToggle={toggleCropPlayback}
            onSeek={seekInClip}
            onMoveKey={(fromSeconds, toSeconds) =>
              editKeys(clip.id, (it) =>
                moveKeyframe(it, "framing", fromSeconds, toSeconds)
              )}
            onDeleteKey={(seconds) =>
              editKeys(clip.id, (it) => removeKeyframe(it, "framing", seconds))}
            onOpenCurve={openCropCurve}
          />
        {:else}
          <PostEditorTransport {editor} disabled={exporting} />
        {/if}
        {#if fileError}
          <p class="file-error" role="alert">{fileError}</p>
        {/if}
        {#if showImportDifferences && editor.project.importSource?.unresolved.length}
          <details
            class="import-differences"
            open
            ontoggle={(event) => {
              if (!event.currentTarget.open) showImportDifferences = false;
            }}
          >
            <summary>InShot import: rendering differences remain</summary>
            <ul>
              {#each editor.project.importSource.unresolved as difference}
                <li>{difference}</li>
              {/each}
            </ul>
          </details>
        {/if}
      </div>

      <!-- The crop screen takes the editor over: it stows the post's timeline
           and the tool row out of sight, still mounted, so they come back
           scrolled where they were. Its own clip timeline stands in for
           them, and Done or Cancel brings them back. -->
      {#if panelBeside && !showTimingStage && !cropMode}
        <div class="timeline-resizer">
          <ResizeHandle
            direction="vertical"
            size={12}
            ariaLabel="Resize preview and timeline"
            ariaValueNow={editorHeight > 0
              ? (100 * (editorHeight - shownTimelineHeightPx)) / editorHeight
              : 50}
            disabled={maxTimelineHeightPx <= MIN_TIMELINE_HEIGHT_PX}
            onDragStart={() => (timelineResizeStartPx = shownTimelineHeightPx)}
            onDrag={resizeTimeline}
            onKeydown={resizeTimelineWithKeys}
            onDoubleClick={() =>
              (timelineHeightPx = DEFAULT_TIMELINE_HEIGHT_PX)}
          />
        </div>
      {/if}
      {#if panelBeside}
        <div
          class="row-slot"
          class:stowed={cropMode}
          tabindex="-1"
          bind:this={rowSlot}
          inert={sharing || cropMode || undefined}
        >
          <Crossfade key={rowKey} mode="swap" duration={DURATION.fast}>
            {@render row()}
          </Crossfade>
        </div>
      {/if}
      <div
        class="timeline-slot"
        class:stowed={cropMode}
        inert={sharing || exporting || cropMode || undefined}
      >
        <PostTimeline
          project={editor.project}
          durationSeconds={editor.durationSeconds}
          playheadSeconds={editor.previewSeconds}
          isPlaying={editor.isPlaying}
          selectedItemId={editor.selectedItemId}
          {labelFor}
          onSeek={seekFromTimeline}
          onSelect={(itemId) => (editor.selectedItemId = itemId)}
          onGestureStart={() => {
            editor.pause();
            editor.beginGesture();
          }}
          onGestureEnd={editor.endGesture}
          onGestureCancel={editor.cancelGesture}
          onTrim={(itemId, edge, seconds) =>
            asOneStep(() => editor.trimLive(itemId, edge, seconds))}
          onMoveMain={(itemId, start) =>
            applyMove((project, context) =>
              placeMainItem(project, itemId, start, context)
            )}
          onMoveOverlay={(itemId, start, trackIndex) =>
            applyMove((project, context) =>
              moveOverlayItem(project, itemId, { start, trackIndex }, context)
            )}
          onOpenCrossfade={openCrossfade}
          onMoveSelection={(itemIds, draggedItemId, start, trackIndex) =>
            applyMove((project, context) =>
              moveSelectedItems(
                project,
                itemIds,
                draggedItemId,
                start,
                trackIndex,
                context
              )
            )}
          onTrackFlag={(trackId, flag, value) =>
            editor.edit((project, context) =>
              setTrackFlag(project, trackId, flag, value, context)
            )}
          {keyChannel}
          toolChannel={keyChannel}
          onKeyChannel={pickKeyRow}
          onToggleKey={(itemId, channel, seconds) =>
            editKeys(itemId, (it) => toggleKeyframe(it, channel, seconds))}
          onMoveKey={(itemId, channel, fromSeconds, toSeconds) =>
            editKeys(itemId, (it) =>
              moveKeyframe(it, channel, fromSeconds, toSeconds)
            )}
          onDeleteKey={(itemId, channel, seconds) =>
            editKeys(itemId, (it) => removeKeyframe(it, channel, seconds))}
          onOpenCurve={openKeyCurve}
          toolbarStart={editor.selectedItem && keyChannel
            ? timelineKeys
            : undefined}
          onAddVideo={pickDeviceVideo}
          bind:pixelsPerSecond
        />
      </div>
    {/if}

    {#if !panelBeside}
      <!-- A phone's tools stay at the bottom of the screen while the post
           scrolls above them. An open panel takes the row's place. -->
      <div
        class="dock"
        class:timing={showTimingStage}
        tabindex="-1"
        bind:this={dockElement}
        inert={sharing || undefined}
      >
        {#if showTimingStage}
          <div class="timing-mobile-actions">
            <PostTimingTap {session} />
            <PanelButton
              onclick={() => (timingSettingsOpen = true)}
              ariaExpanded={timingSettingsOpen}
            >
              <i class="fa-solid fa-sliders" aria-hidden="true"></i> Settings
            </PanelButton>
          </div>
        {:else}
          <Crossfade
            key={dockKey}
            mode="swap"
            duration={DURATION.fast}
            animateHeight
          >
            {#if shown && !appearanceDockOpen}
              {@render panel(shown, "dock")}
            {:else}
              {@render row()}
            {/if}
          </Crossfade>
        {/if}
      </div>
    {/if}
  </div>

  <input
    bind:this={fileInput}
    class="file-input"
    type="file"
    accept="video/*"
    onchange={addDeviceVideo}
    tabindex="-1"
    aria-hidden="true"
  />
  <input
    bind:this={recoveryInput}
    class="file-input"
    type="file"
    multiple
    accept=".json,video/*,image/*,.ttf,.otf"
    onchange={importRecovery}
    tabindex="-1"
    aria-hidden="true"
  />
</section>

<Drawer
  bind:isOpen={appearanceDrawerOpen}
  bind:activeSnapPoint={appearanceSnapPoint}
  title="Appearance"
  placement="bottom"
  class="post-appearance-main-drawer"
  backdropClass="edit-panel-backdrop"
  snapPoints={appearanceSnapPoints}
  resizeWithSnapPoints
  dragHandleOnly
  closeOnSnapToZero
  closeOnBackdrop={false}
  modal={false}
  trapFocus={false}
  autoFocus={false}
  setInertOnSiblings={false}
  preventScroll={false}
  keyboardShortcutsPassthrough
  onOpenChange={(open) => {
    if (!open && shown === "appearance") closePanel();
  }}
>
  <div
    class="appearance-drawer-panel"
    bind:offsetHeight={appearancePanelHeight}
    data-edit-history-shortcut-scope
    data-viewer-keys-ignore
  >
    {@render panel("appearance", "dock")}
  </div>
</Drawer>

<ConfirmDialog
  bind:isOpen={confirmClearPost}
  title={t("post_keyframe_clear_post_title")}
  message={t("post_keyframe_clear_post_message", {
    count: clearablePostKeys,
  }) +
    (lockedPostKeys > 0
      ? ` ${t("post_keyframe_clear_post_locked", { count: lockedPostKeys })}`
      : "")}
  confirmText={t("post_keyframe_remove_all_post_confirm")}
  onConfirm={clearPostKeys}
  onCancel={() => (confirmClearPost = false)}
/>

<!-- The render reads the live canvas frame by frame. Any edit made while it
     runs lands in the middle of the output, so the app is locked until it
     finishes or is cancelled. -->
<ExportTakeover
  phase={exporting ? "capturing" : "idle"}
  progress={exportPercent / 100}
  phaseLabel={exportProgress?.phase === "audio"
    ? t("share_studio_mixing_sound")
    : exportProgress
      ? `${t("share_studio_rendering_frame")} ${exportProgress.completedFrames} ${t("share_studio_of")} ${exportProgress.totalFrames}`
      : t("share_studio_rendering")}
  onCancel={cancelExport}
  label={t("share_studio_rendering_post")}
/>

{#if showTimingStage && !panelBeside}
  <Drawer
    bind:isOpen={timingSettingsOpen}
    title="Mapping settings"
    placement="bottom"
    initialFocusElement={timingAnimationOpen ? timingAnimationSection : null}
  >
    <DrawerHeader
      title="Mapping settings"
      onClose={() => (timingSettingsOpen = false)}
    />
    <div
      class="timing-drawer-content"
      data-edit-history-shortcut-scope
      data-viewer-keys-ignore
    >
      <EditHistoryShortcutBridge
        onUndo={session.undo}
        onRedo={session.redo}
        canUndo={session.canUndo}
        canRedo={session.canRedo}
      />
      {@render draftStatus()}
      {@render timingPanel()}
    </div>
  </Drawer>
{/if}

<style>
  .appearance-drawer-panel {
    padding: 0.5rem var(--post-gap, 0.75rem)
      max(0.5rem, env(safe-area-inset-bottom, 0px));
  }
  :global(.post-appearance-main-drawer) {
    --sheet-min-height: 0;
    --sheet-max-height: min(88dvh, 760px);
    --sheet-bg:
      linear-gradient(
        var(--theme-panel-bg, #0f0f14),
        var(--theme-panel-bg, #0f0f14)
      ),
      var(--sheet-bg-solid, #0f0f14);
    --sheet-filter: none;
  }
  .canvas-tool {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  .post-editor:focus,
  .panel-host:focus,
  .panel-slot:focus,
  .row-slot:focus,
  .dock:focus {
    outline: none;
  }

  .post-editor {
    /* The post's width over its height; the canvas sets it. */
    --post-ratio: 0.5625;
    /* The ruler, the main track and two layers. */
    --post-timeline-height: 17.5rem;
    --post-gap: 0.75rem;
    container: post-editor / inline-size;
    width: 100%;
    min-width: 0;
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    background: var(--theme-panel-bg, transparent);
  }

  /* A phone stacks the parts in the order they are used: the top bar, the
     preview and its transport, the timeline, then the dock of tools. */
  .layout {
    display: flex;
    flex-direction: column;
    gap: var(--post-gap);
    min-height: 100%;
    padding: var(--post-gap);
    box-sizing: border-box;
  }

  /* While editing, a phone's preview takes the height the other parts leave
     it, down to 12rem, so the preview, the timeline and the row all fit on
     one screen. Past that the editor scrolls under the dock. */
  .post-editor[data-layout="phone"][data-mode="edit"] .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows:
      auto minmax(var(--post-stage-min, 12rem), 1fr)
      auto auto auto;
    grid-template-areas: "top" "stage" "transport" "timeline" "dock";
  }

  /* Never taller than a full-width frame needs. */
  .post-editor[data-layout="phone"][data-mode="edit"] .stage-row {
    align-self: center;
    height: min(100%, calc((100cqw - 2 * var(--post-gap)) / var(--post-ratio)));
  }

  .stage-row {
    display: flex;
    justify-content: center;
    gap: 1rem;
    min-width: 0;
  }

  .preview-frame {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  /* The host fills whatever holds it, here or in the share sheet, and the
     frame inside it is the largest of the post's shape that fits. */
  .preview-host {
    container-type: size;
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .canvas-slot {
    width: min(100cqw, calc(100cqh * var(--post-ratio)));
  }

  .timing-stage {
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .transport-slot {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }

  .file-error {
    margin: 0;
    color: var(--semantic-warning, #fbbf24);
    font-size: 0.875rem;
    text-align: center;
  }

  .import-differences {
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  .import-differences summary {
    cursor: pointer;
    padding-block: 0.375rem;
  }

  .import-differences summary:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .import-differences ul {
    margin: 0.25rem 0;
    padding-left: 1.5rem;
  }

  /* The timeline's playhead and guides stack inside it, under the dock. */
  .timeline-slot {
    min-width: 0;
    min-height: 0;
    isolation: isolate;
  }

  .row-slot {
    min-width: 0;
  }

  /* A phone's tools stay at the bottom of the screen, in a dock an open
     panel takes over. A short window scrolls the post under it. */
  .dock {
    position: sticky;
    bottom: 0;
    z-index: 1;
    margin: auto calc(-1 * var(--post-gap)) calc(-1 * var(--post-gap));
    padding: 0.5rem var(--post-gap)
      max(0.5rem, env(safe-area-inset-bottom, 0px));
    border-top: 1px solid var(--theme-stroke, #484755);
    background: var(--theme-panel-bg, rgba(10, 12, 18, 0.92));
    /* A filter would anchor the appearance drawers to this dock, clipping
       their headers on phones instead of positioning them in the viewport. */
    backdrop-filter: none;
  }

  .dock.timing {
    position: static;
    margin: 0;
    padding: 0;
    border-top: 0;
    background: none;
    backdrop-filter: none;
  }

  .timing-panel {
    display: grid;
    align-content: start;
    gap: var(--post-gap);
    min-width: 0;
  }

  .timing-toolbar {
    grid-area: top;
    display: flex;
    align-items: center;
    gap: 1rem;
    min-width: 0;
  }
  .take-picker {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    min-width: 0;
    color: var(--theme-text-dim, #aaa);
    font-size: var(--mapping-text-size, 0.875rem);
  }
  .take-picker select {
    min-width: 0;
    width: 18rem;
    max-width: 100%;
    min-height: 2.75rem;
    padding: 0.5rem 2rem 0.5rem 0.75rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.5rem;
    color: var(--theme-text);
    background: var(--theme-panel-bg);
    font: inherit;
    text-overflow: ellipsis;
  }
  .take-picker select:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }
  .timing-save {
    margin-left: auto;
  }
  .back-short {
    display: none;
  }
  .timing-mobile-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.5rem;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  .timing-drawer-content {
    padding: 0 1rem 1rem;
    overflow-y: auto;
    max-height: 75dvh;
  }
  .timing-animation {
    min-width: 0;
  }
  .post-editor[data-mode="timing"][data-layout="wide"] .timing-stage {
    flex: none;
    width: min(
      calc(100cqh * var(--take-ratio)),
      calc(100cqw - var(--post-panel-width) - 1rem)
    );
  }
  .post-editor[data-mode="timing"][data-layout="wide"] .panel-host {
    padding: 0.5rem 1rem;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
  }
  .post-editor[data-mode="timing"][data-layout="phone"] .timing-toolbar {
    gap: 0.5rem;
  }
  .post-editor[data-mode="timing"][data-layout="phone"] .take-picker {
    flex: 1;
  }
  .post-editor[data-mode="timing"][data-layout="phone"] .take-picker select {
    width: 100%;
  }
  .post-editor[data-mode="timing"][data-layout="phone"] .take-picker > span,
  .post-editor[data-mode="timing"][data-layout="phone"] .timing-save,
  .post-editor[data-mode="timing"][data-layout="phone"] .back-label {
    display: none;
  }
  .post-editor[data-mode="timing"][data-layout="phone"] .back-short {
    display: inline;
  }

  .file-input {
    display: none;
  }

  /* On a wide screen the post fills the height: the preview with the top
     bar and the panel right beside it, then the transport, and under the
     resize handle the tool row over the timeline it acts on. A short window
     scrolls rather than shrinking the preview and its panel below 15rem.
     The timeline keeps one height, so a new layer scrolls inside it instead
     of shrinking the preview. The viewer's own side panel holds the top bar
     and the panel, and the rest stacks the same way. */
  .post-editor:is([data-layout="wide"], [data-layout="viewer"]) .layout {
    --post-panel-width: clamp(20rem, 30cqw, 26rem);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows:
      minmax(15rem, 1fr) auto 12px auto
      var(--post-timeline-height);
    grid-template-areas: "stage" "transport" "resize" "row" "timeline";
  }

  .post-editor[data-mode="edit"][data-layout="wide"] .layout {
    --post-panel-width: clamp(20rem, 54cqw, 75rem);
  }

  .post-editor[data-mode="timing"]:is(
      [data-layout="wide"],
      [data-layout="viewer"]
    )
    .layout {
    height: 100%;
    grid-template-rows: auto minmax(10rem, 1fr) auto;
    grid-template-areas: "top" "stage" "timeline";
  }

  .post-editor[data-mode="timing"][data-layout="phone"] .layout {
    display: grid;
    height: 100%;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(8rem, 1fr) auto auto;
    grid-template-areas: "top" "stage" "timeline" "dock";
  }

  /* A landscape phone gives the video the full available height. Timing
     controls sit beside it; adjustments use the same sheet as portrait. */
  .post-editor[data-mode="timing"][data-short-mapping="true"] .layout {
    --post-gap: 0.5rem;
    grid-template-columns: minmax(10rem, 0.8fr) minmax(21rem, 1fr);
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas: "top top" "stage timeline" "stage dock";
  }
  .post-editor[data-short-mapping="true"] .timing-timeline {
    align-self: center;
  }
  .post-editor[data-short-mapping="true"] .take-picker {
    max-width: 26rem;
  }

  .top-bar-slot {
    grid-area: top;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: none;
    margin-left: auto;
  }

  .draft-notice {
    flex-basis: 100%;
    min-width: 0;
    color: var(--semantic-warning, #fbbf24);
    font-size: var(--font-size-compact, 0.75rem);
  }

  .stage-row {
    grid-area: stage;
  }

  .transport-slot {
    grid-area: transport;
  }

  .timeline-resizer {
    grid-area: resize;
    min-width: 0;
  }

  .timeline-slot {
    grid-area: timeline;
  }

  .row-slot {
    grid-area: row;
  }

  .dock {
    grid-area: dock;
  }

  /* The preview's width comes from the row's height, so the panel sits right
     beside the video and the two center as one group. The panel's width is
     set on the layout and measured against this row. */
  .post-editor:is([data-layout="wide"], [data-layout="viewer"]) .stage-row {
    container-type: size;
    min-height: 0;
  }

  .post-editor[data-layout="wide"] .preview-frame {
    flex: none;
    width: min(
      calc(100cqh * var(--post-ratio)),
      calc(100cqw - var(--post-panel-width) - 1rem)
    );
    height: 100%;
  }

  .post-editor[data-mode="edit"][data-layout="wide"] .preview-frame {
    width: calc(100cqw - var(--post-panel-width) - 1rem);
  }

  .post-editor[data-layout="viewer"] .preview-frame {
    flex: none;
    width: min(100cqw, calc(100cqh * var(--post-ratio)));
    height: 100%;
  }

  .timing-timeline {
    grid-area: timeline;
    min-width: 0;
  }
  .post-editor[data-mode="timing"] {
    user-select: none;
    -webkit-user-select: none;
  }
  .post-editor[data-mode="timing"] :global(input) {
    user-select: text;
    -webkit-user-select: text;
  }
  .post-editor[data-mode="timing"][data-layout="phone"] .timing-stage {
    height: 100%;
  }

  @media (max-height: 500px) and (min-width: 601px) {
    .post-editor[data-mode="timing"][data-layout="wide"] .layout {
      gap: 0.5rem;
      grid-template-rows: auto minmax(8rem, 1fr) auto;
    }
  }

  @container post-editor (min-width: 2400px) {
    .post-editor[data-mode="timing"] .layout {
      --mapping-text-size: 1.125rem;
      --mapping-heading-size: 1.25rem;
      --mapping-meta-size: 1rem;
      --font-size-sm: 1.125rem;
      --font-size-compact: 1rem;
      --min-touch-target: 3rem;
      --post-panel-width: 28rem;
    }
  }

  .panel-host {
    min-width: 0;
    min-height: 0;
  }

  .post-editor[data-layout="wide"] .panel-host {
    flex: 0 0 var(--post-panel-width);
  }

  .post-editor[data-mode="edit"][data-layout="wide"] .panel-host {
    flex: 1 1 20rem;
  }

  .side-column {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--post-gap);
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .panel-slot {
    min-width: 0;
    min-height: 0;
  }

  /* A short landscape window scrolls the entire inspector so its header
     cannot leave just a sliver of space for the selected item's controls. */
  @media (max-height: 600px) {
    .post-editor[data-layout="wide"] .side-column {
      grid-template-rows: auto auto;
      align-content: start;
      overflow-y: auto;
    }

    .post-editor[data-layout="wide"] .panel-slot :global(.tool-panel.side) {
      height: auto;
    }

    .post-editor[data-layout="wide"]
      .panel-slot
      :global(.tool-panel.side .body) {
      overflow-y: visible;
    }
  }

  .panel-host.external .side-column {
    grid-template-rows: auto auto;
    height: auto;
  }

  .panel-host.external.appearance .side-column {
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
  }

  .post-editor[data-mode="timing"][data-layout="wide"] .panel-host {
    overflow-y: auto;
  }

  /* In the viewer's side panel the host scrolls as a whole. */
  .panel-host.external {
    height: 100%;
    padding: var(--post-gap);
    overflow-y: auto;
    box-sizing: border-box;
  }

  .post-editor[data-sharing="true"] .panel-host:not(.external) {
    visibility: hidden;
  }

  /* The crop screen: the stage takes the room the timeline and the row
     leave, with the clip's own timeline under it. */
  .post-editor[data-mode="crop"] .layout {
    position: relative;
  }

  .post-editor[data-mode="crop"]:is(
      [data-layout="wide"],
      [data-layout="viewer"]
    )
    .layout {
    grid-template-rows: minmax(15rem, 1fr) auto;
    grid-template-areas: "stage" "transport";
  }

  .post-editor[data-layout="phone"][data-mode="crop"] .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(12rem, 1fr) auto auto;
    grid-template-areas: "top" "stage" "transport" "dock";
  }

  .timeline-slot.stowed,
  .row-slot.stowed {
    position: absolute;
    inset: 0 0 auto;
    margin: 0;
    visibility: hidden;
    pointer-events: none;
  }

  .post-editor[data-mode="crop"] .stage-row {
    min-height: 0;
  }

  .post-editor[data-mode="crop"] .preview-frame {
    flex: 1 1 0;
    width: auto;
  }

  .post-editor[data-mode="crop"] .canvas-slot {
    width: 100%;
    height: 100%;
  }

  /* The panel sits beside the picture, the two centred as one group, and
     the clip's timeline runs under both, as wide as the screen. The stage is
     as wide as the picture needs at the row's height, straightened any
     amount, and it keeps that width until the screen closes. The panel
     keeps the width it has while editing: 30% of the stage row, measured
     here against the editor less the layout's padding. */
  .post-editor[data-mode="crop"][data-layout="wide"] .layout {
    --post-panel-width: clamp(
      20rem,
      calc((100cqw - 2 * var(--post-gap)) * 0.3),
      26rem
    );
  }

  .post-editor[data-mode="crop"][data-layout="wide"] .preview-frame {
    flex: none;
    width: min(
      calc(
        (100cqh - 2 * var(--crop-margin)) * var(--crop-view, 1.7778) + 2 *
          var(--crop-margin)
      ),
      calc(100cqw - var(--post-panel-width) - 1rem)
    );
    height: 100%;
  }

  /* Reset shows its words when the bar has room, else its icon alone. */
  .top-bar-slot,
  .side-column {
    container: post-top-bar / inline-size;
  }

  .crop-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
</style>
