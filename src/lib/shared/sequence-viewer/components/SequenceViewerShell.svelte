<!--
  SequenceViewerShell.svelte

  THE sequence-viewer chrome: header (actions + title-menu trigger + close),
  content rail / bottom bar, split pane body, export sidebars/docks, practice
  workstation, delete dialog. Extracted verbatim from SequenceViewerDrawerHost
  so every host renders the IDENTICAL viewer — the app drawer (inside Drawer)
  and the /sequence standalone route both mount this one component.

  Host deltas are props, not forks:
  - onClose: drawer dismissal vs standalone Back navigation
  - openAppHref: standalone hosts add an app-launch item to the title menu
  - onAccountSignIn: scan-origin viewers add their account entry
  - exportOverrides: scan-origin viewers gate Download through account signup
  - startInCardThenSplit: scan-origin viewers present the card first, then
    promote the same shell to Side-by-Side after the card's painted frame

  Do NOT rebuild scan-specific header/body variants — extend this shell.
-->
<script lang="ts">
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { authDrawerState } from "$lib/shared/auth/state/auth-drawer-state.svelte";
  import { onDestroy, onMount, untrack, type Snippet } from "svelte";
  import { createViewerStudioSurfaces } from "../state/viewer-studio-surfaces.svelte";
  import { setViewerStudioSurfaces } from "../context/viewer-studio-surfaces-context";
  import { reparentToInspector } from "./reparent-to-inspector";
  import { slide, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { goto } from "$app/navigation";
  import ViewerSplitPane from "./ViewerSplitPane.svelte";
  import ViewerWorkspacePanels from "./ViewerWorkspacePanels.svelte";
  import ViewerContentRail from "./ViewerContentRail.svelte";
  import ViewerModeBottomBar from "./ViewerModeBottomBar.svelte";
  import { dockTrayState } from "./ControlDock.svelte";
  import type { OrchestratorContext } from "../domain/viewer-orchestrator-context";
  import {
    createVideoPlayheadBridge,
    setVideoPlayheadContext,
  } from "../context/video-playhead-context";
  import DualSourceCrossfade from "$lib/shared/components/DualSourceCrossfade.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { flyFade } from "$lib/shared/transitions/motion";
  import { getSequenceVideosStore } from "$lib/shared/video-collaboration/state/sequence-videos-store.svelte";
  import { showToast, toast } from "$lib/shared/toast/state/toast-state.svelte";
  import { createPerformanceWorkspaceState } from "./sequence-videos/state/performance-workspace-state.svelte";
  import { setPerformanceWorkspaceContext } from "./sequence-videos/context/performance-workspace-context";
  import PerformanceStage from "./sequence-videos/PerformanceStage.svelte";
  import PerformanceInspector from "./sequence-videos/PerformanceInspector.svelte";
  import PerformanceEditor from "./sequence-videos/PerformanceEditor.svelte";
  import ViewerHeader from "./ViewerHeader.svelte";
  import FullscreenControls from "./FullscreenControls.svelte";
  import ExportVideoDrawer from "$lib/shared/animation-panel/components/AnimationPanel.svelte";
  import ExportImagePanel from "./ExportImagePanel.svelte";
  import VideoPreviewPanel from "./VideoPreviewPanel.svelte";
  import PracticeBar from "./PracticeBar.svelte";
  import PostStudioPane from "./PostStudioPane.svelte";
  import { POST_STUDIO_STAGE_MIN_WIDTH } from "../services/viewer-shell-model";
  import { createPaneKeepAlive } from "./pane-keep-alive.svelte";
  import PracticeSetupBar from "./PracticeSetupBar.svelte";
  import ViewerSharePanel from "./ViewerSharePanel.svelte";
  import { META_POSTING_ENABLED } from "$lib/shared/share/services/meta-publish";
  import { computeExportSummary } from "$lib/shared/animation-panel/pill-nav/pill-summaries";
  import { formatExportTimeEstimate } from "$lib/shared/animation-panel/state/export-timing-tracker";
  import { VIEWER_MODE_OPTIONS } from "../services/viewer-modes";
  import Recording3DOverlay from "./Recording3DOverlay.svelte";
  import ExportTakeover from "$lib/shared/video-export/components/ExportTakeover.svelte";
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import { toExportTakeoverPhase } from "$lib/shared/video-export/services/export-takeover-phase";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import RecordSceneChrome from "./record-scene/RecordSceneChrome.svelte";
  import { getDeviceDetector } from "$lib/shared/device/get-device-detector";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import DeleteConfirmDialog from "./DeleteConfirmDialog.svelte";
  import PostShareSheet from "$lib/shared/share/components/PostShareSheet.svelte";
  import type { VideoRenderRequest } from "$lib/shared/share/domain/video-opener";
  import {
    listRenderedFilms,
    onRenderedFilmsChanged,
    type RenderedFilmSummary,
  } from "$lib/shared/video-export/services/rendered-film-store";
  import {
    describeFilm,
    latestFilmForSequence,
  } from "$lib/shared/video-export/domain/film-share-summary";
  import { VIDEO_UPLOAD_ENABLED } from "../config/viewer-feature-flags";
  import { uploadRenderedFilm } from "$lib/shared/video-collaboration/services/upload-rendered-film";
  import { canAccessPostStudio } from "../services/post-studio-access";
  import ChoreoCardContextMenuHost from "./choreo-card-context-menu/ChoreoCardContextMenuHost.svelte";
  import { createSequenceSendSession } from "$lib/shared/inbox/state/send-sequence-state.svelte";
  import { inboxState } from "$lib/shared/inbox/state/inbox-state.svelte";
  import { createGlobalChiralitySeam } from "$lib/shared/settings/components/tabs/prop-type/prop-chirality-seam";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import { sendToStickerLab } from "$lib/shared/sequence-viewer/services/send-to-sticker-lab";
  import { getSequenceMotionProfile } from "$lib/shared/foundation/services/sequence-motion-profile";
  import {
    captureScanAction,
    captureScanExport,
    captureScanPlaybackChanged,
    captureScanPracticeChanged,
    captureScanSettingChanged,
    captureScanViewerOpened,
    captureScanViewChanged,
    endScanViewerSession,
    isScanVisit,
    registerScanSessionCleanup,
  } from "$lib/shared/analytics/scan-analytics";
  import { createViewerShellLayoutState } from "../state/viewer-shell-layout-state.svelte";
  import {
    createViewerShellShareState,
    viewerVideoSourceIdentity,
  } from "../state/viewer-shell-share-state.svelte";
  import {
    createViewerShellInteractionState,
    type ViewerShellExportOverrides,
    type ViewerShellGuideAction,
  } from "../state/viewer-shell-interaction-state.svelte";
  import type {
    TunnelComposition,
    TunnelSaveTarget,
  } from "../tunnel/tunnel-composition";
  import { createViewerInspectorHostState } from "../state/viewer-inspector-host-state.svelte";
  import { setViewerInspectorHostContext } from "../context/viewer-inspector-host-context";
  import { createViewerAnimatorInspectorState } from "../state/viewer-animator-inspector-state.svelte";
  import { setViewerAnimatorInspectorContext } from "../context/viewer-animator-inspector-context";
  import { loadActivePill } from "$lib/shared/animation-panel/state/active-pill-persistence";
  import { createCardPresentationState } from "$lib/shared/share/state/card-presentation-state.svelte";
  import {
    cardPresentationFromFooterSettings,
    resolveCardFooter,
    type CardPresentation,
  } from "$lib/shared/share/domain/models/card-presentation";
  import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";
  import {
    trackSequenceRemixStarted,
    trackSequenceViewed,
    trackViewerAction,
    trackViewerExport,
    trackViewerPlaybackChanged,
    trackViewerPracticeChanged,
    trackViewerSettingChanged,
    trackViewerViewChanged,
    type SequenceViewerSource,
  } from "$lib/shared/sequence-viewer/analytics/viewer-events";

  /** Host-owned export pipeline (such as the scan-origin account gate).
      Absent → the orchestrator's own ctx.handleExport pipeline (the app). */
  interface Props {
    /** Development review fixture; never changes production rollout access. */
    reviewPostStudio?: boolean;
    ctx: OrchestratorContext;
    sequence: SequenceData;
    analyticsSource: SequenceViewerSource;
    isMobile: boolean;
    onClose: () => void;
    /** Override the header/menu Remix action when a host needs custom routing. */
    onRemix?: () => void;
    /** Adds an "Open Flow Arts Composer" item to the title menu (scan funnel exit). */
    openAppHref?: string;
    /** Adds the standalone host's sign-in/avatar entry to the shared header. */
    onAccountSignIn?: () => void;
    /** One-shot reset to the split view on mount. */
    startInSplit?: boolean;
    /** Present card mode first, then promote after its first stable paint. */
    startInCardThenSplit?: boolean;
    exportOverrides?: ViewerShellExportOverrides;
    /** Optional "See it in the Guide" action — host supplies the handler; the
     *  shell renders it in the overflow menu. Omitted → not shown. */
    guideAction?: ViewerShellGuideAction | null;
    /**
     * THE VIEWER IS INSIDE SOMEONE ELSE'S PAGE — trim the chrome that has
     * nowhere to go.
     *
     * The shop hero puts a phone on its front door and iframes the literal
     * `/q/<code>?demo=1`, which hands off to `/sequence`. Once that screen accepts a pointer (HeroPhone's
     * live gate), every control in the header is reachable — including the
     * ones whose whole job is to LEAVE the scan. Close navigated the frame to
     * /browse/gallery, so the phone on a shop page ended up showing the browse
     * app. Austen (2026-08-04): "we don't want it to navigate back to browse we
     * should just deactivate the buttons that don't make sense in this
     * context."
     *
     * Hidden, not disabled: a visible button that ignores a press reads as
     * broken, which is worse than a button that was never there. What goes:
     *
     *   - Close — the embed has nowhere to close TO.
     *   - The account entry — an auth flow trapped in a marketing iframe, and
     *     its signed-in variant is a link to /browse/gallery.
     *   - Share — `getViewerShareDetails()` seeds from `window.location.href`,
     *     which in here is the `?demo=1` URL. Sharing from the hero would put
     *     demo-flagged links into the world, and demo links suppress scan
     *     analytics by design. "Open this scan" beside the phone is the honest
     *     way out, and it carries the clean code.
     *   - Every menu item that navigates away (Open Flow Arts Composer, Remix, Guide) or
     *     opens the sign-in gate (Favorite, Save), plus the owner-only
     *     management actions — a marketing page must not be able to publish or
     *     delete a sequence.
     *
     * What stays: the entire viewer. Bottom-nav views, the content rail,
     * playback, practice, the step cells, motion visibility. That is the part
     * the hero is there to show.
     */
    embedded?: boolean;
    /** Route hosts can replace the drawer's Close control with a Back control. */
    navigation?: { label: string };
    tunnelComposition?: TunnelComposition | null;
    tunnelSaveTarget?: TunnelSaveTarget | null;
    onTunnelSaved?: import("../tunnel/tunnel-snapshot").TunnelSavedCallback;
    /** Route-owned context placed between the canonical header and viewer body. */
    contextContent?: Snippet;
    /** The full-page sequence route keeps its immersive transport overlay. */
    showFullscreenControls?: boolean;
    /** Host intent: enter through Share and open the canonical sheet once. */
    shareOnOpen?: boolean;
  }

  let {
    ctx,
    sequence,
    analyticsSource,
    isMobile,
    onClose,
    onRemix,
    openAppHref,
    onAccountSignIn,
    startInSplit = false,
    reviewPostStudio = false,
    startInCardThenSplit = false,
    exportOverrides,
    guideAction = null,
    embedded = false,
    navigation,
    contextContent,
    showFullscreenControls = false,
    shareOnOpen = false,
    tunnelComposition = null,
    tunnelSaveTarget = null,
    onTunnelSaved,
  }: Props = $props();

  let viewerWorkspaceElement = $state<HTMLElement | null>(null);
  let artInspectorTarget = $state<HTMLElement | null>(null);
  const inspectorHost = createViewerInspectorHostState();
  setViewerInspectorHostContext(inspectorHost);
  const animatorInspector =
    createViewerAnimatorInspectorState(loadActivePill());
  setViewerAnimatorInspectorContext(animatorInspector);
  $effect(() => inspectorHost.setTarget(artInspectorTarget));

  const imageCompositionDefaults = getImageCompositionManager();
  const cardPresentation = createCardPresentationState({
    getDefault: () =>
      cardPresentationFromFooterSettings(
        imageCompositionDefaults.showNotes,
        imageCompositionDefaults.customNotesText
      ),
  });
  $effect(() => {
    const current = ctx.effectiveSequence ?? sequence;
    cardPresentation.load(current);
  });
  const resolvedCardFooter = $derived(
    resolveCardFooter(cardPresentation.value)
  );
  const currentCardImageComposition = $derived({
    ...ctx.splitPaneImageComposition,
    showNotes: resolvedCardFooter.show,
    customNotesText: resolvedCardFooter.text,
  });

  async function persistCardPresentation(
    value: CardPresentation = cardPresentation.value
  ): Promise<boolean> {
    if (cardPresentation.saving) return false;
    cardPresentation.saving = true;
    try {
      const saved = await ctx.saveCardPresentation(value);
      if (saved) cardPresentation.markSaved(value);
      return saved;
    } finally {
      cardPresentation.saving = false;
    }
  }

  function analyticsContext() {
    return { sequenceId: sequence.id, source: analyticsSource } as const;
  }

  const captureViewerAndScanAction: typeof captureScanAction = (
    action,
    properties = {},
    options = {}
  ) => {
    if (!embedded) {
      trackViewerAction(analyticsContext(), action, properties);
      if (action === "remix") trackSequenceRemixStarted(analyticsContext());
    }
    captureScanAction(action, properties, options);
  };

  const captureViewerAndScanExport: typeof captureScanExport = (
    exportKind,
    stage,
    properties = {}
  ) => {
    if (!embedded) {
      trackViewerExport(analyticsContext(), exportKind, stage, properties);
    }
    captureScanExport(exportKind, stage, properties);
  };

  const captureViewerAndScanPlayback: typeof captureScanPlaybackChanged = (
    properties
  ) => {
    if (!embedded) {
      trackViewerPlaybackChanged(analyticsContext(), properties);
    }
    captureScanPlaybackChanged(properties);
  };

  const captureViewerAndScanPractice: typeof captureScanPracticeChanged = (
    action,
    properties = {},
    coalesce = false
  ) => {
    if (!embedded) {
      trackViewerPracticeChanged(
        analyticsContext(),
        action,
        properties,
        coalesce
      );
    }
    captureScanPracticeChanged(action, properties, coalesce);
  };

  const captureViewerAndScanSetting: typeof captureScanSettingChanged = (
    properties
  ) => {
    if (!embedded) {
      trackViewerSettingChanged(analyticsContext(), properties);
    }
    captureScanSettingChanged(properties);
  };

  const captureViewerAndScanView: typeof captureScanViewChanged = (
    fromMode,
    toMode,
    source,
    options = {}
  ) => {
    if (!embedded) {
      trackViewerViewChanged(analyticsContext(), fromMode, toMode, source);
    }
    captureScanViewChanged(fromMode, toMode, source, options);
  };

  const scanInstrumentationEnabled = isScanVisit();
  const layout = createViewerShellLayoutState(
    {
      getContext: () => ctx,
      getSequence: () => sequence,
      getIsMobile: () => isMobile,
      // `share` is declared below; the getter runs lazily from a $derived,
      // never during construction.
      getSharePanelOpen: () => share.panelOpen,
      getWorkspaceElement: () => viewerWorkspaceElement,
      startInSplit,
      startInCardThenSplit,
    },
    {
      getDeviceDetector,
      captureScanSettingChanged: captureViewerAndScanSetting,
      captureScanViewChanged: captureViewerAndScanView,
      captureScanViewerOpened,
      captureScanPlaybackChanged: captureViewerAndScanPlayback,
    }
  );
  const share = createViewerShellShareState(
    {
      getContext: () => ctx,
      getSequence: () => sequence,
    },
    {
      createSequenceSendSession,
      isFullAccount: () => authState.isFullAccount,
      sendToStickerLab,
      captureScanAction: captureViewerAndScanAction,
    }
  );
  // Signing up with the panel open turns its sign-up prompt into recipients.
  $effect(() => {
    if (authState.isFullAccount) untrack(share.ensureSendSession);
  });

  /** What the panel says is being shared: the view the rail has selected. */
  const shareSubject = $derived.by(() => {
    const mode = ctx.viewerState.viewerMode;
    if (mode === "mandala") return { label: "Mandala", icon: "fa-sun" };
    const option = VIEWER_MODE_OPTIONS.find((entry) => entry.id === mode);
    return option
      ? { label: option.label, icon: option.icon }
      : { label: "Sequence", icon: "fa-share-nodes" };
  });
  const shareDownloadLabel = $derived.by(() => {
    const mode = ctx.viewerState.viewerMode;
    if (mode === "card") return "Card image";
    if (mode === "post-studio") return "Post video";
    return "Video";
  });
  const canShareNatively =
    typeof navigator !== "undefined" && typeof navigator.share === "function";
  // One playhead for the performance video and the notation beside it. The
  // videos pane picks this up through context rather than three layers of
  // props, and reaches it from the full Videos surface and the split-pane
  // companion alike.
  const videoPlayhead = createVideoPlayheadBridge({
    setPlaybackSource: (source) => ctx.setPlaybackSource(source),
    setActiveStepMap: (map) => ctx.setActiveStepMap(map),
    setActiveHandLabeling: (labeling) => ctx.setActiveHandLabeling(labeling),
    onVideoTimeUpdate: (seconds) => ctx.onVideoTimeUpdate(seconds),
  });
  setVideoPlayheadContext(videoPlayhead);

  const interactions = createViewerShellInteractionState(
    {
      getContext: () => ctx,
      getVideoPlayhead: () => videoPlayhead,
      getExportOverrides: () => exportOverrides,
      getOnRemix: () => onRemix,
      getOpenAppHref: () => openAppHref,
      getOnAccountSignIn: () => onAccountSignIn,
      onClose,
    },
    {
      navigate: goto,
      openExternalHref: (href) => window.location.assign(href),
      captureScanAction: captureViewerAndScanAction,
      captureScanExport: captureViewerAndScanExport,
      captureScanPlaybackChanged: captureViewerAndScanPlayback,
      captureScanPracticeChanged: captureViewerAndScanPractice,
      captureScanSettingChanged: captureViewerAndScanSetting,
      captureScanViewChanged: captureViewerAndScanView,
      endScanViewerSession,
      registerScanSessionCleanup,
    }
  );

  const performanceWorkspace = createPerformanceWorkspaceState(
    {
      getSequence: () => sequence,
      getActive: () => layout.showVideoGallery,
      getUploadRequested: () => layout.isVideoUploadActive,
      onWorkOpenChange: interactions.handleVideoWorkOpenChange,
    },
    {
      getStore: getSequenceVideosStore,
      playhead: videoPlayhead,
      onTimingSaved: () => toast.success("Timing saved"),
    }
  );
  setPerformanceWorkspaceContext(performanceWorkspace);
  const performanceEditorActive = $derived(
    layout.showVideoGallery && performanceWorkspace.view !== "browse"
  );
  /**
   * The performance editor takes the whole workspace; the stage and inspector
   * stay mounted underneath and the canonical crossfade owns the handoff.
   * Send mode is not a takeover: the stage keeps showing the view being sent
   * and the recipients take the inspector track, so a send that starts from
   * the editor shows the performance stage beneath the recipients instead.
   */
  const workspaceTakeoverActive = $derived(
    performanceEditorActive && !share.panelOpen
  );
  /**
   * Practice clears the chrome that is not the decision. Share does not: the
   * rail and the phone's media switcher are how the person picks what they
   * share, so both stay while the panel is open.
   */
  const focusedModeActive = $derived(ctx.practiceActive);

  /**
   * The outbox took it. Say so where the person is and leave the panel open
   * on fresh recipients; the inbox stays closed, the thread is one tap away
   * for a single recipient. The drawer's sheet navigates into the thread
   * instead, because the person was already in the inbox there.
   */
  function handleSequenceSent(conversationIds: string[]): void {
    share.resetSendSession();
    const single = conversationIds.length === 1 ? conversationIds[0]! : null;
    showToast({
      type: "success",
      message:
        conversationIds.length > 1
          ? `Sent to ${conversationIds.length} conversations`
          : "Sent",
      duration: 5000,
      action: single
        ? {
            label: "Open",
            onClick: () => inboxState.openToConversationById(single),
          }
        : undefined,
    });
  }

  let consumedShareOnOpen = false;
  $effect(() => {
    if (!shareOnOpen || consumedShareOnOpen) return;
    consumedShareOnOpen = true;
    void Promise.resolve().then(() => share.selectAction("share-sequence"));
  });

  /**
   * Resolves the sheet's video slot against the art-share session.
   *
   * Mandala runs its own worker pipeline and now hands the file back instead of
   * saving it. Tunnel bakes through the shared exporter, so its result is
   * already the same `previewBlobUrl` the animation export uses — only the
   * request differs, and the pane's inline preview is suppressed while the
   * sheet owns it.
   */
  /**
   * A rendered post supersedes every other video the share sheet could offer.
   * Post Studio composes the 9:16 file deliberately, so once one exists it is
   * unambiguously what "share the video" means — the same way a mandala or
   * tunnel bake takes the slot when the share came from those surfaces.
   */
  let postStudioVideoUrl = $state<string | null>(null);
  function adoptPostStudioRender(blob: Blob): void {
    if (postStudioVideoUrl) URL.revokeObjectURL(postStudioVideoUrl);
    postStudioVideoUrl = URL.createObjectURL(blob);
  }
  onDestroy(() => {
    if (postStudioVideoUrl) URL.revokeObjectURL(postStudioVideoUrl);
  });

  const artShareVideo = $derived.by(() => {
    const target = share.artShare;

    if (postStudioVideoUrl && share.postShare && !target) {
      return {
        blobUrl: postStudioVideoUrl,
        exporting: false,
        progress: null,
        label: "Post",
        // Post Studio owns re-rendering; the sheet must not kick off an
        // animation export that would replace the composed post.
        request: () => Promise.resolve(),
        cancel: () => {},
      };
    }

    if (target?.artType === "mandala") {
      const mandala = target.mandalaController;
      return {
        blobUrl: mandala.exportBlobUrl,
        exporting: mandala.exporting,
        progress: mandala.exporting ? mandala.exportProgress : null,
        label: "Mandala",
        request: () => Promise.resolve(mandala.startExport({ deliver: false })),
        cancel: () => mandala.cancelExport(),
      };
    }

    if (target?.artType === "tunnel") {
      return {
        blobUrl: ctx.previewBlobUrl,
        exporting: ctx.isExporting,
        progress: ctx.exportProgress?.progress ?? null,
        label: "Tunnel",
        request: () => interactions.handleArtExport(target),
        cancel: () => interactions.handleCancelVideoExport(),
      };
    }

    return {
      blobUrl: ctx.previewBlobUrl,
      exporting: ctx.isExporting,
      progress: ctx.exportProgress?.progress ?? null,
      label: "Video",
      request: requestShareVideo,
      cancel: () => interactions.handleCancelVideoExport(),
    };
  });

  /**
   * True while a share armed the animation export pane on the viewer's behalf.
   *
   * `handleExport` refuses outright unless the editing pane is "animation" or
   * "image" (export-coordinator.svelte.ts), and a viewer that has never opened
   * Export sits at `null` — which is every fresh page load. So Share → Video on
   * a page the user just landed on reported "The render didn't start." with
   * nothing on screen they could do about it. Arm the pane for them, and put the
   * viewer back the way they left it once the sheet is done with it.
   */
  let armedExportForShare = $state(false);

  function requestShareVideo(request?: VideoRenderRequest): Promise<boolean> {
    // A 3D video is a take filmed on the stage, never a render the sheet can
    // start behind itself. Send the person to the panel, where Download hands
    // over the film or leads to Record.
    if (ctx.renderMode === "3d") {
      share.setPostSheetOpen(false);
      openVideoDownloadFromSheet();
      return Promise.resolve(false);
    }
    if (ctx.editingPane !== "animation") {
      // setExportContext, NOT enterEditMode/enterExport: those also move
      // viewerMode, and moving it remounts the 3D canvas — so the export ran one
      // tick later against unregistered Threlte refs and bailed with "3D scene
      // not ready for export." The export context alone is what `editingPane`
      // reads, and leaving the view where it is keeps the live stage the take
      // needs already mounted.
      ctx.viewerState.setExportContext("animation-export");
      armedExportForShare = true;
    }
    return ctx.handleExport({ autoDeliver: false, opener: request?.opener });
  }

  $effect(() => {
    if (!armedExportForShare) return;
    // Not while the sheet is up, and not during a render Share started:
    // exiting would tear down the export it is feeding.
    if (share.postSheetOpen || shareRenderInFlight) return;
    armedExportForShare = false;
    ctx.viewerState.exitExport();
  });

  /**
   * Share → Download on the 2D animation renders at once, with the settings
   * on the Export page, and the render shows its progress over the stage.
   * It used to open the share sheet, which then opened the Export page, whose
   * own button finally rendered: two routes to one file, one of them three
   * steps long. Share is now the only way to the file; the Export page keeps
   * the settings. 3D hands over its film (below); other views (card, tunnel,
   * Post Studio) still prepare their file in the share sheet.
   */
  const shareRendersDirectly = $derived(
    ctx.viewerState.viewerMode === "animation" && ctx.renderMode !== "3d"
  );
  let shareRenderInFlight = $state(false);

  /**
   * Share in 3D hands over the film. A take is filmed on the stage with its
   * Record button, and its quality is picked on the card after Stop, so Share
   * never starts one: Download gives the newest film kept for this sequence,
   * and with none yet it reads "Record a take" and leaves the stage ready.
   */
  const sharesFilm = $derived(
    (ctx.viewerState.viewerMode === "animation" ||
      ctx.viewerState.viewerMode === "animation-3d") &&
      ctx.renderMode === "3d"
  );
  let keptFilms = $state<RenderedFilmSummary[]>([]);
  $effect(() => {
    if (!sharesFilm || !share.panelOpen) return;
    let live = true;
    const refresh = () => {
      void listRenderedFilms().then((films) => {
        if (live) keptFilms = films;
      });
    };
    refresh();
    const stopListening = onRenderedFilmsChanged(refresh);
    return () => {
      live = false;
      stopListening();
    };
  });
  const latestFilm = $derived(
    sharesFilm
      ? latestFilmForSequence(
          keptFilms,
          (ctx.effectiveSequence ?? sequence)?.id
        )
      : null
  );

  function recordTake(): void {
    share.closePanel();
    // Record shows on the stage only while no preview is up. The film was kept
    // on the device when it finished, so clearing the preview loses nothing.
    if (ctx.previewBlobUrl) interactions.handleDismissExportedVideo();
    if (ctx.editingPane !== "animation") {
      ctx.viewerState.enterExport("animation-export", "animation-3d");
    }
  }

  async function downloadFromShare(): Promise<void> {
    if (sharesFilm) {
      const film = latestFilm;
      if (!film) {
        recordTake();
        return;
      }
      if (!(await ctx.saveRetainedFilm(film.id))) {
        keptFilms = keptFilms.filter((entry) => entry.id !== film.id);
      }
      return;
    }
    if (!shareRendersDirectly) {
      share.downloadCurrentView();
      return;
    }
    if (interactions.videoBusy || shareRenderInFlight) return;
    if (ctx.editingPane !== "animation") {
      ctx.viewerState.setExportContext("animation-export");
      armedExportForShare = true;
    }
    shareRenderInFlight = true;
    try {
      await interactions.handleVideoExport();
    } finally {
      shareRenderInFlight = false;
    }
  }

  /**
   * The sheet's Video choice (reached from Card's Download, say) comes back to
   * the panel on the animation, where Download renders that video or, in 3D,
   * hands over the film, rather than rendering from inside the sheet. Same
   * shape as Post Studio's handoff; the sheet closes itself after calling this.
   */
  function openVideoDownloadFromSheet(): void {
    const mode = ctx.viewerState.viewerMode;
    if (mode !== "animation" && mode !== "animation-3d") {
      layout.selectViewerMode("animation");
    }
    share.openPanel();
  }

  /** What Download will render, read from the Export page's settings. */
  const shareDownloadDetail = $derived.by(() => {
    const options = ctx.exportOptions;
    if (!shareRendersDirectly || !options) return undefined;
    const summary = computeExportSummary({
      resolution: options.videoResolution,
      fps: options.videoFps,
      loopCount: options.videoLoopCount,
      renderMode: "2d",
    });
    const estimate = formatExportTimeEstimate(
      options.videoResolution,
      options.videoFps,
      ctx.singlePlayDuration,
      options.videoLoopCount
    );
    return estimate ? `${summary} • ${estimate}` : summary;
  });

  /** Download's label, the line under it, and that line's action. */
  const shareDownload = $derived.by(() => {
    if (sharesFilm) {
      return latestFilm
        ? {
            text: "Download film",
            icon: undefined,
            detail: describeFilm(latestFilm),
            action: {
              label: "New take",
              icon: "fa-circle-dot",
              ariaLabel: "Record a new take",
              onClick: recordTake,
            },
          }
        : {
            text: "Record a take",
            icon: "fa-circle-dot",
            detail: "Films the stage live. Pick the quality after you stop.",
            action: undefined,
          };
    }
    return {
      text: undefined,
      icon: undefined,
      detail: shareDownloadDetail,
      action:
        shareRendersDirectly && ctx.exportOptions
          ? {
              label: "Settings",
              icon: "fa-sliders",
              ariaLabel: "Video export settings",
              onClick: openVideoExportSettings,
            }
          : undefined,
    };
  });

  onMount(() => {
    if (!embedded) trackSequenceViewed(analyticsContext());
    const cleanupLayout = layout.mount();
    const cleanupInteractions = interactions.mount();
    return () => {
      cleanupLayout();
      cleanupInteractions();
    };
  });
  onDestroy(share.destroy);

  const motionProfile = $derived(
    getSequenceMotionProfile(ctx.effectiveSequence ?? sequence)
  );
  const canToggleMotionVisibility = $derived(
    motionProfile.kind === "paired" || motionProfile.kind === "mixed"
  );

  let rerenderTrigger = $state(0);
  let choreoCardMenuHost: ChoreoCardContextMenuHost | undefined = $state();

  // 3D scene load gate (first-load latched, forwarded from the 3D canvas via
  // ViewerSplitPane). Withholds the Record Scene pill until the stage is set, so
  // it doesn't sit over a black "Setting the stage" pane reading as ready.
  let sceneReady3d = $state(false);

  const shellRendersTakeover = $derived(interactions.showInlineProgress);
  const animTakeover = $derived(
    toExportTakeoverPhase(interactions.videoProgress, interactions.videoBusy)
  );
  const takeoverLabel = $derived(
    ctx.effectiveSequence?.word ||
      ctx.effectiveSequence?.displayName ||
      ctx.effectiveSequence?.name ||
      ""
  );
  const takeoverWord = $derived(simplifyRepeatedWord(takeoverLabel));

  /**
   * A share of the 2D sequence animation itself, as opposed to an art render,
   * a 3D film, or a Post Studio composition. Only this one can open on a
   * chosen image.
   */
  const ordinaryAnimationShare = $derived(
    !share.artShare && !share.postShare && ctx.renderMode !== "3d"
  );
  let exportSectionRequest = $state(0);

  /**
   * The share panel's Settings: the Export page that decides what Download
   * renders. The stage keeps playing beside it, so the frame the clip opens
   * with is chosen by pausing where it looks right. The page has no render
   * button of its own; Share is how the file comes out.
   */
  function openVideoExportSettings(): void {
    // The Export page takes the inspector track the share panel holds.
    share.closePanel();
    if (ctx.editingPane !== "animation") {
      if (ctx.viewerState.viewerMode === "animation") {
        ctx.viewerState.enterExport("animation-export", "animation");
      } else {
        layout.selectViewerMode("animation");
      }
    }
    animatorInspector.select("export");
    exportSectionRequest += 1;
  }

  // Opt-in cloud save for a film rendered here: the same performance-video
  // pipeline the upload sheet uses, minus the file picker. Local retention and
  // the download stay untouched — this is an extra destination, not a
  // replacement.
  const canSaveFilmToSequence = $derived(
    ctx.isLoggedIn &&
      VIDEO_UPLOAD_ENABLED &&
      !!(ctx.effectiveSequence ?? sequence)
  );

  async function saveFilmToSequence(): Promise<void> {
    const target = ctx.effectiveSequence ?? sequence;
    const url = ctx.previewBlobUrl;
    if (!target || !url) return;
    try {
      const blob = await (await fetch(url)).blob();
      await uploadRenderedFilm({ sequence: target, blob });
      toast.success("Film saved to this sequence");
    } catch (error) {
      console.warn("[RenderedFilm] Cloud save failed:", error);
      toast.error(
        error instanceof Error ? error.message : "Could not save the film"
      );
      throw error;
    }
  }
  // Prepare the editor once; keep the viewer and the draft alive on reversals.
  const studio = createPaneKeepAlive(() => layout.showPostStudio);
  const studioSurfaces = createViewerStudioSurfaces();
  setViewerStudioSurfaces(studioSurfaces);
  let animatorInspectorOrigin = $state<HTMLElement | null>(null);
  let studioInspectorOrigin = $state<HTMLElement | null>(null);
  // Match Studio's 70rem compact boundary. Tablet shell orientation alone
  // does not guarantee room for a phone beside the full motion inspector.
  const studioCanShareSideInspector = $derived(
    !layout.effectiveMobile && layout.bodyWidth > 1120
  );
  // Send mode owns the inspector track outright; every other layer waits
  // behind it until the send is done or cancelled.
  const studioUsesSideInspector = $derived(
    layout.showPostStudio && studioCanShareSideInspector && !share.panelOpen
  );
  const motionInspectorVisible = $derived(
    !share.panelOpen &&
      (layout.isVideoExportActive ||
        (studioUsesSideInspector &&
          studioSurfaces.inspectorContent === "animation"))
  );
  const cardInspectorVisible = $derived(
    !share.panelOpen &&
      (layout.isImageExportActive ||
        (studioUsesSideInspector && studioSurfaces.inspectorContent === "card"))
  );
  const performanceInspectorVisible = $derived(
    !share.panelOpen &&
      layout.showVideoGallery &&
      performanceWorkspace.view === "browse"
  );
  const artInspectorVisible = $derived(
    !share.panelOpen && layout.isArtInspectorActive
  );
  const studioInspectorVisible = $derived(
    studioUsesSideInspector && studioSurfaces.inspectorContent === "studio"
  );
  $effect(() => {
    studioSurfaces.setExternalInspectorTarget(
      studioCanShareSideInspector ? studioInspectorOrigin : null
    );
  });
  function ownInspector(node: HTMLElement) {
    return { destroy: studioSurfaces.registerInspector(node) };
  }
  $effect(() => {
    const active = layout.showPostStudio;
    untrack(() => {
      if (active && !studioSurfaces.active) {
        studioSurfaces.enter(
          ctx.currentStepLocal,
          ctx.isPlayingLocal,
          ctx.bpmLocal
        );
        interactions.handleSystemPlaybackChange(false, "system_studio_handoff");
      } else if (!active && studioSurfaces.active) {
        const frame = studioSurfaces.frame;
        if (frame) {
          ctx.handleProgressBarSeek(frame.position);
          interactions.handleSystemPlaybackChange(
            frame.playing,
            "system_studio_handoff"
          );
        }
        studioSurfaces.leave();
      }
    });
  });
</script>

<div class="shared-inspector-parking">
  <div
    class="shared-animator-inspector"
    use:ownInspector
    use:reparentToInspector={{
      // Desktop shares the same stationary settings layer. Moving its contents
      // into a hidden layer on exit would empty the outgoing fade in one frame.
      target: studioCanShareSideInspector
        ? animatorInspectorOrigin
        : (studioSurfaces.inspectorTarget ?? animatorInspectorOrigin),
      animate: true,
      onMoving: (moving) =>
        studioSurfaces.setSurfaceMoving("inspector", moving),
    }}
    data-shared-studio-inspector
  >
    <ExportVideoDrawer
      exportOptions={studioSurfaces.active ? undefined : ctx.exportOptions}
      reserveExportSpace={studioSurfaces.active}
      isExporting={interactions.videoBusy}
      exportProgress={interactions.videoProgress}
      canvasReady={ctx.canvasReady}
      layout={studioSurfaces.active || !layout.isVideoExportActive
        ? "sidebar"
        : layout.effectiveMobile
          ? "bottom"
          : "sidebar"}
      singlePlayDuration={ctx.singlePlayDuration}
      isPlaying={studioSurfaces.controls?.playing ?? ctx.isPlayingLocal}
      bpm={studioSurfaces.controls?.bpm ?? ctx.bpmLocal}
      renderMode={studioSurfaces.active ? "2d" : ctx.renderMode}
      playbackMode={ctx.playbackMode}
      selectedPropType={studioSurfaces.controls?.propType ??
        (ctx.catDogModeEnabled && ctx.propHand === "right"
          ? ctx.rightPropType
          : ctx.leftPropType)}
      fanAppearance={ctx.fanAppearance}
      onFanAppearanceChange={ctx.handleFanAppearanceChange}
      propChirality={createGlobalChiralitySeam(
        ctx.catDogModeEnabled ? ctx.propHand : undefined
      )}
      handProps={studioSurfaces.active ||
      ctx.effectiveSequence?.sequenceKind === "hand-path" ||
      ctx.leftPropType === undefined ||
      ctx.rightPropType === undefined
        ? undefined
        : {
            catDog: ctx.catDogModeEnabled ?? false,
            hand: ctx.propHand,
            leftPropType: ctx.leftPropType,
            rightPropType: ctx.rightPropType,
            onToggleCatDog: ctx.handleCatDogToggle,
            onHandChange: ctx.setPropHand,
          }}
      sequence={ctx.effectiveSequence}
      showInlineExportProgress={false}
      showTempoControls={false}
      showPathShape={!studioSurfaces.active}
      onPropChange={ctx.effectiveSequence?.sequenceKind === "hand-path"
        ? undefined
        : (prop) => {
            studioSurfaces.controls?.setProp(prop);
            interactions.handlePropChange(
              prop,
              "video_export",
              !studioSurfaces.active && ctx.catDogModeEnabled
                ? ctx.propHand
                : "both"
            );
          }}
      onPlaybackToggle={() => {
        if (studioSurfaces.controls) studioSurfaces.controls.toggle();
        else interactions.handlePlaybackToggle("video_export");
      }}
      onBpmChange={(bpm) => {
        studioSurfaces.controls?.setBpm(bpm);
        interactions.handleBpmChange(bpm, "video_export");
      }}
      onExport={studioSurfaces.active
        ? undefined
        : () => interactions.handleVideoExport()}
      showExportAction={false}
      captureVideoOpener={studioSurfaces.active || ctx.renderMode === "3d"
        ? undefined
        : ctx.captureVideoOpener}
      {exportSectionRequest}
      onCancel={interactions.handleCancelVideoExport}
      onSettingChange={scanInstrumentationEnabled
        ? interactions.handleViewerControlSetting
        : undefined}
    />
  </div>
</div>

<div
  class="drawer-viewer-container"
  class:landscape={layout.isLandscape}
  class:practice-mobile={isMobile && ctx.practiceActive}
>
  <ViewerHeader
    {ctx}
    sequence={ctx.effectiveSequence ?? sequence}
    {isMobile}
    viewerWidth={layout.bodyWidth}
    onClose={interactions.handleClose}
    hidden={ctx.isFullscreen}
    {embedded}
    {navigation}
    titleOverride={tunnelComposition?.name?.trim() || null}
    {openAppHref}
    onAccountSignIn={!embedded ? onAccountSignIn : undefined}
    onAccountOpenApp={openAppHref && !embedded
      ? interactions.handleAccountOpenApp
      : undefined}
    guideAction={embedded ? null : guideAction}
    isFavorite={interactions.headerActions.isFavorite}
    onFavoriteToggle={interactions.headerActions.onFavoriteToggle && !embedded
      ? interactions.handleFavoriteToggle
      : undefined}
    isSaved={interactions.headerActions.isSaved}
    isSaving={interactions.headerActions.isSaving}
    onSave={interactions.headerActions.onSave && !embedded
      ? interactions.handleSave
      : undefined}
    onRemix={(onRemix ?? interactions.headerActions.onRemix) && !embedded
      ? interactions.handleRemix
      : undefined}
    onPracticeToggle={interactions.headerActions.showPractice
      ? ctx.practiceActive
        ? interactions.handleExitPractice
        : interactions.handleEnterPractice
      : undefined}
    {canToggleMotionVisibility}
    onMotionToggleLeft={() => interactions.handleMotionToggle("left")}
    onMotionToggleRight={() => interactions.handleMotionToggle("right")}
    onVideoUpload={interactions.headerActions.onVideoUpload && !embedded
      ? interactions.handleHeaderVideoUpload
      : undefined}
    isPublished={interactions.headerActions.isPublished}
    onPublish={interactions.headerActions.onPublish && !embedded
      ? interactions.handlePublish
      : undefined}
    onUnpublish={interactions.headerActions.onUnpublish && !embedded
      ? interactions.handleUnpublish
      : undefined}
    onDeleteRequest={interactions.headerActions.onDeleteRequest && !embedded
      ? interactions.handleDeleteRequest
      : undefined}
    onOpenApp={openAppHref && !embedded
      ? interactions.handleOpenApp
      : undefined}
    exportSettings={layout.isAnyExportActive &&
    !share.panelOpen &&
    !layout.effectiveMobile &&
    !layout.isRecordSceneActive &&
    !layout.isImageExportActive
      ? {
          expanded: !layout.exportSidebarCollapsed,
          onToggle: layout.toggleExportSidebar,
        }
      : null}
    sharePanelOpen={share.panelOpen}
    shareActions={share.actions}
    shareStatusMessage={share.statusMessage}
    onShareActionSelect={share.selectAction}
    onOverflowOpenChange={(open, reason) =>
      captureScanAction(
        open ? "overflow_open" : "overflow_close",
        {},
        { count: reason !== "item" }
      )}
  />

  {#if contextContent && !ctx.isFullscreen}
    {@render contextContent()}
  {/if}

  <!-- The presenter reads viewer-open from the viewer itself. It used to hang
       off the 2D/3D toggle, which meant "the viewer is open" was really "the
       viewer is open AND in 3D" — so open-viewer stayed satisfiable while the
       viewer sat open in 2D and the ghost kept trying to open what it was
       already looking at. -->
  <div
    class="drawer-main"
    data-ghost-state="viewer-open"
    data-sequence-viewer-shell
  >
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="drawer-body-content"
      bind:clientWidth={layout.bodyWidth}
      onclick={showFullscreenControls && ctx.isFullscreen
        ? ctx.handleFullscreenTap
        : undefined}
      onkeydown={showFullscreenControls && ctx.isFullscreen
        ? (event) => {
            if (event.key === "Enter" || event.key === " ") {
              ctx.handleFullscreenTap();
            }
          }
        : undefined}
      role={showFullscreenControls && ctx.isFullscreen ? "button" : undefined}
      tabindex={showFullscreenControls && ctx.isFullscreen ? 0 : undefined}
    >
      {#if showFullscreenControls && ctx.isFullscreen}
        <FullscreenControls
          visible={ctx.fullscreenControlsVisible}
          viewMode={ctx.viewMode}
          isPlaying={ctx.isPlayingLocal}
          bpm={ctx.bpmLocal}
          onExit={ctx.exitFullscreen}
          onPlaybackToggle={ctx.handlePlaybackToggle}
          onStepHalfBeatBackward={ctx.stepHalfBeatBackward}
          onStepHalfBeatForward={ctx.stepHalfBeatForward}
          onStepFullBeatBackward={ctx.stepFullBeatBackward}
          onStepFullBeatForward={ctx.stepFullBeatForward}
          onRestartToStart={ctx.restartToStart}
          onBpmChange={ctx.handleBpmChange}
        />
      {/if}
      {#if ctx.hasSequence && ctx.effectiveSequence}
        <div
          bind:this={viewerWorkspaceElement}
          class="viewer-and-export"
          class:export-active={layout.isWorkspaceInspectorActive ||
            studioUsesSideInspector}
          class:record-scene-active={layout.isRecordSceneActive}
          class:card-inspector={layout.inspectorProfile === "card"}
          class:performance-inspector={layout.inspectorProfile ===
            "performance"}
          class:share-inspector={layout.inspectorProfile === "share"}
          class:studio-stage={layout.showPostStudio}
          class:desktop={!layout.effectiveMobile}
          class:stacked-rail={layout.stackedExportWithRail}
          class:sidebar-collapsed={layout.exportSidebarCollapsed &&
            !layout.isImageExportActive}
          class:has-rail={layout.showRail}
        >
          {#if layout.showRail}
            <div
              class="viewer-rail-wrap"
              class:collapsed={ctx.practiceActive}
              inert={ctx.practiceActive}
              aria-hidden={ctx.practiceActive}
            >
              <ViewerContentRail
                reviewPostStudio={import.meta.env.DEV && reviewPostStudio}
                activeMode={ctx.viewerState.viewerMode}
                webgl2Available={ctx.viewer3DState.webgl2Available}
                compact={layout.compactChrome && !isMobile}
                footerAction={!embedded && !layout.compactChrome && guideAction
                  ? {
                      label: guideAction.label,
                      icon: "fa-book-open",
                      onSelect: guideAction.onSelect,
                    }
                  : undefined}
                onSelectSplit={() => layout.selectSplitMode()}
                onSelectMode={(mode) => layout.selectViewerMode(mode)}
              />
            </div>
          {/if}

          {#snippet workspaceTakeover()}
            <!-- The performance editor stays mounted across visits (its own
                 persistence contract). -->
            <div
              class="performance-editor-layer"
              data-active={workspaceTakeoverActive}
              data-persistent-performance-editor
            >
              <PerformanceEditor
                {sequence}
                isOwned={ctx.isOwned || ctx.isOwnedLibraryRecord}
                bpm={ctx.bpmLocal}
                onSaveFirst={interactions.handleVideoUploadSaveFirst}
              />
            </div>
          {/snippet}

          <ViewerWorkspacePanels
            direction={layout.effectiveMobile ? "vertical" : "horizontal"}
            inspectorActive={layout.isWorkspaceInspectorActive ||
              studioUsesSideInspector}
            inspectorCollapsed={!studioUsesSideInspector &&
              !share.panelOpen &&
              layout.exportSidebarCollapsed &&
              !layout.isImageExportActive}
            inspectorProfile={studioUsesSideInspector
              ? "motion"
              : layout.inspectorProfile}
            stackedInspectorSize={share.panelOpen
              ? "var(--share-inspector-height)"
              : layout.showVideoGallery
                ? "var(--performance-inspector-height)"
                : "auto"}
            stageMinSize={layout.showPostStudio
              ? POST_STUDIO_STAGE_MIN_WIDTH
              : undefined}
            takeover={workspaceTakeover}
            takeoverActive={workspaceTakeoverActive}
          >
            {#snippet stage()}
              <div class="viewer-stage-container">
                {#snippet studioSource()}
                  {#if studio.mounted}
                    <PostStudioPane
                      active={layout.showPostStudio}
                      sequence={ctx.effectiveSequence}
                      resolvedCardAutoLayout={ctx.resolvedCardAutoLayout}
                      onExported={adoptPostStudioRender}
                      onSharePost={share.openPanel}
                      sharing={share.panelOpen}
                    />
                  {/if}
                {/snippet}
                {#snippet viewerSource()}
                  {#snippet motionStageSource()}
                    <div
                      class="viewer-motion-stage-content viewer-motion-content-layer"
                      data-active={!layout.showVideoGallery}
                      data-persistent-motion-stage
                    >
                      <ViewerSplitPane
                        sequence={ctx.effectiveSequence}
                        activeHandLabeling={ctx.activeHandLabeling}
                        {tunnelComposition}
                        {tunnelSaveTarget}
                        {onTunnelSaved}
                        renderMode={ctx.renderMode}
                        rendererHandleRequired={ctx.renderMode === "3d" &&
                          (layout.isRecordSceneActive ||
                            ctx.countdownValue > 0 ||
                            ctx.sceneTakeActive ||
                            ctx.isExporting ||
                            !!ctx.pendingFilmRender ||
                            interactions.videoBusy)}
                        bpm={ctx.bpmLocal}
                        onBpmChange={(bpm) =>
                          interactions.handleBpmChange(bpm, "viewer")}
                        onSaveToLibrary={interactions.handleSave}
                        onPropChange={(prop) =>
                          interactions.handlePropChange(prop, "viewer")}
                        onFanAppearanceChange={ctx.handleFanAppearanceChange}
                        playback={layout.showVideoGallery ||
                        layout.showPostStudio
                          ? { ...ctx.splitPanePlayback, isPlaying: false }
                          : ctx.splitPanePlayback}
                        imageComposition={layout.isImageExportActive
                          ? {
                              ...currentCardImageComposition,
                              darkMode: ctx.exportOptions.imageDarkMode,
                              forceContain: true,
                            }
                          : currentCardImageComposition}
                        propRendering={ctx.splitPanePropRendering}
                        layout={{
                          isFullscreen: ctx.isFullscreen,
                          fullscreenStackVertical: ctx.fullscreenStackVertical,
                          isMobile: layout.effectiveMobile,
                          isLandscapeMobile: layout.isLandscape,
                          focusedPane:
                            ctx.viewerState.viewerMode !== "split"
                              ? ctx.viewerState.viewerMode === "card"
                                ? "image"
                                : "animation"
                              : ctx.editingPane,
                          suppressCloseButton:
                            ctx.viewerState.viewerMode !== "split",
                        }}
                        onRenderProgress={ctx.onRenderProgress}
                        onFocusPane={interactions.handleFocusPane}
                        onUnfocusPane={interactions.handleUnfocusPane}
                        onStepClick={interactions.handleStepClick}
                        onQrPlayClick={ctx.practiceActive
                          ? undefined
                          : layout.playFromQr}
                        onCanvasReady={ctx.handleCanvasReady}
                        cardAutoLayoutOverride={layout.cardAutoLayoutOverride}
                        cardContainSizeMotion={layout.cardContainSizeMotion}
                        onAutoLayoutResolved={(resolved, width, height) => {
                          const cardOwnsReadablePane =
                            ctx.viewerState.viewerMode === "card" ||
                            (ctx.viewerState.viewerMode === "split" &&
                              ctx.editingPane !== "animation");
                          // Keep the last Card box that was large enough to read.
                          // A collapsing hidden Card must not replace that shape
                          // with the wide, shallow grid its exit briefly measures.
                          if (cardOwnsReadablePane) {
                            layout.rememberReadableCardAutoLayout(
                              resolved,
                              width,
                              height
                            );
                          }
                          if (
                            cardOwnsReadablePane &&
                            (resolved || layout.isImageExportActive)
                          ) {
                            ctx.setResolvedCardAutoLayout(resolved);
                          }
                        }}
                        {rerenderTrigger}
                        onChoreoCardContextMenu={(x, y) =>
                          choreoCardMenuHost?.openContextMenu(x, y)}
                        onPlaybackToggle={() =>
                          interactions.handlePlaybackToggle("viewer_transport")}
                        onSystemPlaybackChange={interactions.handleSystemPlaybackChange}
                        onProgressBarSeek={interactions.handleProgressBarSeek}
                        onProgressBarScrubStart={ctx.handleProgressBarScrubStart}
                        onProgressBarScrubEnd={ctx.handleProgressBarScrubEnd}
                        playbackMode={ctx.playbackMode}
                        onPlaybackModeChange={(mode) =>
                          interactions.handlePlaybackModeChange(mode, "viewer")}
                        onSceneReadyChange={(ready) => (sceneReady3d = ready)}
                        splitConfig={ctx.viewerState.viewerMode === "split"
                          ? { leftPane: "animation", rightPane: "card" }
                          : ctx.viewerState.viewerMode === "card"
                            ? {
                                ...ctx.viewerState.splitConfig,
                                rightPane: "card",
                              }
                            : ctx.viewerState.viewerMode === "animation" ||
                                ctx.viewerState.viewerMode === "animation-3d" ||
                                ctx.viewerState.viewerMode === "mandala" ||
                                ctx.viewerState.viewerMode === "tunnel"
                              ? {
                                  ...ctx.viewerState.splitConfig,
                                  leftPane: ctx.viewerState.viewerMode,
                                }
                              : ctx.viewerState.viewerMode === "videos"
                                ? { leftPane: "animation", rightPane: "card" }
                                : ctx.viewerState.splitConfig}
                        isLoggedIn={ctx.isLoggedIn}
                        onVideoUpload={ctx.isLoggedIn && VIDEO_UPLOAD_ENABLED
                          ? interactions.handleGalleryVideoUpload
                          : undefined}
                        onArtExport={interactions.handleArtExport}
                        onArtShare={share.setArtShareTarget}
                        artShareActive={!!share.artShare}
                        onArtExportEvent={interactions.handleArtExportEvent}
                        onArtSettingChange={interactions.handleArtSettingChange}
                        onArtAction={interactions.handleArtAction}
                        onViewer3DSettingChange={scanInstrumentationEnabled
                          ? interactions.handleViewer3DSetting
                          : undefined}
                        onViewer3DAction={scanInstrumentationEnabled
                          ? interactions.handleViewer3DAction
                          : undefined}
                        practiceActive={ctx.practiceActive}
                        practiceRunning={ctx.practiceRunning}
                        practiceCountdown={ctx.practiceCountdown}
                        practiceCellSize={ctx.practiceViewPrefs.cellSize}
                        practiceCanvasFraction={0.5}
                        practiceMirrorEnabled={ctx.mirrorEnabled}
                      />
                    </div>
                  {/snippet}
                  {#snippet performanceStageSource()}
                    <div
                      class="performance-stage-layer"
                      data-active={layout.showVideoGallery}
                      data-persistent-performance-stage
                    >
                      <PerformanceStage
                        {sequence}
                        onSaveToLibrary={interactions.handleSave}
                      />
                    </div>
                  {/snippet}
                  <DualSourceCrossfade
                    active={layout.showVideoGallery ? "second" : "first"}
                    first={motionStageSource}
                    second={performanceStageSource}
                    duration={DURATION.emphasis}
                  />
                {/snippet}
                <DualSourceCrossfade
                  active={studio.shown ? "second" : "first"}
                  first={viewerSource}
                  second={studioSource}
                  duration={DURATION.emphasis}
                />
                <!-- Share owns progress and cancellation while open. A second
                     native modal would intercept its visible controls. -->
                {#if ctx.renderMode === "3d" && !share.postSheetOpen && (ctx.countdownValue > 0 || ctx.isRecording3D || ctx.isExporting || ctx.pendingFilmRender)}
                  <Recording3DOverlay
                    countdownValue={ctx.countdownValue}
                    isRecording={ctx.isRecording3D}
                    elapsed={ctx.recordingElapsed}
                    onStop={interactions.handleStopRecording}
                    exportProgress={ctx.exportProgress}
                    isExporting={ctx.isExporting}
                    onCancelExport={interactions.handleCancelVideoExport}
                    pendingRender={ctx.pendingFilmRender}
                    onConfirmRender={interactions.handleConfirmFilmRender}
                    onDiscardRender={interactions.handleDiscardFilmRender}
                  />
                {/if}
                {#if ctx.renderMode !== "3d" && !share.postSheetOpen && shellRendersTakeover && animTakeover.phase !== "idle"}
                  <ExportTakeover
                    phase={animTakeover.phase}
                    progress={interactions.videoProgress?.progress ?? 0}
                    phaseLabel={animTakeover.labelKey
                      ? t(animTakeover.labelKey)
                      : ""}
                    error={interactions.videoProgress?.error ?? null}
                    onCancel={interactions.handleCancelVideoExport}
                    onRetry={() => interactions.handleVideoExport("retry")}
                  >
                    {#snippet title()}
                      {#if motionProfile.kind === "solo"}
                        <span class="takeover-title-text">{takeoverLabel}</span>
                      {:else}
                        <TKAWordGlyph
                          word={takeoverWord}
                          height={28}
                          darkMode
                        />
                      {/if}
                    {/snippet}
                  </ExportTakeover>
                {/if}
                <ChoreoCardContextMenuHost
                  bind:this={choreoCardMenuHost}
                  sequence={ctx.effectiveSequence ?? sequence}
                  onSaveToLibrary={interactions.handleSave}
                  onRerender={() => {
                    rerenderTrigger++;
                  }}
                  isExportMode={layout.isImageExportActive}
                  exportOptions={ctx.exportOptions}
                  onSendTo={share.openPanel}
                  onSendToStickerLab={share.sendToStickerLab}
                  stepCount={sequence?.steps?.length ?? 0}
                  onAction={interactions.handleCardContextAction}
                />
                {#if layout.isRecordSceneActive && ctx.effectiveSequence && sceneReady3d && ctx.countdownValue === 0 && !ctx.isRecording3D}
                  <RecordSceneChrome
                    isExporting={ctx.isExporting || !!ctx.pendingFilmRender}
                    canvasReady={ctx.canvasReady}
                    onExport={() => interactions.handleVideoExport()}
                    choreography={ctx.viewer3DState.cameraChoreography}
                    onSettingChange={scanInstrumentationEnabled
                      ? interactions.handleViewerControlSetting
                      : undefined}
                  />
                {/if}
              </div>
            {/snippet}

            {#snippet inspector()}
              <div
                class="export-panel-container"
                class:card-settings={layout.isImageExportActive}
                class:art-settings={layout.isArtInspectorActive}
                class:sidebar={!layout.effectiveMobile &&
                  (layout.isVideoExportActive || layout.isVideoUploadActive)}
              >
                <!-- These layers share the inspector track for their entire
                     lifetime. Changing data-active now starts the content
                     crossfade in the same frame that PanelGroup moves the
                     Card/inspector seam; there is no second mount-intro. -->
                <div
                  class="inspector-content-layer studio-settings-layer"
                  data-active={studioInspectorVisible}
                  inert={!studioInspectorVisible}
                  aria-hidden={!studioInspectorVisible}
                  bind:this={studioInspectorOrigin}
                ></div>
                <div
                  class="inspector-content-layer motion-settings-layer"
                  data-active={motionInspectorVisible}
                  inert={!motionInspectorVisible || undefined}
                  aria-hidden={!motionInspectorVisible}
                  data-effects-inspector
                >
                  {#if ctx.previewBlobUrl}
                    <VideoPreviewPanel
                      blobUrl={ctx.previewBlobUrl}
                      saveLabel="Download video"
                      onDismiss={interactions.handleDismissExportedVideo}
                      onRedownload={() =>
                        void interactions.handleRedownloadExportedVideo()}
                      onSaveToCloud={canSaveFilmToSequence
                        ? saveFilmToSequence
                        : undefined}
                      cloudSaveLabel="Attach video to sequence"
                    />
                  {:else}
                    <!-- No tempo and no playback mode on the Motion page: the
                         transport under the canvas carries both and is visible
                         from every page of this panel. Showing them here too put
                         one setting on screen twice in two different controls.
                         `bpm` and `playbackMode` still come in — the export page
                         reads them for its duration estimate. -->
                    <div
                      class="animator-inspector-origin"
                      bind:this={animatorInspectorOrigin}
                    ></div>
                  {/if}
                </div>
                <div
                  class="inspector-content-layer performance-inspector-layer"
                  data-active={performanceInspectorVisible}
                  inert={!performanceInspectorVisible || undefined}
                  aria-hidden={!performanceInspectorVisible}
                  data-persistent-performance-inspector
                >
                  <PerformanceInspector
                    isOwned={ctx.isOwned || ctx.isOwnedLibraryRecord}
                    isLoggedIn={ctx.isLoggedIn}
                    canUpload={ctx.isLoggedIn && VIDEO_UPLOAD_ENABLED}
                  />
                </div>
                <div
                  class="inspector-content-layer art-settings-layer"
                  data-active={artInspectorVisible}
                  inert={!artInspectorVisible || undefined}
                  aria-hidden={!artInspectorVisible}
                  bind:this={artInspectorTarget}
                  data-viewer-art-inspector-target
                ></div>
                <!-- Share: the panel takes the track the settings use, and
                     the stage beside it stays live so the person shares the
                     view they can see. It mounts with the panel and leaves
                     with it (a closed panel holds nothing); the outro keeps
                     it in place while the layer fades and the track closes. -->
                <div
                  class="inspector-content-layer share-layer"
                  data-active={share.panelOpen}
                  inert={!share.panelOpen || undefined}
                  aria-hidden={!share.panelOpen}
                  data-viewer-share-panel
                >
                  {#if share.panelOpen}
                    <div
                      class="share-layer-content"
                      out:flyFade={{ y: 0, duration: DURATION.fast }}
                    >
                      <ViewerSharePanel
                        subject={shareSubject}
                        downloadLabel={shareDownloadLabel}
                        downloadText={shareDownload.text}
                        downloadIcon={shareDownload.icon}
                        linkCopied={share.linkCopied}
                        onCopyLink={() => void share.copyShareLink()}
                        embedCopied={share.embedCopied}
                        onCopyEmbed={() => void share.copyEmbedSnippet()}
                        onDownload={() => void downloadFromShare()}
                        downloadDetail={shareDownload.detail}
                        downloadProgress={shareRendersDirectly &&
                        interactions.videoBusy
                          ? (interactions.videoProgress?.progress ?? 0)
                          : null}
                        downloadDisabled={shareRendersDirectly
                          ? !ctx.canvasReady
                          : sharesFilm &&
                            (ctx.sceneTakeActive || ctx.isExporting)}
                        detailAction={shareDownload.action}
                        onNativeShare={canShareNatively
                          ? share.shareLinkNatively
                          : undefined}
                        onPublish={META_POSTING_ENABLED
                          ? share.publishCurrentView
                          : undefined}
                        session={share.sendSession}
                        getViewParams={share.currentViewParams}
                        onSent={handleSequenceSent}
                        onRequestAccount={() => {
                          authDrawerState.show("signup", "share-sequence");
                        }}
                        onClose={share.closePanel}
                      />
                    </div>
                  {/if}
                </div>
                {#if !isMobile}
                  <div
                    class="inspector-content-layer card-settings-layer"
                    data-active={cardInspectorVisible}
                    inert={!cardInspectorVisible || undefined}
                    aria-hidden={!cardInspectorVisible}
                    data-shared-card-inspector
                  >
                    <!-- Card settings share the persistent inspector layers on
                         desktop. A direct Card-to-Motion switch can now fade
                         these controls against the incoming settings instead
                         of removing one panel before the other becomes visible. -->
                    <ExportImagePanel
                      exportOptions={ctx.exportOptions}
                      stepCount={ctx.effectiveSequence?.steps?.length ?? 0}
                      resolvedAutoLayout={ctx.resolvedCardAutoLayout}
                      layout={layout.effectiveMobile ? "bottom" : "sidebar"}
                      onSettingChange={interactions.handleCardSettingChange}
                      cardPresentation={cardPresentation.value}
                      onCardPresentationChange={cardPresentation.set}
                      onSaveCardPresentation={ctx.isOwned &&
                      ctx.isOwnedLibraryRecord
                        ? async () => {
                            await persistCardPresentation();
                          }
                        : undefined}
                      cardPresentationDirty={cardPresentation.dirty}
                      cardPresentationSaving={cardPresentation.saving}
                    />
                  </div>
                {/if}
              </div>
            {/snippet}
          </ViewerWorkspacePanels>
        </div>
        {#if isMobile && layout.isImageExportActive && ctx.effectiveSequence && !share.panelOpen}
          <!-- Entrance/exit fly now lives on ControlDock's root
               (shared by every dock); this wrapper only positions. -->
          <div class="export-footer-overlay">
            <ExportImagePanel
              exportOptions={ctx.exportOptions}
              stepCount={ctx.effectiveSequence.steps?.length ?? 0}
              resolvedAutoLayout={ctx.resolvedCardAutoLayout}
              layout="bottom"
              onClose={interactions.handleUnfocusPane}
              onSettingChange={interactions.handleCardSettingChange}
              cardPresentation={cardPresentation.value}
              onCardPresentationChange={cardPresentation.set}
              onSaveCardPresentation={ctx.isOwned && ctx.isOwnedLibraryRecord
                ? async () => {
                    await persistCardPresentation();
                  }
                : undefined}
              cardPresentationDirty={cardPresentation.dirty}
              cardPresentationSaving={cardPresentation.saving}
            />
          </div>
        {/if}
      {/if}
    </div>
    {#if isMobile && ctx.hasSequence && ctx.effectiveSequence && !focusedModeActive && dockTrayState.openCount === 0}
      <!-- Ducks while any ControlDock tray is open — the media switcher is
           noise while the user edits, and the tray gets the room.
           Choreography: the slot height eases closed (outer slide) while
           the bar itself glides down (inner fly), on the SAME 260ms
           cubicOut curve as the tray — reads as the tray displacing the
           bar, not a pop. -->
      <div
        transition:slide={{
          duration: layout.prefersReducedMotion ? 0 : 260,
          easing: cubicOut,
        }}
      >
        <div
          transition:fly={{
            y: 72,
            duration: layout.prefersReducedMotion ? 0 : 260,
            easing: cubicOut,
          }}
        >
          <ViewerModeBottomBar
            reviewPostStudio={import.meta.env.DEV && reviewPostStudio}
            activeMode={ctx.viewerState.viewerMode}
            webgl2Available={ctx.viewer3DState.webgl2Available}
            onSelectSplit={() => layout.selectSplitMode()}
            onSelectMode={(mode) => layout.selectViewerMode(mode)}
          />
        </div>
      </div>
    {/if}
  </div>
  {#if ctx.hasSequence}
    <!-- Bottom workstation: stays mounted, a flow child that PUSHES the
         content up (so the bottom rows stay visible). Height toggles in
         one reflow at the slide's near edge; the visible motion is a
         composited translateY → 60fps even while the animator runs.
         Parked (height 0) + inert when not practicing. -->
    <div
      class="practice-bar-rise"
      class:reserved={ctx.practiceActive}
      class:up={ctx.practiceActive}
      inert={!ctx.practiceActive}
    >
      <!-- Bottom-bar conveyor: setup config (setup phase) ↔ running cockpit
           (running phase). Config slides out left as the cockpit slides in
           from the right on Start. Cockpit is the flow child so it defines
           the bar's height; config overlays it. -->
      <div
        class="bar-pane config"
        class:active={!ctx.practiceRunning}
        inert={ctx.practiceRunning}
      >
        <PracticeSetupBar
          config={ctx.practiceState.userConfig}
          onSetConfig={interactions.handlePracticeSetConfig}
          onStart={interactions.handlePracticeStart}
        />
      </div>
      <div
        class="bar-pane cockpit"
        class:active={ctx.practiceRunning}
        inert={!ctx.practiceRunning}
      >
        <PracticeBar
          progress={ctx.practiceState.progress}
          bpm={ctx.bpmLocal}
          isPlaying={ctx.isPlayingLocal}
          onBpmChange={(bpm) => interactions.handleBpmChange(bpm, "practice")}
          onPlayPause={() => interactions.handlePlaybackToggle("practice")}
          onStepLevel={interactions.handlePracticeStepLevel}
          onToggleHold={interactions.handlePracticeToggleHold}
          onStop={interactions.handlePracticeStop}
          metronomeOn={ctx.metronomeEnabled}
          onToggleMetronome={interactions.handleToggleMetronome}
          mirrorOn={ctx.mirrorEnabled}
          onToggleMirror={interactions.handleToggleMirror}
        />
      </div>
    </div>
  {/if}

  {#if interactions.deleteConfirmOpen}
    <DeleteConfirmDialog
      word={sequence?.word}
      isDeleting={interactions.isDeleting}
      positioning="absolute"
      onConfirm={interactions.handleDeleteConfirm}
      onCancel={interactions.handleDeleteCancel}
    />
  {/if}

  <!-- Post handoff. Lives in the shell, never in a host, so the drawer, /q and
       /sequence surfaces are identical by construction. `autoDeliver: false`
       because the sheet delivers the render itself — without it the same take
       also lands in Downloads and toasts behind the drawer. -->
  <!-- The video slot follows whatever the share was about. From Mandala it is
       the mandala's own worker render; from Tunnel it is the kaleidoscope bake
       (which already lands in the shared exporter's preview slot, so only the
       request differs); otherwise it is the sequence animation. -->
  <PostShareSheet
    isOpen={share.postSheetOpen}
    sequence={ctx.effectiveSequence ?? null}
    shareUrl={share.postSheetOpen ? share.getShareUrl() : ""}
    videoBlobUrl={artShareVideo.blobUrl}
    isExportingVideo={artShareVideo.exporting}
    exportProgress={artShareVideo.progress}
    onRequestVideo={artShareVideo.request}
    onCancelVideo={artShareVideo.cancel}
    onPrepareFile={share.prepareFile}
    initialEntry={share.initialEntry}
    videoLabel={artShareVideo.label}
    captureAnimationPreview={share.artShare
      ? share.artShare.capturePreview
      : share.postShare
        ? () => ""
        : ctx.captureAnimationPreview}
    captureVideoOpener={ordinaryAnimationShare
      ? ctx.captureVideoOpener
      : undefined}
    onOpenVideoExport={!share.artShare && !share.postShare
      ? openVideoDownloadFromSheet
      : undefined}
    is3DExport={ctx.renderMode === "3d"}
    videoSourceKey={`${ctx.effectiveSequence?.id ?? ctx.effectiveSequence?.word ?? "unsaved"}:${share.getShareUrl()}:${viewerVideoSourceIdentity(share.videoSourceKind, share.postShare ? postStudioVideoUrl : null)}:${ctx.renderMode}`}
    initialArtifact={share.artShare || (share.postShare && !!postStudioVideoUrl)
      ? "video"
      : ctx.viewerState.viewerMode === "card"
        ? "card"
        : share.initialEntry === "download" ||
            ctx.viewerState.viewerMode === "animation"
          ? "video"
          : "card"}
    resolvedCardAutoLayout={ctx.resolvedCardAutoLayout}
    initialCardPresentation={cardPresentation.value}
    onSaveCardPresentation={ctx.isOwned && ctx.isOwnedLibraryRecord
      ? persistCardPresentation
      : undefined}
    needsAccountForFiles={!authState.isFullAccount}
    onRequestAccount={() => authDrawerState.show("signup", "export")}
    onOpenPostStudio={canAccessPostStudio()
      ? () => layout.selectViewerMode("post-studio")
      : undefined}
    onClose={() => share.setPostSheetOpen(false)}
  />
</div>

<style>
  .shared-inspector-parking {
    display: none;
  }
  .shared-animator-inspector,
  .animator-inspector-origin {
    width: 100%;
    height: 100%;
    min-height: 0;
    min-width: 0;
  }
  .drawer-viewer-container {
    /* One shared clock so the rail-out and bar-up choreograph in lockstep. */
    --ws-dur: 300ms;
    --ws-ease: cubic-bezier(0.2, 0, 0, 1);
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: var(--theme-panel-bg, #0a0a14);
  }

  .drawer-main {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }

  .drawer-body-content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
  }

  /* Rail stays mounted; on practice enter it fades + nudges out (composited) AND
     its width animates 320→0 over --ws-dur on the same shared clock. The width is
     what reclaims layout space, so animating it (not snapping it) lets the split-
     view — and the canvas column inside it — GLIDE into the freed space as one
     continuous motion. Snapping max-width to 0 instantly is what jolted the canvas
     ("sidebar vanishes → canvas jumps"); animating it removes the snap at the
     source, so no JS FLIP is needed on the canvas side. */
  .viewer-rail-wrap {
    display: flex;
    min-height: 0;
    overflow: hidden;
    max-width: 320px;
    will-change: opacity, transform, max-width;
    transition:
      opacity var(--ws-dur) var(--ws-ease),
      transform var(--ws-dur) var(--ws-ease),
      max-width var(--ws-dur) var(--ws-ease);
  }
  .viewer-rail-wrap.collapsed {
    opacity: 0;
    transform: translateX(-12px);
    max-width: 0;
    pointer-events: none;
  }

  /* Bottom workstation: a flow child so it PUSHES the content up (bottom rows
     stay visible — not an overlay). The row's height animates 0↔auto on the same
     --ws-dur clock as the rail collapse (interpolate-size enables the auto
     keyword), so the canvas glides into its practice height in step with the
     horizontal rail glide — one diagonal motion, no vertical snap. The cockpit
     itself rides in on a composited transform/opacity for 60fps. Height settles
     at practice ENTER (setup), so Start/Stop never re-run this — they only slide
     the cockpit via transform. */
  .practice-bar-rise {
    position: relative; /* anchors the absolute config bar-pane */
    flex-shrink: 0;
    overflow: hidden;
    height: 0;
    transform: translateY(16px);
    opacity: 0;
    will-change: transform, opacity, height;
    /* Scoped to this element ONLY (it's an inherited property — set on a shared
       ancestor it leaks the height:auto animation into the whole viewer subtree
       and collapsed the right preview card). Enables the row's 0↔auto glide. */
    interpolate-size: allow-keywords;
    transition:
      transform var(--ws-dur) var(--ws-ease),
      opacity var(--ws-dur) var(--ws-ease),
      height var(--ws-dur) var(--ws-ease);
  }
  /* Entering practice (setup OR running) reserves the bar's row, growing it from
     0 over --ws-dur so the canvas resize is a glide, not a step. */
  .practice-bar-rise.reserved {
    height: auto;
  }
  /* Practice active: the bar rises a short distance and fades in, carrying the
     setup config. (Start swaps config→
     cockpit via the inner conveyor; the bar itself stays put.) */
  .practice-bar-rise.reserved.up {
    transform: translateY(0);
    opacity: 1;
  }

  /* Inner conveyor: config (setup) ↔ cockpit (running). Cockpit is the flow child
     so it defines the bar's auto height; config is an absolute overlay. Both slide
     on the shared clock — config exits left, cockpit enters right on Start. */
  .bar-pane {
    transition: transform var(--ws-dur) var(--ws-ease);
    will-change: transform;
  }
  .bar-pane.config {
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
  }
  .bar-pane.config.active {
    transform: translateX(0);
  }
  .bar-pane.cockpit {
    position: relative;
    transform: translateX(100%);
  }
  .bar-pane.cockpit.active {
    transform: translateX(0);
  }
  @media (prefers-reduced-motion: reduce) {
    .bar-pane {
      transition: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .drawer-viewer-container {
      --ws-dur: 0ms;
    }
    .viewer-rail-wrap,
    .practice-bar-rise {
      transition: none;
    }
  }

  .viewer-and-export {
    --export-sidebar-width: 560px;
    --card-sidebar-width: clamp(480px, 28vw, 640px);
    --performance-sidebar-width: clamp(380px, 24vw, 520px);
    --share-sidebar-width: clamp(360px, 22vw, 480px);
    --active-inspector-width: var(--export-sidebar-width);
    position: relative;
    display: flex;
    flex-direction: row;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .viewer-and-export.card-inspector {
    --active-inspector-width: var(--card-sidebar-width);
  }

  /* Performances keeps a narrower column than the effects inspector so the
     landscape video gets the width. The difference between the two tokens is
     the seam travel PanelGroup animates on the structural clock when the mode
     changes. */
  .viewer-and-export.performance-inspector {
    --active-inspector-width: var(--performance-sidebar-width);
  }

  /* The share panel is a few actions over a list of names; the column is
     the narrowest of the set so the stage keeps the room for the view being
     shared. */
  .viewer-and-export.share-inspector {
    --active-inspector-width: var(--share-sidebar-width);
  }

  .viewer-stage-container {
    position: relative;
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    isolation: isolate;
  }

  .viewer-motion-stage-content,
  .performance-stage-layer,
  .performance-editor-layer {
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  /* The two takeovers stack in one crossfade source; only one is up. */
  .performance-editor-layer[data-active="false"] {
    display: none;
  }

  /* The settings column never grew with the viewport, so on a big screen its
     panels stayed a phone-width strip and paid for it in height: the effects
     inspector spent four rows on eight looks and scrolled. Wider here is
     cheaper than taller — the extra width lets the inspector put its looks
     beside its controls and fit one screen (4k-native-layout.md, the 1680
     seam). The canvas beside it is still the larger half at every tier. */
  @media (min-width: 1680px) {
    .viewer-and-export {
      --export-sidebar-width: 800px;
    }
  }

  /* At 4K@100% and on a jam TV nothing is scaling for you, so this tier has to
     step the composition, not nudge it: 1000px puts the effects inspector past
     its 52rem seam, where each look becomes a horizontal study instead of a
     stacked card. The canvas is still well over half the screen at 3840. */
  @media (min-width: 2600px) {
    .viewer-and-export {
      --export-sidebar-width: 1000px;
    }
  }

  .viewer-and-export:not(.desktop)
    .viewer-stage-container
    :global(.view-container) {
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .viewer-and-export.desktop .viewer-stage-container :global(.view-container) {
    position: relative;
    inset: auto;
  }

  /* The 3D scene rail pins its Presets/Save cluster to the same corner the
     Record Scene pill anchors to (SceneControlRail: right 0.75rem, bottom
     5rem, z-index 30 — above the pill). When the rail is present, shift the
     pill left of the rail column (0.75rem gutter + 48px buttons + 0.75rem
     gap) so the two never stack. Compact workspaces replace the rail with
     the bottom bar and keep the pill's default inset. */
  :global(
    .viewer-and-export.record-scene-active:has(
        [data-scene-control-workspace]:not([data-presentation="compact"])
      )
  ) {
    --record-scene-right: calc(1.5rem + 48px);
    /* Shifting the pill left of the rail parks it over the inspector column
       instead, where it covers the performer hub's bottom-anchored tab bar.
       Raise the inspector's floor above the pill (80px inset + 45px pill +
       12px gap) so the panel ends where the pill begins. Only the inspector
       reads this var; the rail keeps its own bottom and its own z-index. */
    --scene-controls-bottom: calc(80px + 45px + 12px);
  }

  /* Compact workspaces center the Performer/Scene action bar along the same
     bottom band the pill anchors to. Lift the pill above the bar (57px bar
     + 12px gap) instead of shifting it sideways — the bar is centered, so
     no horizontal inset can guarantee clearance. */
  :global(
    .viewer-and-export.record-scene-active:has(
        [data-scene-control-workspace][data-presentation="compact"]
      )
  ) {
    --record-scene-bottom: calc(80px + 57px + 12px);
  }

  .export-panel-container {
    position: relative;
    overflow: hidden;
    overflow-y: auto;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    isolation: isolate;
    min-width: 0;
  }

  .export-panel-container.art-settings {
    overflow: hidden;
  }

  /* Each layer paints the inspector surface across the whole track, and the
     panel it holds paints none. A composed panel is narrower than the track
     for as long as the seam is travelling, so leaving the surface on the panel
     left the remaining band showing the workspace through the container's
     partly transparent fill: a lighter vertical strip that appeared, held, and
     vanished. Stacking container and layer reproduces the resting fill exactly
     while covering the track at every intermediate width. */
  .inspector-content-layer {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity var(--transition-fast),
      visibility 0s linear var(--duration-fast);
  }

  .inspector-content-layer[data-active="true"] {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transition:
      opacity var(--transition-fast),
      visibility 0s linear 0s;
  }

  /* These are whole workspaces of controls, not button feedback. A fast,
     front-loaded fade reads as a pop beside the travelling Card. Let the
     existing layers dissolve over the same deliberate beat in either direction. */
  .inspector-content-layer:is(.motion-settings-layer, .card-settings-layer) {
    will-change: opacity;
    transition:
      opacity var(--duration-dramatic) var(--ease-in-out),
      visibility 0s linear var(--duration-dramatic);
  }

  .inspector-content-layer:is(
      .motion-settings-layer,
      .card-settings-layer
    )[data-active="true"] {
    transition-delay: 0s, 0s;
  }

  .motion-settings-layer {
    display: flex;
    justify-content: flex-start;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .performance-inspector-layer {
    display: flex;
    justify-content: flex-start;
    overflow: hidden;
  }

  .share-layer {
    display: flex;
    overflow: hidden;
  }

  .share-layer-content {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .card-settings-layer {
    display: flex;
    justify-content: flex-start;
    overflow: hidden;
  }

  /* Stacked (effectiveMobile above the phone breakpoint): the layer hosts the
     bottom ControlDock, which sizes itself from its contents. As a flex row
     the dock shrink-wrapped to its icon-only bar width and sat in the corner
     of the track; a column lets it span the stacked inspector's full width. */
  .viewer-and-export:not(.desktop) .card-settings-layer {
    flex-direction: column;
    align-items: stretch;
  }

  /* Art settings paint the card fill rather than the panel fill, so their layer
     has to carry that token instead. Painting the shared one here would change
     the inspector's colour under any theme whose card and panel fills differ. */
  .art-settings-layer {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .inspector-content-layer :global(.export-panel),
  .inspector-content-layer :global(.performance-inspector),
  .inspector-content-layer :global(.art-settings-panel) {
    background: transparent;
  }

  /* Every composed panel is pushed to the closing edge by an automatic start
     margin, which is the one declaration that gets both directions right. A
     panel narrower than the track keeps its place at the viewport edge and
     simply fades, so a departing surface never slides its contents sideways on
     the way out. A panel wider than the track has no free space for the margin
     to absorb, so it collapses to zero and the panel is revealed from the seam
     with its overflow spilling past the screen edge, where the cut cannot be
     seen. Anchoring either direction by hand cuts a leading label column off or
     drags a fading panel across the workspace.

     The persistent Effects workspace is already composed at its destination
     width while the zero-width inspector track is closed. PanelGroup then
     reveals that stable surface through a moving clip instead of asking every
     control row to rewrap at each intermediate width. */
  .viewer-and-export.desktop .motion-settings-layer .animator-inspector-origin {
    width: var(--export-sidebar-width);
    min-width: var(--export-sidebar-width);
    flex: 0 0 var(--export-sidebar-width);
    margin-left: auto;
  }

  /* The Performances inspector is composed at its own destination width
     before the mode changes. PanelGroup then slides the seam from the effects
     width to this width and reveals the already-laid-out column through the
     moving clip, so nothing rewraps while the stage source crossfades. */
  .viewer-and-export.desktop
    .performance-inspector-layer
    > :global(.performance-inspector) {
    width: var(--performance-sidebar-width);
    min-width: var(--performance-sidebar-width);
    flex: 0 0 var(--performance-sidebar-width);
    margin-left: auto;
  }

  /* Art settings are portaled in as an absolutely positioned host that already
     fills the track, so `width: 100%` on the panel inside made it stretch and
     re-wrap on every frame of the seam animation. Compose it at the same
     destination width the Effects inspector uses. */
  .viewer-and-export.desktop
    .art-settings-layer
    > :global(.art-settings-host.external)
    > :global(.art-settings-panel) {
    width: var(--export-sidebar-width);
    min-width: var(--export-sidebar-width);
    flex: 0 0 var(--export-sidebar-width);
    margin-left: auto;
  }

  :global(.panel-wrapper[data-manually-sized="true"])
    .art-settings-layer
    > :global(.art-settings-host.external)
    > :global(.art-settings-panel) {
    width: 100%;
    min-width: 0;
    flex-basis: 100%;
  }

  /* The card pin below is keyed to a mode-conditional container class, which
     Svelte removes the instant the mode changes. The departing Card panel then
     falls back to its intrinsic width and follows the closing seam. Keying the
     same destination width to the persistent layer keeps it composed on the
     way out as well as on the way in. */
  .viewer-and-export.desktop
    .card-settings-layer
    :global(.export-panel:not(.inline)) {
    width: var(--card-sidebar-width);
    min-width: var(--card-sidebar-width);
    flex: 0 0 var(--card-sidebar-width);
    margin-left: auto;
  }

  :global(.panel-wrapper[data-manually-sized="true"])
    .card-settings-layer
    :global(.export-panel:not(.inline)) {
    width: 100%;
    min-width: 0;
    flex-basis: 100%;
  }

  :global(.panel-wrapper[data-manually-sized="true"])
    .motion-settings-layer
    .animator-inspector-origin {
    width: 100%;
    min-width: 0;
    flex-basis: 100%;
  }

  :global(.panel-wrapper[data-manually-sized="true"])
    .performance-inspector-layer
    > :global(.performance-inspector) {
    width: 100%;
    min-width: 0;
    flex-basis: 100%;
  }

  :global(:root[data-motion-preference="reduce"]) .inspector-content-layer {
    transition-duration: 0ms, 0s;
    transition-delay: 0s, 0s;
  }

  /* PanelGroup owns the dock's structural motion. Keep Card settings composed
     at their default destination width while the dock opens, so chip wrapping
     and vertical centering do not invent a second, accidental transition. Once
     the person grabs the seam, the panel follows that direct manipulation. */
  .viewer-and-export.desktop .export-panel-container.card-settings {
    display: flex;
    justify-content: flex-end;
    overflow: hidden;
  }

  .viewer-and-export.desktop
    .export-panel-container.card-settings
    :global(.export-panel:not(.inline)) {
    width: var(--active-inspector-width);
    min-width: var(--active-inspector-width);
    flex: 0 0 var(--active-inspector-width);
  }

  :global(.panel-wrapper[data-manually-sized="true"])
    .export-panel-container.card-settings
    :global(.export-panel:not(.inline)) {
    width: 100%;
    min-width: 0;
    flex-basis: 100%;
  }

  /* Stacked export layout — phones AND desktop widths too narrow for the 560px
     sidebar. The settings dock sits UNDER a full-width hero preview instead of
     beside it. Keyed off :not(.desktop) (toggled by effectiveMobile) rather than a
     viewport media query, so the same correct stacking applies at, say, 1200px when
     the rail + sidebar + preview wouldn't fit. */
  .viewer-and-export:not(.desktop) .export-panel-container {
    width: 100%;
    flex-shrink: 0;
    overflow: visible;
    border-left: none;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  /* The stacked dock is content-sized: ViewerWorkspacePanels hands the track
     `preferredSize: auto` and PanelGroup measures whatever is in flow. Every
     inspector layer is absolute for the desktop crossfade, so nothing was in
     flow, the container measured 0px, and the motion dock sat one pixel below
     the viewport with no pill reachable. While stacked, the ACTIVE layer
     returns to flow and gives the track its height; the inactive layers keep
     stacking behind it at the same size. */
  .viewer-and-export:not(.desktop)
    .export-panel-container
    > .inspector-content-layer[data-active="true"] {
    position: relative;
    inset: auto;
  }

  .viewer-and-export:not(.desktop)
    .performance-inspector-layer
    > :global(.performance-inspector) {
    height: var(--performance-inspector-height);
    min-height: 16rem;
  }

  /* Stacked share: the panel docks under the live stage at a height the
     actions, the list, the note, and Send can share. */
  .viewer-and-export:not(.desktop) .share-layer > .share-layer-content {
    height: var(--share-inspector-height);
    min-height: 18rem;
  }

  .viewer-and-export {
    --performance-inspector-height: min(46vh, 30rem);
    --share-inspector-height: min(54vh, 34rem);
  }

  /* Post Studio stacks share only on a phone-width body. Its stage is a 9:16
     frame between the studio's action bar and transport, so the general dock
     height left a 1x2px preview on a 375x667 phone. This height keeps the
     panel's actions in view and scrolls its list; the frame keeps the rest. */
  .viewer-and-export.studio-stage {
    --share-inspector-height: min(34dvh, 22rem);
  }

  @media (min-height: 34.0625rem) {
    .viewer-and-export.studio-stage:not(.desktop)
      .share-layer
      > .share-layer-content {
      min-height: 12rem;
    }
  }

  @media (max-height: 34rem) {
    .viewer-and-export:not(.desktop)
      .performance-inspector-layer
      > :global(.performance-inspector) {
      height: var(--performance-inspector-height);
      min-height: 10rem;
    }

    .viewer-and-export:not(.desktop) .share-layer > .share-layer-content {
      min-height: 10rem;
    }

    /* A landscape phone: the dock takes more than the performance one so
       the picker keeps its heading, the chosen recipient, and a row or two
       of the list above the bar; the stage becomes a strip for the moment. */
    .viewer-and-export {
      --performance-inspector-height: min(48vh, 13rem);
      --share-inspector-height: min(64vh, 17rem);
    }
  }

  .viewer-and-export:not(.desktop).export-active
    .viewer-stage-container
    :global(.view-container) {
    position: relative;
    inset: auto;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* Flow child of .drawer-body-content (a flex column), NOT an absolute overlay.
     As a flow sibling it claims real height, so .viewer-and-export (flex: 1)
     yields and the card's contain-box shrinks — the card lifts fully above the
     dock instead of hiding behind it. When the tray slides open the footer grows,
     the card reflows up in lockstep (same pattern the practice-bar-rise uses).
     Never covers card content: not the collapsed cat-bar, not the open tray. */
  .export-footer-overlay {
    position: relative;
    flex-shrink: 0;
    z-index: 3;
  }
</style>
