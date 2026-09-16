<script lang="ts">
  import SavePropDialog from "$lib/shared/library/components/SavePropDialog.svelte";
  import { resolveViewingProps } from "$lib/shared/foundation/services/prop-viewing";
  import { onMount, onDestroy, untrack, type Snippet } from "svelte";
  import {
    applySequencePathPreview,
    savedSequencePathPolicy,
    countPathOverrides,
  } from "../services/sequence-path-policy";
  import type { AnimationPathPolicy } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { setViewerPathContext } from "../context/viewer-path-context";
  import { getAnimationPlaybackController } from "$lib/shared/animation-engine/get-animation-playback-controller";
  import { getSequenceAnimationOrchestrator } from "$lib/shared/animation-engine/get-sequence-animation-orchestrator";
  import { getLanSyncCoordinator } from "$lib/shared/lan-sync/get-lan-sync-coordinator";
  import { hydrateSequence as hydrateSequenceData } from "$lib/shared/sequence-viewer/services/sequence-data-provider";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { getSequenceMotionVisibility } from "$lib/shared/foundation/services/sequence-motion-profile";
  import type {
    OrchestratorContext,
    ViewMode,
  } from "../domain/viewer-orchestrator-context";
  import { SCENE_BPM_INTENT_KEY } from "$lib/features/scene-3d-collection/services/open-3d-scene";
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";
  import {
    generateViewerURL,
    encodePropForURL,
  } from "$lib/shared/navigation/services/sequence-encoder";
  import {
    createAnimationPanelState,
    type PlaybackMode,
  } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import { setAnimationPlaybackRef } from "$lib/shared/coordinators/animation-playback-ref.svelte";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import {
    createEffectsConfigState,
    loadPersistedEffectsConfig,
  } from "$lib/shared/effects/state/effects-config-state.svelte";
  import { setEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import {
    createViewerUrlSession,
    setViewerUrlSessionContext,
  } from "../services/viewer-url-session";
  import {
    captureT3Slice,
    seedFromT3Slice,
    persistedT3SliceFromStorage,
    unmountedT3SliceSource,
    type T3SlicePayload,
  } from "../services/viewer-url-slices/t3-slice";
  import {
    captureTnSlice,
    seedFromTnSlice,
    persistedTnSliceFromStorage,
    type TnSlicePayload,
  } from "../services/viewer-url-slices/tn-slice";
  import { capturePsSlice } from "../services/viewer-url-slices/ps-slice";
  import { loadTunnelViewState } from "$lib/shared/sequence-viewer/tunnel/tunnel-view-state";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import {
    captureFxSlice,
    seedFromFxSlice,
    type FxSlicePayload,
  } from "../services/viewer-url-slices/fx-slice";
  import {
    captureAnSlice,
    seedFromAnSlice,
    type AnSlicePayload,
    type AnSliceSeed,
  } from "../services/viewer-url-slices/an-slice";
  import {
    captureExSlice,
    seedFromExSlice,
    type ExSlicePayload,
  } from "../services/viewer-url-slices/ex-slice";
  import {
    captureCdSlice,
    seedFromCdSlice,
    type CdSlicePayload,
  } from "../services/viewer-url-slices/cd-slice";
  import type { ExportOptionsState } from "$lib/shared/animation-panel/state/export-options-state.svelte";
  import type { ImageCompositionSettings } from "$lib/shared/share/state/image-composition-state.svelte";
  import { animationSettings } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import { mutateCurrentUrl } from "$lib/shared/navigation/services/url-state";
  import {
    loadSplitConfig,
    loadViewerMode,
    type SplitConfig,
  } from "../services/viewer-state-persistence";
  import type { EffectType } from "$lib/shared/effects/domain/effects-config";
  import { createScene3DRenderState } from "$lib/shared/3d/scene-features/state/scene-3d-render-state.svelte";
  import { setScene3DRenderContext } from "$lib/shared/3d/scene-features/state/scene-3d-render-context";
  import { lanSyncState } from "$lib/shared/lan-sync/state/lan-sync-state.svelte";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { authDrawerState } from "$lib/shared/auth/state/auth-drawer-state.svelte";
  import { showToast } from "$lib/shared/toast/state/toast-state.svelte";
  import { logShareAction } from "$lib/shared/analytics/services/posthog-activity-logger";
  import {
    getSettings as getAppSettings,
    updateSettings,
  } from "$lib/shared/application/state/app-state.svelte";
  import { handleModuleChange } from "$lib/shared/navigation-coordinator/navigation-coordinator.svelte";
  import { calculateThumbnailAspectRatio } from "$lib/shared/render/services/layout-calculator";
  import { loadViewMode } from "$lib/shared/sequence-viewer/services/sequence-modal-persistence";
  import { legacyViewModeFor } from "$lib/shared/sequence-viewer/services/viewer-modes";
  import { cellPreWarmer } from "$lib/shared/sequence-viewer/services/cell-pre-warmer";
  import { getScanCardCloudProbe } from "$lib/shared/sequence-viewer/scan-card-cloud-context";
  import { isViewerReadyToAutoplay } from "$lib/shared/sequence-viewer/services/viewer-autoplay-readiness";
  import { shouldAutoplayViewer } from "$lib/shared/sequence-viewer/services/viewer-autoplay-policy";
  import { shouldSequenceViewerDeferEscape } from "$lib/shared/sequence-viewer/domain/sequence-viewer-escape-ownership";
  import { createModalAccessibilityHelper } from "$lib/shared/sequence-viewer/services/modal-accessibility-helper.svelte";
  import { saveSequenceHandoff } from "$lib/shared/coordinators/sequence-handoff.svelte";
  import type { LibrarySequence } from "$lib/shared/library/domain/models/library-sequence";
  import { createViewer3DState } from "$lib/shared/3d/state/viewer-3d-state.svelte";
  import { setViewer3DContext } from "$lib/shared/3d/context/viewer-3d-context";
  import { sceneEnvironmentIdForBackground } from "$lib/shared/3d/environments/domain/scene-environment";
  import { viewportFits3D } from "$lib/shared/3d/capabilities/viewport-3d-gate.svelte";
  import { setViewerVisibilityContext } from "../context/viewer-visibility-context";
  import { propFinishState } from "@austencloud/scene-3d";
  import {
    fanAppearanceSignature,
    normalizeFanAppearance,
    type FanAppearance,
  } from "$lib/shared/pictograph/prop/domain/fan-appearance";

  import { createPlaybackController } from "./playback-controller.svelte";
  import { createExportCoordinator } from "./export-coordinator.svelte";
  import { createImageCompositionSync } from "./image-composition-sync.svelte";
  import { createAuthActionQueue } from "./auth-action-queue.svelte";
  import { createFullscreenController } from "$lib/shared/fullscreen/state/fullscreen-controller.svelte";
  import { createLibraryActionHandler } from "../state/library-action-handler.svelte";
  import {
    createViewerState,
    type ViewerMode,
  } from "../state/viewer-state.svelte";
  import { createPracticeViewPrefs } from "$lib/shared/sequence-viewer/state/practice-view-prefs.svelte";
  import { createViewerInteractiveServicesState } from "../state/viewer-interactive-services-state.svelte";
  import { createViewerPlaybackPresentationState } from "../state/viewer-playback-presentation-state.svelte";
  import { createViewerLanSyncState } from "../state/viewer-lan-sync-state.svelte";
  import { createViewerOrchestratorContextState } from "../state/viewer-orchestrator-context-state.svelte";
  import { createViewerEditModeState } from "../state/viewer-edit-mode-state.svelte";
  import { createViewer3DActivationState } from "../state/viewer-3d-activation-state.svelte";
  import { createViewerPropVisibilityState } from "../state/viewer-prop-visibility-state.svelte";
  import { createViewerDestinationActions } from "../services/viewer-destination-actions";
  import { createViewerShareActions } from "../services/viewer-share-actions";
  import {
    calculateSinglePlayDuration,
    hasSameResolvedCardLayout,
    resolveEditingPane,
    resolveExportType,
    resolveSceneBpmIntent,
  } from "../services/viewer-orchestrator-model";

  interface Props {
    sequence: SequenceData | null;
    isMobile: boolean;
    collectionPropType?: PropType | null;
    initialBpm?: number;
    initialPlaybackMode?: PlaybackMode;
    initialStep?: number;
    initialViewMode?: ViewMode;
    onClose: (reason?: "navigate") => void;
    onUrlParamChange?: (key: string, value: string) => void;
    /** Reports tempo changes made through viewer controls. Internal practice
     *  ramp changes stay private so hosts can persist deliberate choices. */
    onBpmChange?: (bpm: number) => void;
    blockClicks?: boolean;
    handPathMode?: boolean;
    /** Force the animation surface and request playback after assets settle. */
    playOnOpen?: boolean;
    /** Holds playback while a native launch surface covers the viewer. */
    playbackReleased?: boolean;
    forceGuest?: boolean;
    initialRenderMode?: "2d" | "3d";
    /** Initial shared-shell surface. Scan uses card so animation work stays out
     *  of the first visible frame; other hosts retain persisted mode. */
    initialViewerMode?: ViewerMode;
    /** Hold animation/LAN services until the host promotes away from card. */
    deferInteractiveStartup?: boolean;
    /** Fires once the card has settled all of its cells. Progressive hosts use
     *  this to reveal the full viewer without exposing placeholder frames. */
    onCardReady?: () => void;
    /** Fires after both the card and animation surface are ready to paint. */
    onReadyForReveal?: () => void;
    initialLeftVisible?: boolean;
    initialRightVisible?: boolean;
    /** Effect to activate on mount (e.g. "trails" for the QR scan landing page).
     *  Defaults to the stored/none config when omitted. */
    initialActiveEffect?: EffectType;
    /** Replay handler for the gated download action (/q scan funnel): runs the
     *  page's export once the guest finishes signing in. Receives the live ctx
     *  because the export needs the playback controller + export options. */
    onGatedDownload?: (ctx: OrchestratorContext) => void;
    /** The sequence's minted short code, when the host has one. Share and
     *  Copy Link then build `/sequence/<code>` instead of the inline-encoded
     *  path, so the state params ride on a short, stable identifier. */
    shortCode?: string | null;
    children: Snippet<[OrchestratorContext]>;
  }

  let {
    sequence: savedSequence,
    isMobile,
    collectionPropType = null,
    initialBpm = 60,
    initialPlaybackMode = "continuous",
    initialStep = 0,
    initialViewMode,
    onClose,
    onUrlParamChange,
    onBpmChange,
    blockClicks = false,
    handPathMode = false,
    playOnOpen = false,
    playbackReleased = true,
    forceGuest = false,
    initialRenderMode,
    initialViewerMode,
    deferInteractiveStartup = false,
    onCardReady,
    onReadyForReveal,
    initialLeftVisible,
    initialRightVisible,
    initialActiveEffect,
    onGatedDownload,
    shortCode = null,
    children,
  }: Props = $props();

  let pathPreview = $state<AnimationPathPolicy | null>(null);
  const sequence = $derived(
    applySequencePathPreview(savedSequence, pathPreview)
  );

  // ── URL state session ────────────────────────────────────────────────────
  // One session per viewer mount. It decodes the inbound link into per-slice
  // seeds, collects live captures from the stores below, and writes the merged
  // snapshot back to the address bar (debounced), so a link always describes
  // what is actually on screen. Slices whose seed differs from the visitor's
  // own saved state mount view-only (`persist:false`) — looking at someone
  // else's link never rewrites the visitor's disk.
  //
  // The viewer-mode headline param is `pane`, not `vm`: printed QR cards own
  // `vm` as the BROWSE view-mode code (`short-code-manager.ts` prints
  // `vm=hsb`; `SequenceViewerPage` decodes it into hand-path mode and per-prop
  // visibility). The session never reads or writes `vm`, so scanned-card links
  // pass through untouched by construction.
  const urlSession = createViewerUrlSession(
    new URLSearchParams(browser ? window.location.search : ""),
    {
      writeParams: (patch) =>
        mutateCurrentUrl((url) => {
          for (const name of patch.remove) {
            url.searchParams.delete(name);
          }
          for (const [name, value] of Object.entries(patch.set)) {
            url.searchParams.set(name, value);
          }
        }),
    }
  );

  interface VwSlicePayload {
    mode?: string;
    split?: { leftPane: string; rightPane: string };
  }

  /**
   * The `vw` payload shape, default-elided. Both sides of the own-link
   * comparison go through this so a seed built from the visitor's own state is
   * byte-identical to what their capture would produce. `full` (Share / Copy
   * Link) emits both fields regardless.
   */
  function viewSlice(
    mode: string,
    split: { leftPane: string; rightPane: string },
    options: { full?: boolean } = {}
  ): VwSlicePayload | null {
    const full = options.full === true;
    const atDefaultMode = !full && mode === "split";
    const atDefaultSplit =
      !full && split.leftPane === "animation" && split.rightPane === "card";
    if (atDefaultMode && atDefaultSplit) return null;
    return {
      ...(atDefaultMode ? {} : { mode }),
      ...(atDefaultSplit
        ? {}
        : { split: { leftPane: split.leftPane, rightPane: split.rightPane } }),
    };
  }

  const modalAnimationState = createAnimationPanelState();
  modalAnimationState.setPlaybackMode(initialPlaybackMode);

  const playback = createPlaybackController({
    modalAnimationState,
    initialBpm: 60,
    initialStep: 0,
  });

  // One-shot tempo seed from "open saved 3D scene" (consumed at init so the
  // initialBpm effect below can't overwrite it afterwards).
  const _sceneBpmIntent: number | null = (() => {
    try {
      const raw = sessionStorage.getItem(SCENE_BPM_INTENT_KEY);
      sessionStorage.removeItem(SCENE_BPM_INTENT_KEY);
      return resolveSceneBpmIntent(raw);
    } catch {
      return null;
    }
  })();

  $effect.pre(() => {
    playback.currentStepLocal = initialStep;
    playback.bpmLocal = _sceneBpmIntent ?? initialBpm;
  });

  // The `t3` slice is MIXED. Its seed is applied here because the environment
  // lives on `viewer3DState`, which only this scope constructs; its CAPTURE is
  // registered inside `Viewer3DCanvas`, the only place that holds both that
  // state and the pane's scene-feature state (see `setViewerUrlSessionContext`
  // below). While the 3D pane is closed nothing is registered, so the session's
  // pass-through keeps whatever `t3` the inbound link carried.
  const firstUseEnvironment = sceneEnvironmentIdForBackground(
    getSettings().backgroundType
  );
  const t3SeedPayload = urlSession.getSeed("t3") as T3SlicePayload | null;
  // Own-link rule in slice space, both sides through the same module: the
  // visitor's disk is read WITHOUT `loadPersistedEnvironment`, whose first-use
  // migration would write the key before any override decision was made.
  const t3Seed =
    t3SeedPayload &&
    urlSession.isOverride(
      "t3",
      persistedT3SliceFromStorage(firstUseEnvironment)
    )
      ? seedFromT3Slice(t3SeedPayload)
      : null;

  const viewer3DState = createViewer3DState(undefined, {
    firstUseEnvironment,
    appDefaultProp: getSettings().leftPropType ?? null,
    ...(t3Seed
      ? {
          viewOnlyEnvironmentId: t3Seed.environmentId,
          viewOnlySceneFeatures: t3Seed.sceneFeatures,
        }
      : {}),
  });
  setViewer3DContext(viewer3DState);
  // Published for viewer-internal hosts whose store is built per pane rather
  // than here — today `Viewer3DCanvas`, which registers the `t3` capture.
  setViewerUrlSessionContext(urlSession);

  // ── Full-snapshot fallbacks (Share / Copy Link only) ─────────────────────
  // Three slices capture from surfaces that may not be mounted when the user
  // copies a link: the 3D pane (`t3`), the tunnel (`tn`), Post Studio (`ps`).
  // The address bar passes their URL seed through untouched, but a shared
  // link must specify every field, so each gets a stand-in that reports what
  // that surface WOULD show if opened: the seed this session was built from
  // (a view-only link), or the sender's own disk/settings (a persistent one).
  // A live capture from the mounted surface still outranks these.
  urlSession.registerFullFallback("t3", (options) => {
    const source = unmountedT3SliceSource(t3Seed, firstUseEnvironment);
    return source ? captureT3Slice(source, options) : null;
  });
  const tnFallbackSeed = urlSession.getSeed("tn") as TnSlicePayload | null;
  urlSession.registerFullFallback("tn", (options) => {
    const source =
      tnFallbackSeed &&
      urlSession.isOverride("tn", persistedTnSliceFromStorage())
        ? seedFromTnSlice(tnFallbackSeed)
        : loadTunnelViewState();
    return captureTnSlice(source, options);
  });
  urlSession.registerFullFallback("ps", (options) => {
    const propType = getSettings().leftPropType ?? PropType.STAFF;
    return capturePsSlice(
      {
        propType,
        defaultPropType: propType,
        audioMode: "original",
        audioModeTouched: false,
      },
      options
    );
  });

  // AppSettings owns the shared fan appearance. The scene package keeps a
  // legacy default-build adapter for performer inheritance, so synchronize the
  // two without replacing performer-scoped overrides.
  let lastSettingsFanSignature: string | null = null;
  let lastSceneFanSignature: string | null = null;
  $effect(() => {
    const settingsAppearance = normalizeFanAppearance(
      getSettings().fanAppearance
    );
    const sceneAppearance: FanAppearance = {
      build: propFinishState.fanBuild,
      frameColor: propFinishState.fanFrameColor,
      cover: propFinishState.fanCover,
    };
    const settingsSignature = fanAppearanceSignature(settingsAppearance);
    const sceneSignature = fanAppearanceSignature(sceneAppearance);

    if (
      lastSettingsFanSignature === null ||
      settingsSignature !== lastSettingsFanSignature
    ) {
      if (sceneSignature !== settingsSignature) {
        propFinishState.setFanBuild(settingsAppearance.build);
        propFinishState.setFanFrameColor(settingsAppearance.frameColor);
        propFinishState.setFanCover(settingsAppearance.cover);
      }
      lastSettingsFanSignature = settingsSignature;
      lastSceneFanSignature = settingsSignature;
      return;
    }

    if (sceneSignature !== lastSceneFanSignature) {
      lastSceneFanSignature = sceneSignature;
      lastSettingsFanSignature = sceneSignature;
      void updateSettings({ fanAppearance: sceneAppearance });
    }
  });

  function handleFanAppearanceChange(appearance: FanAppearance): void {
    void updateSettings({ fanAppearance: normalizeFanAppearance(appearance) });
  }

  const accessibilityHelper = createModalAccessibilityHelper();

  const exportCoord = createExportCoordinator({
    getPropConfig: () =>
      resolveViewingProps(getAppSettings(), sequence, collectionPropType)
        .config,
    viewer3DState,
    accessibilityHelper,
    // Read lazily at export time: viewerVisibility is created further down and
    // the coordinator is first used after it exists.
    getMotionVisibility: () => ({
      left: viewerVisibility.leftMotion,
      right: viewerVisibility.rightMotion,
    }),
  });
  let resolvedCardAutoLayout = $state<
    | import("$lib/shared/render/services/container-aware-layout").ResolvedAutoLayout
    | null
  >(null);

  function setResolvedCardAutoLayout(
    layout:
      | import("$lib/shared/render/services/container-aware-layout").ResolvedAutoLayout
      | null
  ): void {
    if (hasSameResolvedCardLayout(resolvedCardAutoLayout, layout)) return;
    resolvedCardAutoLayout = layout;
  }

  function getSettings() {
    const settings = getAppSettings();
    return {
      ...settings,
      ...resolveViewingProps(settings, sequence, collectionPropType).config,
    };
  }

  const imgComp = createImageCompositionSync();

  const authQueue = createAuthActionQueue();

  $effect(() => {
    playback.setOnUrlParamChange(onUrlParamChange);
  });

  const vwSeed = urlSession.getSeed("vw") as VwSlicePayload | null;
  // Own-link rule: a link that matches what this visitor's own disk would load
  // is not an override, so their viewer keeps persisting normally.
  const vwIsOverride = urlSession.isOverride(
    "vw",
    viewSlice(
      loadViewerMode({ persist: false }),
      loadSplitConfig({ persist: false })
    )
  );
  const viewerState = createViewerState({
    initialMode: vwSeed?.mode as ViewerMode | undefined,
    initialSplit: vwSeed?.split as SplitConfig | undefined,
    persist: !vwIsOverride,
  });
  // Precedence: an explicit open option beats the URL, which beats localStorage.
  // A programmatic open (`openSequenceOverlay({ initialViewerMode })`, the scan
  // funnel's card-first boot) is a deliberate app action, so it lands last.
  if (initialViewerMode) {
    viewerState.setViewerMode(initialViewerMode);
    viewerState.setExportContext(null);
  }
  // The capture reads the RAW (pre-coercion) mode and split. The address bar
  // rewrites within 400 ms of any change, so capturing the viewport-coerced
  // getters would turn a 3D link into a 2D one the moment it opened on a
  // folded phone, and `wants3D`'s "unfolding re-enters 3D" promise would not
  // survive a reload. The recipient's own viewport gate still coerces at
  // render time, and the own-link comparison above reads raw disk values too.
  urlSession.registerSlice("vw", (options) =>
    viewSlice(viewerState.rawViewerMode, viewerState.rawSplitConfig, options)
  );
  // playOnOpen means "open already moving" - it does NOT choose a surface.
  // It used to call enterExport("animation-export", "animation"), which both
  // forced 2D and PERSISTED it, so one open from Create or from a scanned
  // ?v= code reset the remembered surface back to 2D for every later open.
  // The surface someone last chose is restored by createViewerState above.

  let viewMode = $state<ViewMode>(
    playOnOpen ? legacyViewModeFor(viewerState.viewerMode) : loadViewMode()
  );
  $effect.pre(() => {
    if (initialViewMode) {
      viewMode = initialViewMode;
    }
  });
  const practiceViewPrefs = createPracticeViewPrefs();
  playback.setPracticeViewPrefs(practiceViewPrefs);

  if (viewer3DState.renderMode === "3d" && !viewerState.wants3D) {
    viewerState.setSplitPaneContent("left", "animation-3d");
  }

  const editingPane = $derived.by(() =>
    resolveEditingPane(
      viewerState.viewerMode,
      viewerState.exportContext,
      viewerState.videoUploadOpen
    )
  );

  const exportType = $derived(resolveExportType(editingPane));

  let cellsLoaded = $state(0);
  let totalCells = $state(0);
  let cardReady = $state(false);
  let cardReadyNotified = false;
  let revealReadyNotified = false;
  const cloudBackedScan = getScanCardCloudProbe();

  const interactive = createViewerInteractiveServicesState(
    {
      modalAnimationState,
      playback,
      viewerState,
      cloudBackedScan,
      getCellsLoaded: () => cellsLoaded,
      getTotalCells: () => totalCells,
      getViewMode: () => viewMode,
      getPlaybackReleased: () => playbackReleased,
    },
    {
      getAnimationPlaybackController,
      getHapticFeedback,
      getLanSyncCoordinator,
      initializeLanSync: (coordinator) => lanSyncState.initialize(coordinator),
      hydrateSequence: hydrateSequenceData,
      preWarmSequence: (loadedSequence, priority) =>
        cellPreWarmer.preWarmSequence(loadedSequence, priority),
      setAnimationPlaybackRef,
      isViewerReadyToAutoplay,
      shouldAutoplayViewer,
      getSettings,
    }
  );

  $effect(() => {
    // Reading the reactive getters keeps the effect attached when services
    // arrive after a native transition has already started.
    void playback.isPlayingLocal;
    void interactive.playbackController;
    interactive.syncPlaybackRelease(playbackReleased);
  });
  const presentation = createViewerPlaybackPresentationState({
    modalAnimationState,
    playback,
  });
  const fullscreen = createFullscreenController({
    getHapticService: () => interactive.hapticService,
    announce: (msg, priority) => accessibilityHelper.announce(msg, priority),
  });
  const viewerLanSync = createViewerLanSyncState(
    {
      playback,
      accessibilityHelper,
      getSequence: () => sequence,
      getPlaybackController: () => interactive.playbackController,
      getHapticService: () => interactive.hapticService,
    },
    {
      getPlaybackState: () => lanSyncState.playbackState,
      getIsConnected: () => lanSyncState.isConnected,
      getIsActive: () => lanSyncState.isActive,
      setLocalSequence: (value) => lanSyncState.setLocalSequence(value),
      toggleSync: (sequenceId, sequenceWord, state) =>
        lanSyncState.toggleSync(sequenceId, sequenceWord, state),
      disconnect: () => lanSyncState.disconnect(),
    }
  );

  function handleRenderProgress(loaded: number, total: number) {
    cellsLoaded = loaded;
    totalCells = total;
    const ready = total > 0 && loaded >= total;
    cardReady = ready;
    if (ready && !cardReadyNotified) {
      cardReadyNotified = true;
      queueMicrotask(() => onCardReady?.());
    }
  }

  $effect(() => {
    const animationSettled =
      interactive.animationServicesReady &&
      !interactive.animationLoading &&
      modalAnimationState.sequenceData !== null;
    const animationFailed = modalAnimationState.error !== null;

    if (
      revealReadyNotified ||
      !cardReady ||
      (!animationSettled && !animationFailed)
    ) {
      return;
    }

    revealReadyNotified = true;
    queueMicrotask(() => {
      if (typeof requestAnimationFrame === "undefined") {
        onReadyForReveal?.();
        return;
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => onReadyForReveal?.());
      });
    });
  });

  const propVisibility = createViewerPropVisibilityState(
    {
      imageComposition: imgComp,
      getSequence: () => sequence,
      getHandPathMode: () => handPathMode,
      getCollectionPropType: () => collectionPropType,
      getInitialLeftVisible: () => initialLeftVisible,
      getInitialRightVisible: () => initialRightVisible,
      getAnimationServicesReady: () => interactive.animationServicesReady,
      getHapticService: () => interactive.hapticService,
      onUrlParamChange,
    },
    {
      getSettings,
      updateSettings,
      getSequenceMotionVisibility,
      updateAnimationPropTypes: (leftPropType, rightPropType) =>
        getSequenceAnimationOrchestrator().updatePropTypes(
          leftPropType,
          rightPropType
        ),
      setAnimationDarkMode: (darkMode) =>
        getAnimationVisibilityManager().setDarkMode(darkMode),
      encodePropForUrl: encodePropForURL,
    }
  );
  const viewerVisibility = propVisibility.viewerVisibility;
  setViewerVisibilityContext(viewerVisibility);

  // A link's effects seed a view-only store when it differs from what this
  // visitor's own saved config would boot with. The comparison happens in slice
  // space (both sides through `captureFxSlice`) so an own-link round trip is
  // recognised and keeps persisting. This one instance is the context every
  // viewer surface reads — ViewerSplitPane, EffectsSettingsPanel and
  // EffectOrchestrator3D all inherit it, so nothing downstream can construct a
  // persist:true store while a link override is live.
  const fxSeedPayload = urlSession.getSeed("fx") as FxSlicePayload | null;
  // The disk side is read as a plain snapshot, NOT through a throwaway
  // `createEffectsConfigState(persisted, { persist: false })`: that constructor
  // registers the global "effects" undo domain and runs
  // `migrateFromVmStorageOnce`, which a persist:true instance skips for a
  // stored config — a legacy VM-storage entry would make the two sides differ
  // and turn the visitor's own reloaded link view-only.
  const persistedEffectsConfig = loadPersistedEffectsConfig();
  const persistedFxSlice = persistedEffectsConfig
    ? captureFxSlice({ snapshot: () => persistedEffectsConfig })
    : null;
  const effectsConfigState =
    fxSeedPayload && urlSession.isOverride("fx", persistedFxSlice)
      ? createEffectsConfigState(seedFromFxSlice(fxSeedPayload), {
          persist: false,
        })
      : createEffectsConfigState();
  setEffectsConfigContext(effectsConfigState);
  // Wire the instance to the global visibility manager NOW, not on first 2D
  // canvas mount (CanvasSurface line ~228 makes this same assignment). A link
  // that boots straight into the 3D pane never mounts a 2D canvas, and
  // Viewer3DScene reads `visibilityManager.effectsConfigState` for its tip
  // effect map — left null, a seeded fx (e.g. sparkles) renders nowhere in 3D
  // until an unrelated pane switch mounts a canvas. Like CanvasSurface, no
  // teardown: the next mounting surface re-assigns its own context instance.
  getAnimationVisibilityManager().effectsConfigState = effectsConfigState;
  urlSession.registerSlice("fx", (options) =>
    captureFxSlice(effectsConfigState, options)
  );
  // Activate a requested effect on mount (QR scan page asks for "trails").
  // setActiveEffect keeps tipEffectMap in sync so the renderer doesn't filter tips.
  if (initialActiveEffect)
    effectsConfigState.setActiveEffect(initialActiveEffect);

  // Card composition is a third app-global singleton (`getImageCompositionManager()`,
  // borrowed here through `imgComp.imageComposition`), so it takes the same
  // memento. Two ordering rules make this block sit BEFORE the `an` block even
  // though its restore runs after an's:
  //   1. This store observes the animation-visibility manager's dark mode and
  //      persists on every change — to localStorage AND, for a signed-in
  //      visitor, their account. An `an` override applies the sender's dark
  //      mode, so unless this store is already suspended when that happens, the
  //      sender's preference lands in the recipient's account. That is why the
  //      suspension covers an `an` override too, not only a `cd` one.
  //   2. On close the reverse: `an` restores first (firing that observer once
  //      more) while this store is still suspended, then this store restores its
  //      own snapshot and resumes.
  // Its fields are `$state`, so the live-sync effect below tracks them without
  // the manual observer an's plain-class visibility manager needs.
  const compositionStore = imgComp.imageComposition;
  /** Matches the card: `effectiveSequence?.steps?.length ?? 0`. */
  function cardStepCount(): number {
    return (modalAnimationState.sequenceData ?? sequence)?.steps?.length ?? 0;
  }
  const cdSeedPayload = urlSession.getSeed("cd") as CdSlicePayload | null;
  // Own-link rule in slice space, both sides through `captureCdSlice`.
  const cdIsOverride = Boolean(
    cdSeedPayload &&
    urlSession.isOverride(
      "cd",
      captureCdSlice(compositionStore, cardStepCount())
    )
  );

  // The 2D animation stores are app-global singletons read directly by ~7 viewer
  // files and 2 services, with no injection seam short of the AnimationScope
  // refactor. So a link BORROWS them (memento) instead of constructing a
  // view-only instance the way fx does: snapshot -> suspend persistence -> apply
  // the seed -> every consumer renders it by construction (dark mode included,
  // because suspension does not disable the store's theme sync the way
  // `ephemeral` would) -> on close, restore the snapshot while still suspended,
  // then resume. The recipient's disk is never written, and their tweaks during
  // the session stay session-local.
  const anStores = {
    settings: animationSettings,
    visibility: getAnimationVisibilityManager(),
  };
  const anSeedPayload = urlSession.getSeed("an") as AnSlicePayload | null;
  // Own-link rule, in slice space: a link matching what this visitor's own
  // stores already hold is not an override, so nothing is borrowed or restored.
  let anRestore: AnSliceSeed | null =
    anSeedPayload && urlSession.isOverride("an", captureAnSlice(anStores))
      ? {
          settings: anStores.settings.snapshot(),
          visibility: anStores.visibility.snapshot(),
        }
      : null;
  // Borrow the card store before `an` moves dark mode (see rule 1 above).
  let cdRestore: ImageCompositionSettings | null =
    cdIsOverride || anRestore ? compositionStore.getSettings() : null;
  if (cdRestore) compositionStore.setPersistenceSuspended(true);
  if (anRestore) {
    anStores.settings.setPersistenceSuspended(true);
    anStores.visibility.setPersistenceSuspended(true);
    const anSeed = seedFromAnSlice(anSeedPayload!);
    anStores.settings.replaceAll(anSeed.settings);
    anStores.visibility.replaceAll(anSeed.visibility);
  }
  const pathDefaults = {
    pathShape: anStores.visibility.snapshot().pathShape,
    motionAwarePaths: anStores.visibility.snapshot().motionAwarePaths,
  };
  const syncPathPreview = () => {
    const next = anStores.visibility.getPathSession()?.applied ?? null;
    if (
      next?.pathShape !== pathPreview?.pathShape ||
      next?.motionAwarePaths !== pathPreview?.motionAwarePaths
    ) {
      pathPreview = next;
    }
  };
  anStores.visibility.registerObserver(syncPathPreview);
  let firstPathSession = true;
  $effect.pre(() => {
    const original = savedSequence;
    return untrack(() => {
      const close = anStores.visibility.beginPathSession(
        savedSequencePathPolicy(original, pathDefaults),
        countPathOverrides(original)
      );
      if (firstPathSession && anSeedPayload?.pathPreview) {
        anStores.visibility.setPathPolicy(pathDefaults);
      }
      firstPathSession = false;
      return close;
    });
  });
  // Seeded after `an`, and against the store's CURRENT state rather than the
  // restore snapshot, so the excluded dark mode is the link's (already mirrored
  // from the visibility manager) instead of the visitor's.
  if (cdIsOverride) {
    compositionStore.replaceAll(
      seedFromCdSlice(
        cdSeedPayload!,
        cardStepCount(),
        compositionStore.getSettings()
      )
    );
  }
  const unregisterCdSlice = urlSession.registerSlice("cd", (options) =>
    captureCdSlice(compositionStore, cardStepCount(), options)
  );
  urlSession.registerSlice("an", (options) =>
    captureAnSlice(anStores, options)
  );
  // The visibility manager is a plain class, not runes, so the live-sync effect
  // below cannot see its changes. Its own observer API closes that gap.
  const anVisibilityObserver = () => urlSession.scheduleUrlWrite();
  anStores.visibility.registerObserver(anVisibilityObserver);

  // Export options are another app-global singleton (`getExportOptionsState()`,
  // borrowed here via `exportCoord.exportOptions` — same instance ~8 files call
  // directly with no injection seam), so a link borrows it the same way as the
  // 2D animation stores above: snapshot -> suspend -> apply seed -> (on close)
  // restore -> resume. Its fields are plain `$state`, so the live-sync effect
  // below tracks it without a manual observer the way an's visibility class needs.
  const exportOptionsStore = exportCoord.exportOptions;
  const exSeedPayload = urlSession.getSeed("ex") as ExSlicePayload | null;
  let exRestore: ExportOptionsState | null =
    exSeedPayload &&
    urlSession.isOverride("ex", captureExSlice(exportOptionsStore))
      ? exportOptionsStore.snapshot()
      : null;
  if (exRestore) {
    exportOptionsStore.setPersistenceSuspended(true);
    exportOptionsStore.replaceAll(seedFromExSlice(exSeedPayload!));
  }
  const unregisterExSlice = urlSession.registerSlice("ex", (options) =>
    captureExSlice(exportOptionsStore, options)
  );

  const scene3DRenderState = createScene3DRenderState();
  setScene3DRenderContext(scene3DRenderState);

  const effectiveSequence = $derived(
    modalAnimationState.sequenceData ?? sequence
  );

  const singlePlayDuration = $derived(
    calculateSinglePlayDuration(effectiveSequence, playback.bpmLocal)
  );

  const isOwned = $derived(
    !!sequence?.ownerId &&
      !!authState.user?.uid &&
      sequence.ownerId === authState.user.uid
  );

  const libraryActions = createLibraryActionHandler({
    getSequence: () => sequence,
    getIsOwned: () => isOwned,
    getLeftPropType: () => getSettings().leftPropType,
    getRightPropType: () => getSettings().rightPropType,
    getCatDogModeEnabled: () => getSettings().catDogMode,
    getHapticService: () => interactive.hapticService,
    onDeleteSuccess: () => handleClose(),
  });

  setViewerPathContext({
    get sequence() {
      return sequence;
    },
    get canSave() {
      return isOwned && libraryActions.isOwnedLibraryRecord;
    },
    get saving() {
      return libraryActions.isSaving;
    },
    save: async () => {
      const policy = anStores.visibility.getPathPolicy();
      const id = savedSequence?.id;
      if ((await libraryActions.savePaths()) && savedSequence?.id === id) {
        anStores.visibility.acceptSavedPaths(policy);
      }
    },
  });

  const isPublished = $derived(
    (sequence as LibrarySequence | null)?.visibility === "public"
  );

  $effect(() => {
    libraryActions.syncSavedState(savedSequence);
  });
  $effect(() => {
    libraryActions.syncFavoriteState(savedSequence);
  });

  const previewAspectRatio = $derived.by(() => {
    if (!sequence?.steps?.length) return 1;
    const stepCount = sequence.steps.length;
    return calculateThumbnailAspectRatio(stepCount, {
      includeStartPosition: imgComp.imgShowStartPos,
      hasHeader: imgComp.imgShowWord,
      hasFooter: imgComp.imgShowNotes,
    });
  });

  const fullscreenStackVertical = $derived(previewAspectRatio > 1.3);

  createViewer3DActivationState(
    {
      viewer3DState,
      viewerState,
      getSequence: () => sequence,
      getInitialRenderMode: () => initialRenderMode,
      onUrlParamChange,
    },
    {
      viewportFits3D,
    }
  );

  const editMode = createViewerEditModeState({
    viewerState,
    playback,
    interactive,
    exportCoordinator: exportCoord,
    modalAnimationState,
    accessibilityHelper,
    getEditingPane: () => editingPane,
    getEffectiveSequence: () => effectiveSequence,
    getIsHandPath: () => propVisibility.isHandPath,
    getResolvedCardAutoLayout: () => resolvedCardAutoLayout,
  });

  let keydownCleanup: (() => void) | null = null;
  let imageCompositionCleanup: (() => void) | null = null;

  onMount(() => {
    authQueue.bootstrapFromUrl();

    window.addEventListener("keydown", handleKeydown, { capture: true });
    keydownCleanup = () =>
      window.removeEventListener("keydown", handleKeydown, { capture: true });

    imageCompositionCleanup = imgComp.registerObserver();

    playback.registerVisibilityObserver();

    if (!deferInteractiveStartup) interactive.ensureInteractiveServices();
  });

  // Live sync. `captureNow()` reads every registered slice's reactive state, so
  // this effect re-runs whenever any of them changes; the session owns the
  // debounce, and `mutateCurrentUrl` no-ops when nothing actually moved.
  $effect(() => {
    void urlSession.captureNow();
    urlSession.scheduleUrlWrite();
  });

  onDestroy(() => {
    anStores.visibility.unregisterObserver(syncPathPreview);
    libraryActions.finishPropChoice(false);
    anStores.visibility.unregisterObserver(anVisibilityObserver);
    // Restore FIRST, while writes are still suppressed, then resume — so the
    // borrowed globals go back to the visitor's own state without the link
    // session ever reaching disk.
    if (anRestore) {
      anStores.settings.replaceAll(anRestore.settings);
      anStores.visibility.replaceAll(anRestore.visibility, true);
      anStores.settings.setPersistenceSuspended(false);
      anStores.visibility.setPersistenceSuspended(false);
      anRestore = null;
    }
    unregisterExSlice();
    if (exRestore) {
      exportOptionsStore.replaceAll(exRestore);
      exportOptionsStore.setPersistenceSuspended(false);
      exRestore = null;
    }
    // After `an` above, so the dark-mode observer's last write is still
    // suppressed when it fires.
    unregisterCdSlice();
    if (cdRestore) {
      compositionStore.replaceAll(cdRestore);
      compositionStore.setPersistenceSuspended(false);
      cdRestore = null;
    }
    urlSession.dispose();
    interactive.clearAutoplayTimer();
    playback.stopPracticeIfActive();
    keydownCleanup?.();
    imageCompositionCleanup?.();
    playback.dispose();
    modalAnimationState.dispose();
    exportCoord.dispose();
    viewer3DState.dispose();
    fullscreen.clearControlsTimeout();
  });

  $effect(() => {
    if (
      sequence &&
      interactive.animationServicesReady &&
      interactive.playbackController
    ) {
      void interactive.initializeAnimation(sequence);
    }
  });

  $effect(() => {
    void lanSyncState.playbackState.timestamp;
    void lanSyncState.isConnected;
    viewerLanSync.applyRemotePlayback();
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      // A focused menu, popover, input, or browser-fullscreen surface owns the
      // first Escape press. Closing the viewer here would skip that local
      // dismissal and unexpectedly navigate away from the sequence.
      if (shouldSequenceViewerDeferEscape(event)) return;

      // Modal and drawer layers are registered on the same window event. Let
      // those handlers claim Escape before the viewer applies its fallback.
      queueMicrotask(() => {
        if (event.defaultPrevented) return;

        if (fullscreen.isFullscreen) {
          fullscreen.exitFullscreen();
        } else {
          handleClose();
        }
      });
      return;
    }

    if (event.key === " " || event.code === "Space") {
      const target = event.target as HTMLElement;
      if (
        target.closest("[data-keyboard-shortcuts-ignore]") ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      interactive.playbackController?.togglePlayback();
      return;
    }
  }

  function handleClose(reason?: "navigate") {
    libraryActions.finishPropChoice(false);
    playback.stopPracticeIfActive();

    if (playback.isPlayingLocal && interactive.playbackController) {
      interactive.playbackController.togglePlayback();
    }
    setAnimationPlaybackRef(null);

    viewerLanSync.disconnect();

    accessibilityHelper.restoreFocus();
    onClose(reason);
  }

  const destinationActions = createViewerDestinationActions(
    {
      playback,
      interactive,
      getSequence: () => sequence,
      getIsAuthenticated: () => authState.isAuthenticated,
      canManageSequenceVideos: () =>
        isOwned || libraryActions.isOwnedLibraryRecord,
      saveSequence: libraryActions.handleSave,
      onClose: handleClose,
      enterVideoUpload: () => editMode.enterEditMode("video-upload"),
    },
    {
      saveSequenceHandoff,
      navigate: goto,
      showToast,
      showAuth: (mode, trigger) => authDrawerState.show(mode, trigger),
      savePendingEditSequence: (editSequence) =>
        localStorage.setItem(
          "tka-pending-edit-sequence",
          JSON.stringify(editSequence)
        ),
      openCreateConstruct: () => handleModuleChange("create", "construct"),
      getReturnPath: () =>
        browser ? window.location.pathname : "/browse/gallery",
    }
  );
  const shareActions = createViewerShareActions(
    {
      getSequence: () => sequence,
      getBpm: () => playback.bpmLocal,
      getDarkMode: () => imgComp.imgDarkMode,
      getHapticService: () => interactive.hapticService,
      // A copied link pins the recipient to every field, defaults included;
      // only the live address bar stays on the diff form.
      getStateParams: () => urlSession.captureNowAsParams({ full: true }),
    },
    {
      getCurrentUrl: () => (browser ? window.location.href : ""),
      buildUrl: (shareSequence, metadata) =>
        generateViewerURL(shareSequence, {
          compress: true,
          metadata,
          shortCode: shortCode ?? undefined,
        }).url,
      getNavigator: () => (typeof navigator === "undefined" ? null : navigator),
      setLocation: (url) => {
        window.location.href = url;
      },
      openWindow: (url) => {
        window.open(url, "_blank");
      },
      showToast,
      logShareAction,
    }
  );

  function handleBpmChange(bpm: number): void {
    playback.handleBpmChange(bpm);
    onBpmChange?.(bpm);
  }

  function handleStepClick(stepIndex: number): void {
    playback.handleStepClick(stepIndex, blockClicks, editingPane);
  }

  function preparePracticeView(): void {
    if (viewerState.viewerMode === "split") return;
    viewerState.exitExport();
    viewerState.setSplitConfig({
      leftPane: "animation",
      rightPane: "card",
    });
    viewerState.setViewerMode("split");
  }

  function handlePracticeStart(): void {
    preparePracticeView();
    playback.handlePracticeStart();
  }

  function enterPracticeMode(): void {
    preparePracticeView();
    playback.enterPracticeMode();
  }

  const contextState = createViewerOrchestratorContextState({
    modalAnimationState,
    playback,
    presentation,
    interactive,
    lanSync: viewerLanSync,
    fullscreen,
    exportCoordinator: exportCoord,
    imageComposition: imgComp,
    libraryActions,
    practiceViewPrefs,
    viewerState,
    viewerVisibility,
    viewer3DState,
    handlers: {
      setResolvedCardAutoLayout,
      onRenderProgress: handleRenderProgress,
      handlePropTypeChange: propVisibility.handlePropTypeChange,
      setPropHand: propVisibility.setPropHand,
      handleCatDogToggle: propVisibility.handleCatDogToggle,
      handleFanAppearanceChange,
      enterEditMode: editMode.enterEditMode,
      exitEditMode: editMode.exitEditMode,
      handleExport: editMode.handleExport,
      handleArtExport: editMode.handleArtExport,
      handleOpenInCompose: destinationActions.handleOpenInCompose,
      handleEdit: destinationActions.handleEdit,
      handleVideoUpload: destinationActions.handleVideoUpload,
      handleShare: shareActions.handleShare,
      handleCopyLink: shareActions.handleCopyLink,
      getShareUrl: shareActions.getShareUrl,
      handleOpenInBrowser: shareActions.handleOpenInBrowser,
      invokeGatedAction: (type, realHandler) =>
        authQueue.invokeGatedAction(type, realHandler, sequence),
      openSignInPrompt: () => authQueue.openSignInSheet("account"),
      handleUnifiedDarkModeToggle: propVisibility.handleUnifiedDarkModeToggle,
      handlePracticeStart,
      enterPracticeMode,
      handleBpmChange,
      handleStepClick,
      handleClose,
    },
    getSequence: () => sequence,
    getEffectiveSequence: () => effectiveSequence,
    getViewMode: () => viewMode,
    getIsMobile: () => isMobile,
    getFullscreenStackVertical: () => fullscreenStackVertical,
    getEditingPane: () => editingPane,
    getExportType: () => exportType,
    getSinglePlayDuration: () => singlePlayDuration,
    getCardReady: () => cardReady,
    getResolvedCardAutoLayout: () => resolvedCardAutoLayout,
    getIsHandPath: () => propVisibility.isHandPath,
    getCollectionPropType: () => collectionPropType,
    getLeftPropType: () => propVisibility.activeLeftProp,
    getRightPropType: () => propVisibility.activeRightProp,
    getCatDogModeEnabled: () => propVisibility.activeCatDog,
    getPropHand: () => propVisibility.propHand,
    getFanAppearance: () => normalizeFanAppearance(getSettings().fanAppearance),
    getIsLoggedIn: () => (forceGuest ? false : authState.isAuthenticated),
    getIsOwned: () => isOwned,
    getIsPublished: () => isPublished,
  });

  $effect(() => {
    authQueue.replayPendingAction({
      handleSave: libraryActions.handleSave,
      handleFavoriteToggle: libraryActions.handleFavoriteToggle,
      handlePublishAction: libraryActions.handlePublishAction,
      handleEdit: destinationActions.handleEdit,
      handleShare: shareActions.handleShare,
      handleDownload: () => onGatedDownload?.(contextState.value),
      handleOpenInBrowser: shareActions.handleOpenInBrowser,
    });
  });
</script>

{@render children(contextState.value)}
{#if libraryActions.saveProps}
  <SavePropDialog
    bind:value={libraryActions.saveProps}
    onSave={() => libraryActions.finishPropChoice(true)}
    onCancel={() => libraryActions.finishPropChoice(false)}
  />
{/if}

<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
  {accessibilityHelper.announcement}
</div>

<!-- The one shared auth surface. AuthModal owns every provider flow (Google,
     Facebook, email/password, magic link) and renders its own contextual copy
     from the `viewer-signin-*` trigger keys, so the viewer holds no auth copy
     or provider code of its own. Lazy so the scan landing doesn't pay for the
     auth bundle until a guest actually hits a gate. Provider sign-in starts
     only when the person chooses a provider inside that modal. -->
{#if authQueue.signInSheetOpen}
  {#await import("$lib/shared/auth/components/AuthModal.svelte") then mod}
    <mod.default
      open={authQueue.signInSheetOpen}
      reason={authQueue.signInTrigger}
      onClose={() => authQueue.closeSignInSheet()}
    />
  {/await}
{/if}

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
