<script lang="ts">
  import { untrack } from "svelte";
  import { getViewerStudioSurfaces } from "$lib/shared/sequence-viewer/context/viewer-studio-surfaces-context";
  import { reparentToInspector } from "$lib/shared/sequence-viewer/components/reparent-to-inspector";
  import { sequencePositionToMediaTime } from "$lib/shared/media-composition/domain/sequence-time-map";
  import { onDestroy } from "svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
  import type { ResolvedAutoLayout } from "$lib/shared/render/services/container-aware-layout";
  import { getExportOptionsState } from "$lib/shared/animation-panel/state/export-options-state.svelte";
  import {
    getEffectsConfigContext,
    setEffectsConfigContext,
  } from "$lib/shared/effects/state/effects-config-context";
  import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import {
    getAnimationVisibilityContext,
    setAnimationVisibilityContext,
  } from "$lib/shared/animation-engine/state/animation-visibility-context";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import { deriveWord } from "$lib/shared/foundation/services/word-deriver";
  import type { SequenceTimeMap } from "$lib/shared/media-composition/domain/sequence-time-map";
  import { createTempoGridTimeMap } from "$lib/shared/media-composition/domain/sequence-time-map";
  import {
    DEFAULT_POST_LAYOUT,
    POST_STUDIO_ROLE,
  } from "$lib/shared/media-composition/domain/post-studio-presets";
  import {
    createMediaCompositionState,
    type CompositionSourceBinding,
  } from "$lib/shared/media-composition/state/media-composition-state.svelte";
  import { setMediaCompositionContext } from "$lib/shared/media-composition/state/media-composition-context";
  import {
    exportPostStudioVideo,
    type PostStudioExportProgress,
  } from "$lib/shared/media-composition/services/post-studio-exporter";
  import { getVideoFileMetadata } from "$lib/shared/video-collaboration/helpers/create-video-from-upload";
  import { getSequenceVideosStore } from "$lib/shared/video-collaboration/state/sequence-videos-store.svelte";
  import { hasDecodableAudioTrack } from "$lib/shared/media-composition/services/media-audio-inspector";
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import { createHandLabeledCard } from "$lib/shared/sequence-viewer/services/hand-labeled-card.svelte";
  import {
    DEFAULT_HAND_LABELING,
    type HandLabeling,
  } from "$lib/shared/video-collaboration/domain/hand-labeling";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { tryGetViewerUrlSessionContext } from "$lib/shared/sequence-viewer/services/viewer-url-session";
  import {
    capturePsSlice,
    persistedPsSlice,
    seedFromPsSlice,
    type PsSlicePayload,
  } from "$lib/shared/sequence-viewer/services/viewer-url-slices/ps-slice";
  import PostStudioActionBar from "./PostStudioActionBar.svelte";
  import PostStudioPreview from "./PostStudioPreview.svelte";
  import PostStudioInspector from "./PostStudioInspector.svelte";
  import PostStudioTransport from "./PostStudioTransport.svelte";
  import PostStudioTimeline from "./PostStudioTimeline.svelte";
  import PostStudioPerformancePicker from "./PostStudioPerformancePicker.svelte";
  import {
    createCatalogPerformanceSelection,
    createPostStudioSequenceRef,
    createUnmappedPerformanceSelection,
    type PostStudioPerformanceSelection,
  } from "./post-studio-performance-selection";
  import PanelGroup from "$lib/shared/panels/PanelGroup.svelte";
  import { withPostStudioPropType } from "./post-studio-prop-render-options";
  import {
    PostStudioArtControllers,
    setPostStudioArtContext,
  } from "./post-studio-art-context.svelte";
  import ExportTakeover from "$lib/shared/video-export/components/ExportTakeover.svelte";
  import { growFade } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";

  type FocusedPanel = "canvas" | "edit" | "timing";

  interface Props {
    /** Retain the draft while its host is hidden, without running playback. */
    active?: boolean;
    sequence: SequenceData;
    cardPreviewUrl: string | null;
    animationPreviewUrl: string | null;
    animationPreviewType?: "video" | "image";
    cardRenderOptions?: Partial<SequenceExportOptions> | null;
    resolvedCardAutoLayout?: ResolvedAutoLayout | null;
    performanceDurationSeconds?: number;
    sequenceTimeMap?: SequenceTimeMap | null;
    isPreparingCard?: boolean;
    isPreparingAnimation?: boolean;
    onRequestAnimation: () => void;
    onExported?: (blob: Blob) => void;
    /**
     * Opens the host's share sheet on the finished render. Only hosts with a
     * sheet pass it (the viewer shell); without it the bar ends at Download.
     */
    onSharePost?: () => void;
    /**
     * The host's share panel is open. Sending owns the tools track, exactly as
     * it owns the shell's inspector track on desktop: the studio shows the post
     * and its transport, and the layer settings, clip lanes and tool tabs wait.
     */
    sharing?: boolean;
  }

  let {
    active = true,
    sequence,
    cardPreviewUrl,
    animationPreviewUrl,
    animationPreviewType = "video",
    cardRenderOptions = null,
    resolvedCardAutoLayout = null,
    performanceDurationSeconds,
    sequenceTimeMap = null,
    isPreparingCard = false,
    isPreparingAnimation = false,
    onRequestAnimation,
    onExported,
    onSharePost,
    sharing = false,
  }: Props = $props();

  const exportOptions = getExportOptionsState();
  const sharedSurfaces = getViewerStudioSurfaces();
  const externalInspector = $derived(
    sharedSurfaces?.externalInspectorTarget ?? null
  );
  const effectsConfig =
    getEffectsConfigContext() ??
    createEffectsConfigState(undefined, { persist: false });
  setEffectsConfigContext(effectsConfig);
  const animationVisibility =
    getAnimationVisibilityContext() ?? getAnimationVisibilityManager();
  setAnimationVisibilityContext(animationVisibility);

  // ps slice: setup-state seed. `PostStudioPane.svelte` mounts this component
  // via `{#if layout.showPostStudio}`, so `tryGetViewerUrlSessionContext()`
  // resolves the same session `SequenceViewerOrchestrator.svelte` publishes
  // to every pane. `persistedPsSlice()` always returns null (no encoded field
  // has a disk-backed form), so `isOverride` degenerates to "any non-null URL
  // payload is an override" — see `ps-slice.ts`'s doc comment, "Own-link rule".
  const viewerUrlSession = tryGetViewerUrlSessionContext();
  const psSeedPayload =
    (viewerUrlSession?.getSeed("ps") as PsSlicePayload | null) ?? null;
  const psSeed =
    psSeedPayload && viewerUrlSession?.isOverride("ps", persistedPsSlice())
      ? seedFromPsSlice(psSeedPayload)
      : null;

  let selectedPropType = $state<PropType>(
    psSeed?.propType ?? settingsService.settings.leftPropType ?? PropType.STAFF
  );
  const synchronizedCardRenderOptions = $derived(
    withPostStudioPropType(cardRenderOptions, selectedPropType)
  );

  let chosenPerformance = $state<PostStudioPerformanceSelection | null>(null);
  let performanceSelectionTouched = false;
  let localPerformanceUrl: string | null = null;
  let performancePickerOpen = $state(false);
  let performanceLibraryError = $state("");
  let focusedPanel = $state<FocusedPanel>("canvas");
  let timingAdvanced = $state(false);
  let performanceHasAudio = $state<boolean | null>(null);
  let audioInspectionVersion = 0;
  let workspaceWidth = $state(0);
  let workspaceHeight = $state(0);
  let workspaceWasAdjusted = $state(false);
  let workspaceSizes = $state([72, 44]);

  /**
   * True when the one-panel-at-a-time layout is showing. It has to mirror the
   * CSS condition that produces it exactly — `@container post-studio
   * (max-width: 37.5rem)` — because it decides which column carries the
   * transport, and a disagreement renders two or none.
   *
   * Only a phone-width studio takes turns. A 9:16 frame needs height, not
   * width, so anything wider (an unfolded Fold, a tablet, a landscape phone)
   * holds the frame column beside the layer settings. The old 70rem and
   * 40rem-tall cut-offs put a 707px Fold behind tabs, which spent a 60px row
   * of them on showing one thing at a time on a screen with room for two.
   */
  const compactWorkspace = $derived(
    !externalInspector && (workspaceWidth === 0 || workspaceWidth <= 600)
  );
  /** Sending shows the post itself, whatever tab was last open. */
  const shownPanel = $derived<FocusedPanel>(sharing ? "canvas" : focusedPanel);

  const sequenceRef = $derived(createPostStudioSequenceRef(sequence));
  const performanceUrl = $derived(
    chosenPerformance?.url ?? sequence.performanceVideoUrl ?? null
  );
  const performanceDuration = $derived(
    chosenPerformance?.duration ?? performanceDurationSeconds
  );
  const resolvedSequenceTimeMap = $derived(
    chosenPerformance ? chosenPerformance.sequenceTimeMap : sequenceTimeMap
  );
  const performanceAlignmentDetail = $derived.by(() => {
    if (!performanceUrl) return null;
    if (chosenPerformance) return chosenPerformance.alignmentDetail;
    if (sequenceTimeMap?.source === "manual") return "Saved manual map";
    if (
      sequenceTimeMap?.source === "audio-detected" ||
      sequenceTimeMap?.source === "motion-detected" ||
      sequenceTimeMap?.source === "hybrid"
    ) {
      return "Assisted candidate";
    }
    return "Unmapped · even timing preview";
  });

  // The shared per-sequence store, not a private read: an upload or a saved
  // step map anywhere else reaches an already-open studio, and a sequence that
  // has videos without a linked URL still finds them.
  const videoLibrary = $derived(
    sequence.id ? getSequenceVideosStore(sequence.id) : null
  );

  $effect(() => {
    const store = videoLibrary;
    if (!store) return;
    void store.load();
  });

  /**
   * The performance to open on: whichever video the sequence links to, else the
   * newest one carrying a timing map. A video with no map would boot the studio
   * into an even-timing preview, which looks synced for about a second.
   */
  const libraryPerformance = $derived.by(() => {
    const store = videoLibrary;
    if (!store) return null;
    const linkedUrl = sequence.performanceVideoUrl;
    const linked = linkedUrl
      ? store.videos.find((video) => video.videoUrl === linkedUrl)
      : undefined;
    return linked ?? store.videos.find((video) => video.beatMap) ?? null;
  });

  $effect(() => {
    const video = libraryPerformance;
    const ref = sequenceRef;
    performanceLibraryError = videoLibrary?.error
      ? "Saved timing could not be checked. This preview is using even timing."
      : "";
    if (!video || performanceSelectionTouched) return;
    chosenPerformance = createCatalogPerformanceSelection(video, ref);
  });

  /**
   * The frame column's floor. Below the 70rem desktop tier it is sized to a
   * 9:16 frame over the transport rather than to a desktop canvas: a 480px
   * floor on a 707px Fold would leave the layer settings 219px, under their
   * own 320px floor.
   */
  function workspaceCanvasFloor(width: number): number {
    if (width >= 1680) return 640;
    return width > 1120 ? 480 : 280;
  }

  $effect(() => {
    const width = workspaceWidth;
    const height = workspaceHeight;
    if (workspaceWasAdjusted || width <= 0) return;

    const available = Math.max(0, width - 8);

    // The 9:16 frame is height-bound, so the canvas column has an appetite, not
    // an appetite for everything: past `frame + matting` every further pixel is
    // black rail. Size it to what the frame can actually use at this height and
    // hand the surplus to the inspector, which does grow into it (more effect
    // columns rather than a wider gutter). The reverse split gave the canvas
    // 1123px to hold a 395px frame.
    const frame = height > 0 ? (height - 44) * 0.5625 : 480;
    const canvasFloor = workspaceCanvasFloor(width);
    const inspectorFloor = width >= 1680 ? 720 : 320;
    const inspectorCap = width >= 2600 ? 1600 : 1280;
    // Matting around the frame is the stage and it should be generous, but past
    // roughly twice the frame's width it stops reading as a stage and starts
    // reading as black rail. Everything beyond that goes to the inspector,
    // which answers extra width with more columns rather than a wider gutter.
    // A fixed 900px inspector floor used to pin this: at 1920 it left the
    // canvas 943px to hold a 447px frame, so half the column was rail.
    const inspector = Math.min(
      inspectorCap,
      Math.max(inspectorFloor, available * 0.3, available - (frame * 2.2 + 48))
    );
    const canvas = Math.max(canvasFloor, available - inspector);
    workspaceSizes = [canvas, Math.max(inspectorFloor, available - canvas)];
  });

  const bindings = $derived.by((): CompositionSourceBinding[] => [
    {
      roleKey: POST_STUDIO_ROLE.performance,
      kind: "video",
      label: "Performance",
      previewUrl: performanceUrl,
      previewType: "video",
      renderMode: "external-media",
      durationSeconds: performanceDuration,
      hasAudio: performanceHasAudio === true,
      status: performanceUrl ? "ready" : "missing",
      missingMessage: "Choose a performance video",
    },
    {
      roleKey: POST_STUDIO_ROLE.animation,
      kind: "sequence-animation",
      label: "Animation",
      previewUrl: animationPreviewUrl,
      previewType: animationPreviewType,
      renderMode: "sequence-animation",
      status:
        sequence.steps.length > 0
          ? "ready"
          : animationPreviewUrl
            ? "ready"
            : isPreparingAnimation
              ? "preparing"
              : "missing",
      missingMessage: "No sequence motion",
    },
    {
      roleKey: POST_STUDIO_ROLE.card,
      kind: "choreo-card",
      label: "Choreo card",
      previewUrl: cardPreviewUrl,
      previewType: "image",
      renderMode: "choreo-card",
      status:
        sequence.steps.length > 0
          ? "ready"
          : cardPreviewUrl
            ? "ready"
            : isPreparingCard
              ? "preparing"
              : "missing",
      missingMessage: "Card preview unavailable",
    },
    // Sequence-derived sources need nothing chosen. The sequence is already
    // open — asking "click to choose a source" for a tunnel or a mandala is
    // asking for the thing the studio was handed on the way in.
    {
      roleKey: POST_STUDIO_ROLE.tunnel,
      kind: "tunnel",
      label: "Tunnel",
      previewUrl: null,
      renderMode: "tunnel",
      status: sequence.steps.length > 0 ? "ready" : "missing",
      missingMessage: "No sequence motion",
    },
    {
      roleKey: POST_STUDIO_ROLE.mandala,
      kind: "mandala",
      label: "Mandala",
      previewUrl: null,
      renderMode: "mandala",
      status: sequence.steps.length > 0 ? "ready" : "missing",
      missingMessage: "No sequence motion",
    },
    {
      roleKey: POST_STUDIO_ROLE.scene3d,
      kind: "scene-3d",
      label: "3D view",
      previewUrl: null,
      renderMode: "scene-3d",
      // The 3D scene needs a context installed before mount, a performer, and
      // an async feature gate — none of which the preview slot builds yet.
      // Say that, rather than implying a file is missing.
      status: "missing",
      missingMessage: "3D preview is not wired up yet",
    },
  ]);

  // One starting arrangement, not a menu of four. A post is a top slot and a
  // bottom slot, and both are picked in the preview — a template list is a
  // second way to say the same thing, and a worse one, since it can only offer
  // the pairings someone thought to enumerate.
  const composition = createMediaCompositionState({
    presets: [DEFAULT_POST_LAYOUT],
    initialPresetId: DEFAULT_POST_LAYOUT.id,
    getBindings: () => bindings,
    getSequenceSteps: () => sequence.steps,
    getSequenceTimeMap: (durationSeconds) =>
      resolvedSequenceTimeMap ??
      createTempoGridTimeMap({
        sequenceRef,
        mediaSourceId:
          chosenPerformance?.id ??
          (performanceUrl
            ? `performance:${sequence.id}`
            : `animation:${sequence.id}`),
        mediaDurationSeconds: durationSeconds,
        motionDurations: sequence.steps.map((step) => step.duration ?? 1),
      }),
    requestSource: (roleKey) => {
      if (roleKey === POST_STUDIO_ROLE.performance) {
        performancePickerOpen = true;
        return;
      }
      if (roleKey === POST_STUDIO_ROLE.animation) onRequestAnimation();
    },
  });
  setMediaCompositionContext(composition);

  // The default arrangement is animation over card, because that is the one
  // every sequence can draw. A sequence that HAS mapped footage has something
  // better to open on, and it resolves a moment after mount rather than in time
  // to seed the preset — so the top slot is swapped once, on arrival, and never
  // again. Anything the user does to the slots afterwards stands.
  let bootedToPerformance = false;
  $effect(() => {
    if (bootedToPerformance || performanceSelectionTouched) return;
    if (!libraryPerformance?.beatMap) return;
    bootedToPerformance = true;
    composition.setSlotSource("top", POST_STUDIO_ROLE.performance);
  });

  /**
   * The performer works in their own frame and the camera sees it reflected.
   * Beside footage the notation follows the performance's hand labeling:
   * "mirror me" (the default) mirrors the DATA and swaps hands so the color on
   * the viewer's right is their right hand; "as performed" leaves it alone.
   * Data, not pixels, because notation carries letters and glyphs.
   *
   * `createHandLabeledCard` owns the transform, its cache, and the pairing of
   * a drawn sequence with the labeling it was resolved under. With no
   * performance on the canvas there is no labeling and the notation is
   * canonical.
   */
  const handLabeling = $derived<HandLabeling | null>(
    performanceUrl
      ? (chosenPerformance?.handLabeling ?? DEFAULT_HAND_LABELING)
      : null
  );
  const labeledCard = createHandLabeledCard({
    getSequence: () => sequence,
    getLabeling: () => handLabeling,
  });
  const displaySequence = $derived(labeledCard.sequence);
  const handLabelingPending = $derived(labeledCard.pending);

  /**
   * Flip between mirror me and as performed. A catalog video remembers the
   * choice; a local file keeps it for this session only.
   */
  async function toggleHandLabeling(): Promise<void> {
    const current = chosenPerformance;
    if (!current) return;
    const next: HandLabeling =
      current.handLabeling === "mirror-me" ? "as-performed" : "mirror-me";
    chosenPerformance = { ...current, handLabeling: next };
    if (current.videoId && videoLibrary) {
      try {
        await videoLibrary.applyHandLabeling(current.videoId, next);
      } catch {
        // Only undo the flip; a performance picked meanwhile stands.
        if (chosenPerformance?.url === current.url) {
          chosenPerformance = { ...current };
        }
      }
    }
  }

  // Tunnel and mandala controllers live here, above both the slot that draws
  // them and the inspector that steers them, so the Look / Spin / Colors
  // controls change the instance the canvas is reading. Same ownership as
  // ArtPane in the sequence viewer.
  const artControllers = new PostStudioArtControllers({
    getSequence: () => displaySequence,
    getLeftPropType: () => synchronizedCardRenderOptions?.leftPropTypeOverride,
    getRightPropType: () =>
      synchronizedCardRenderOptions?.rightPropTypeOverride,
    pathPolicy: animationVisibility,
  });
  setPostStudioArtContext(artControllers);

  let previewRoot = $state<HTMLElement | null>(null);
  // Seeded as touched when the URL carried an explicit choice: the untouched
  // `$effect` below (line ~486) would otherwise overwrite it the instant
  // `canKeepOriginalAudio` resolves. See `ps-slice.ts`, "Touched-flag diffing".
  let audioMode = $state<"original" | "instagram">(
    psSeed?.audioMode ?? "original"
  );
  let audioModeTouched = $state(psSeed?.audioMode !== undefined);
  let exportProgress = $state<PostStudioExportProgress | null>(null);
  let exportError = $state("");
  let exportedUrl = $state<string | null>(null);
  let exportCancelled = false;

  const performanceBinding = $derived(
    bindings.find(
      (binding) => binding.roleKey === POST_STUDIO_ROLE.performance
    ) ?? null
  );
  const usesPerformance = $derived(
    composition.activePreset.sourceRoles.some(
      (role) => role.key === POST_STUDIO_ROLE.performance
    )
  );
  const canKeepOriginalAudio = $derived(
    usesPerformance &&
      performanceBinding?.status === "ready" &&
      Boolean(performanceBinding.previewUrl) &&
      performanceBinding.hasAudio === true
  );
  const exporting = $derived(exportProgress !== null);
  const exportPercent = $derived(
    exportProgress
      ? Math.round(
          (exportProgress.completedFrames / exportProgress.totalFrames) * 100
        )
      : 0
  );
  const sequenceName = $derived(
    simplifyRepeatedWord(
      sequence.displayName || deriveWord(sequence) || "Vertical post"
    )
  );
  const exportFilename = $derived(
    `${simplifyRepeatedWord(sequenceName || "tka-post")}.mp4`
  );
  const firstMissingSource = $derived(
    composition.missingRequiredRoles[0] ?? null
  );
  const canRender = $derived(
    composition.isReady &&
      previewRoot !== null &&
      !exporting &&
      !sharedSurfaces?.moving
  );

  /**
   * A post is a moving thing, so the studio opens with it moving. It used to
   * open on a still frame behind a play button, which reads as broken — the
   * first question anyone asks of a composition is what it looks like running.
   *
   * Gated on isReady rather than mount so the clock does not start against
   * half-resolved sources, and latched so it happens once: if you pause, it
   * stays paused.
   */
  let autoPlayStarted = $state(false);
  let sharedEntryRevision = 0;
  $effect(() => {
    if (!active || !sharedSurfaces?.active || !composition.isReady) return;
    const entry = sharedSurfaces.entry;
    if (entry.revision === sharedEntryRevision) return;
    sharedEntryRevision = entry.revision;
    untrack(() => {
      if (composition.tempoBpm !== null) composition.setTempoBpm(entry.bpm);
      const map = composition.sequenceTimeMap;
      if (map)
        composition.seek(sequencePositionToMediaTime(map, entry.position));
      if (composition.isPlaying !== entry.playing) composition.togglePlayback();
    });
  });
  $effect(() =>
    sharedSurfaces?.setControls(() => ({
      playing: composition.isPlaying,
      bpm: composition.tempoBpm ?? 60,
      propType: selectedPropType,
      toggle: composition.togglePlayback,
      setBpm: composition.setTempoBpm,
      setProp: setPropType,
    }))
  );
  $effect(() => {
    if (sharedSurfaces || autoPlayStarted || !active) return;
    if (!composition.isReady || composition.isPlaying) return;
    autoPlayStarted = true;
    composition.togglePlayback();
  });

  $effect(() => {
    if (audioModeTouched) return;
    audioMode = canKeepOriginalAudio ? "original" : "instagram";
  });

  $effect(() => {
    const url = performanceUrl;
    const version = ++audioInspectionVersion;
    performanceHasAudio = null;
    if (!url) return;
    void hasDecodableAudioTrack(url).then((hasAudio) => {
      if (version === audioInspectionVersion) performanceHasAudio = hasAudio;
    });
  });

  onDestroy(() => {
    exportCancelled = true;
    if (exportedUrl) URL.revokeObjectURL(exportedUrl);
    if (localPerformanceUrl) URL.revokeObjectURL(localPerformanceUrl);
  });

  // ps slice: live capture. `defaultPropType` is read fresh on every capture
  // (never cached), because it is the LIVE per-session baseline `propType`
  // diffs against — see `ps-slice.ts`, "Diff baseline: per-session live
  // value, not a fixed constant".
  const capturePs = (options: { full?: boolean } = {}) =>
    capturePsSlice(
      {
        propType: selectedPropType,
        defaultPropType:
          settingsService.settings.leftPropType ?? PropType.STAFF,
        audioMode,
        audioModeTouched,
      },
      options
    );

  if (viewerUrlSession) {
    const unregisterPsSlice = viewerUrlSession.registerSlice("ps", capturePs);
    onDestroy(unregisterPsSlice);
  }

  $effect(() => {
    if (!viewerUrlSession) return;
    void capturePs();
    viewerUrlSession.scheduleUrlWrite();
  });

  function setPreviewRoot(root: HTMLElement | null): void {
    previewRoot = root;
  }

  function setAudioMode(mode: "original" | "instagram"): void {
    audioMode = mode;
    audioModeTouched = true;
  }

  function setPropType(propType: PropType): void {
    selectedPropType = propType;
  }

  function fixFirstMissingSource(): void {
    if (!firstMissingSource) return;
    composition.requestSource(firstMissingSource.roleKey);
  }

  function choosePerformance(selection: PostStudioPerformanceSelection): void {
    if (localPerformanceUrl) {
      URL.revokeObjectURL(localPerformanceUrl);
      localPerformanceUrl = null;
    }
    performanceSelectionTouched = true;
    chosenPerformance = selection;
    performanceLibraryError = "";
    performancePickerOpen = false;
    composition.selectRole(POST_STUDIO_ROLE.performance);
    focusedPanel = "edit";
  }

  async function choosePerformanceFile(file: File): Promise<void> {
    if (!file.type.startsWith("video/")) {
      throw new Error("Choose a video file.");
    }
    if (file.size > 500 * 1024 * 1024) {
      throw new Error("Choose a video under 500 MB.");
    }
    const metadata = await getVideoFileMetadata(file);
    if (localPerformanceUrl) URL.revokeObjectURL(localPerformanceUrl);
    localPerformanceUrl = URL.createObjectURL(file);
    performanceSelectionTouched = true;
    chosenPerformance = createUnmappedPerformanceSelection({
      id: `local-performance:${file.name}:${file.size}:${file.lastModified}`,
      url: localPerformanceUrl,
      duration: metadata.duration,
      label: file.name,
    });
    performanceLibraryError = "";
    performancePickerOpen = false;
    composition.selectRole(POST_STUDIO_ROLE.performance);
    focusedPanel = "edit";
  }

  async function renderPost(): Promise<void> {
    if (!previewRoot || !composition.isReady || exporting) return;
    const previousTime = composition.previewSeconds;
    const wasPlaying = composition.isPlaying;
    composition.pause();
    exportCancelled = false;
    exportError = "";
    exportProgress = {
      completedFrames: 0,
      totalFrames: Math.ceil(
        composition.durationSeconds * composition.activePreset.output.frameRate
      ),
      phase: "rendering",
    };

    try {
      const blob = await exportPostStudioVideo({
        root: previewRoot,
        preset: composition.activePreset,
        durationSeconds: composition.durationSeconds,
        getLayers: () => composition.frameLayers,
        seek: composition.seek,
        originalAudioUrl:
          audioMode === "original" && canKeepOriginalAudio
            ? performanceBinding?.previewUrl
            : null,
        originalAudioStartSeconds:
          composition.sourceTrimFor(POST_STUDIO_ROLE.performance)?.inSeconds ??
          0,
        onProgress: (progress) => (exportProgress = progress),
        shouldCancel: () => exportCancelled,
      });
      if (exportedUrl) URL.revokeObjectURL(exportedUrl);
      exportedUrl = URL.createObjectURL(blob);
      onExported?.(blob);
    } catch (error) {
      if (!exportCancelled) {
        console.error("[PostStudio] Export failed:", error);
        exportError =
          error instanceof Error
            ? error.message
            : "The post could not be rendered.";
      }
    } finally {
      exportProgress = null;
      composition.seek(previousTime);
      if (wasPlaying) composition.togglePlayback();
    }
  }

  function cancelExport(): void {
    exportCancelled = true;
  }

  function toggleTimingAdvanced(): void {
    timingAdvanced = !timingAdvanced;
  }

  /**
   * The preview clock. It lives here rather than in the transport because the
   * clip-lane editor is opt-in and the transport is now inside the canvas
   * column: whichever of them a layout happens to be showing, the composition
   * still has to advance. It used to ride in PostStudioTimeline, which meant
   * the frame's motion depended on that component staying mounted.
   */
  let frameRequest: number | null = null;
  let previousFrameTime: number | null = null;

  $effect(() => {
    // The shell reads the outgoing play intent before releasing its loan.
    // Pausing earlier makes effect ordering turn a playing return into a pause.
    if (!active && !sharedSurfaces?.active) composition.pause();
  });

  function tick(now: number): void {
    if (previousFrameTime !== null) {
      composition.advance((now - previousFrameTime) / 1000);
    }
    previousFrameTime = now;
    if (composition.isPlaying) frameRequest = requestAnimationFrame(tick);
  }

  $effect(() => {
    if (!composition.isPlaying) {
      if (frameRequest !== null) cancelAnimationFrame(frameRequest);
      frameRequest = null;
      previousFrameTime = null;
      return;
    }

    frameRequest = requestAnimationFrame(tick);
    return () => {
      if (frameRequest !== null) cancelAnimationFrame(frameRequest);
      frameRequest = null;
      previousFrameTime = null;
    };
  });

  onDestroy(() => {
    if (frameRequest !== null) cancelAnimationFrame(frameRequest);
  });
</script>

<section
  class="post-studio"
  data-mobile-panel={shownPanel}
  data-external-inspector={!!externalInspector}
  data-sharing={sharing}
  aria-label={`Post Studio, ${sequenceName}`}
>
  <PostStudioActionBar
    missingCount={composition.missingRequiredRoles.length}
    missingLabel={firstMissingSource?.label}
    {canRender}
    {exporting}
    {exportProgress}
    {exportPercent}
    {exportedUrl}
    {exportFilename}
    {exportError}
    handLabeling={labeledCard.labeling ?? handLabeling}
    {handLabelingPending}
    onToggleHandLabeling={chosenPerformance ? toggleHandLabeling : undefined}
    {audioMode}
    {canKeepOriginalAudio}
    onAudioModeChange={setAudioMode}
    onFixMissing={fixFirstMissingSource}
    onRender={renderPost}
    onCancelExport={cancelExport}
    {onSharePost}
  />

  {#snippet transport(showAdvancedToggle: boolean, selected = true)}
    <PostStudioTransport
      advanced={timingAdvanced}
      {performanceAlignmentDetail}
      {showAdvancedToggle}
      {selected}
      onMapPerformance={() => (performancePickerOpen = true)}
      onToggleAdvanced={toggleTimingAdvanced}
    />
  {/snippet}

  {#snippet canvasPanel()}
    <main class="canvas-panel" aria-label="Post canvas">
      <div class="canvas-stage">
        <PostStudioPreview
          sequence={displaySequence}
          qrSequence={sequence}
          handLabeling={labeledCard.labeling}
          cardRenderOptions={synchronizedCardRenderOptions}
          durationLabel={`${composition.durationSeconds.toFixed(1)}s`}
          onRootReady={setPreviewRoot}
          onEditRegion={() => {
            if (!externalInspector) focusedPanel = "edit";
          }}
        />
      </div>
      <!-- Docked under the frame it drives, exactly as the 2D animation canvas
           and the 3D viewer dock the same bar under theirs. It is the same
           component; the studio no longer keeps a transport of its own. -->
      {@render transport(
        !compactWorkspace && !sharing,
        !compactWorkspace || shownPanel !== "timing"
      )}
    </main>
  {/snippet}

  {#snippet inspectorPanel()}
    <!-- The rail is the selected layer's, entirely. Sound and the render's own
         error moved onto the action bar: they are properties of the file being
         made, not of the layer, and as a card down here they took ~370px of the
         rail's height — enough that a source with real controls (the mandala
         has six categories) had to scroll inside a porthole. -->
    <aside
      class="inspector-rail"
      class:external={!!externalInspector}
      use:reparentToInspector={externalInspector}
      inert={sharing || undefined}
      aria-label="Selected layer settings"
    >
      <PostStudioInspector
        sequence={displaySequence}
        {exportOptions}
        {selectedPropType}
        onPropChange={setPropType}
        resolvedAutoLayout={resolvedCardAutoLayout}
      />
    </aside>
  {/snippet}

  {#snippet timelinePanel()}
    <div
      class="timeline-dock"
      transition:growFade={{ duration: DURATION.emphasis }}
    >
      <!-- Compact Timing is another destination for the same transport; it
           does not mount a second player while the canvas column is hidden. -->
      {#if compactWorkspace}
        {@render transport(false, shownPanel === "timing")}
      {/if}
      <PostStudioTimeline />
    </div>
  {/snippet}

  {#if performanceLibraryError}
    <div class="studio-notice">
      <p role="alert">
        <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
        {performanceLibraryError}
      </p>
    </div>
  {/if}

  <div class="studio-body">
    <div
      class="workspace"
      bind:clientWidth={workspaceWidth}
      bind:clientHeight={workspaceHeight}
    >
      <PanelGroup
        direction="horizontal"
        panels={externalInspector
          ? [{ id: "canvas", content: canvasPanel, defaultSize: 1 }]
          : [
              {
                id: "canvas",
                content: canvasPanel,
                defaultSize: workspaceSizes[0],
                minSize: workspaceCanvasFloor(workspaceWidth),
                resizable: !sharing,
              },
              {
                id: "inspector",
                content: inspectorPanel,
                defaultSize: workspaceSizes[1],
                minSize: workspaceWidth >= 1680 ? 720 : 320,
                maxSize: workspaceWidth >= 2600 ? 1600 : 1280,
                // Held at zero rather than removed: the settings keep their
                // scroll and drill-in for when the send is done, and the seam
                // travels on PanelGroup's clock alongside the share column.
                fixedSize: sharing ? "0px" : undefined,
              },
            ]}
        bind:sizes={workspaceSizes}
        onSizesChange={() => (workspaceWasAdjusted = true)}
        gap={sharing ? 0 : 8}
        flattened={compactWorkspace}
      />
    </div>

    <!-- Only the clip lanes span the workspace, and only when asked for: they
         are drag targets measured against a ruler, so they want every pixel.
         The transport is not that — it belongs under the frame, which is where
         every other playback surface in the app puts it. -->
    {#if timingAdvanced && !sharing}
      {@render timelinePanel()}
    {/if}
  </div>

  {#if externalInspector}
    {@render inspectorPanel()}
  {/if}

  <!-- The tabs exist only at phone width. Beside an unfolded Fold's share
       column the studio passes through phone width while the column moves, so
       the tabs return after it has settled (a wider studio hides them before
       they show) and leave at once when they were not on screen. -->
  {#if !sharing}
    <nav
      class="focused-nav"
      class:external={!!externalInspector}
      aria-label="Post Studio tools"
      in:growFade={{ duration: DURATION.emphasis, delay: DURATION.emphasis }}
      out:growFade={{ duration: compactWorkspace ? DURATION.emphasis : 0 }}
    >
      <button
        type="button"
        class:active={focusedPanel === "canvas"}
        aria-pressed={focusedPanel === "canvas"}
        onclick={() => (focusedPanel = "canvas")}
      >
        <i class="fa-solid fa-mobile-screen" aria-hidden="true"></i>
        Canvas
      </button>
      <button
        type="button"
        class:active={focusedPanel === "edit"}
        aria-pressed={focusedPanel === "edit"}
        onclick={() => (focusedPanel = "edit")}
      >
        <i class="fa-solid fa-sliders" aria-hidden="true"></i>
        Edit
      </button>
      <button
        type="button"
        class:active={focusedPanel === "timing"}
        aria-pressed={focusedPanel === "timing"}
        onclick={() => {
          timingAdvanced = true;
          focusedPanel = "timing";
        }}
      >
        <i class="fa-solid fa-scissors" aria-hidden="true"></i>
        Timing
      </button>
    </nav>
  {/if}

  <PostStudioPerformancePicker
    open={performancePickerOpen}
    {sequence}
    {sequenceRef}
    bpm={composition.tempoBpm ?? 60}
    currentUrl={performanceUrl}
    onClose={() => (performancePickerOpen = false)}
    onSelect={choosePerformance}
    onChooseFile={choosePerformanceFile}
  />
</section>

<!-- The render reads the live preview DOM frame by frame. Any edit made while
     it runs lands in the middle of the output, so the whole app is locked until
     it finishes or the person cancels. -->
<ExportTakeover
  phase={exporting ? "capturing" : "idle"}
  progress={exportPercent / 100}
  phaseLabel={exportProgress
    ? `Rendering frame ${exportProgress.completedFrames} of ${exportProgress.totalFrames}`
    : "Rendering"}
  onCancel={cancelExport}
  label="Rendering your post"
/>

<style>
  .post-studio {
    --studio-control-height: 2.75rem;
    --studio-body-size: var(--font-size-min);
    --studio-meta-size: var(--font-size-compact);
    --studio-section-title-size: 1.15rem;
    --studio-panel-gap: var(--spacing-lg);
    --studio-panel-padding: var(--spacing-lg);
    --studio-canvas-padding: var(--spacing-md);
    position: relative;
    container-name: post-studio;
    container-type: inline-size;
    /* Flex, not grid rows: the notice strip is conditional, and a fixed
       `auto minmax(0,1fr)` template hands the 1fr to whichever child lands in
       row two, which flips between the body and the notice as errors come and
       go. Flex lets the body claim the remainder regardless of siblings. */
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--theme-panel-bg);
    color: var(--theme-text);
  }

  /* Columns above, timing across the full width below. The scale tokens live
     here rather than on .workspace so the timing bar steps with the columns
     at the 105rem / 180rem tiers instead of staying frozen at base size. */
  .studio-body {
    display: grid;
    flex: 1;
    grid-template-rows: minmax(0, 1fr) auto;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .studio-notice {
    display: grid;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-lg);
    border-bottom: 1px solid var(--theme-stroke);
    background: var(--theme-panel-bg);
  }

  .studio-notice p {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin: 0;
    color: var(--semantic-warning);
    font-size: var(--studio-meta-size);
  }

  .workspace {
    display: flex;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--theme-panel-bg);
  }

  .inspector-rail {
    display: grid;
    grid-area: inspector;
    /* `minmax(0, 1fr)` alone capped the inspector at whatever the delivery
       panel left over and let its contents spill out on top of that panel — the
       inspector is a grid with visible overflow, so nothing clipped or scrolled
       it. The min-content floor lets it size to its controls and hands the
       scrolling to this rail, which already asks for it below. One scroller,
       no overlap. */
    grid-template-rows: minmax(min-content, 1fr);
    align-content: stretch;
    gap: var(--studio-panel-gap);
    min-width: 0;
    min-height: 0;
    padding: var(--studio-panel-padding);
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    border-left: 1px solid var(--theme-stroke);
    background: var(--theme-panel-bg);
    scrollbar-width: none;
  }

  .inspector-rail.external {
    display: grid;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
  }

  .post-studio[data-external-inspector="true"] .focused-nav {
    display: none;
  }
  .post-studio[data-external-inspector="true"] .canvas-panel {
    display: grid;
  }
  .post-studio[data-external-inspector="true"] .studio-body {
    display: grid;
  }
  .post-studio[data-external-inspector="true"] .workspace {
    display: flex;
    height: auto;
  }

  .inspector-rail::-webkit-scrollbar,
  .timeline-dock::-webkit-scrollbar {
    display: none;
  }

  /* No header row: it repeated the 9:16 the preview already states, and its
     reserved control-height band cost the vertical space the 9:16 frame is
     sized from. Format and length now ride the preview's own meta line. */
  /* Stage above, transport docked flush below. The padding moved onto the stage
     so the transport can reach the column's edges the way it does under the 2D
     animation canvas — its own top border is the seam, and a gutter around it
     would read as a floating widget instead of a dock. */
  .canvas-panel {
    grid-area: canvas;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    min-width: 0;
    min-height: 0;
    background: color-mix(
      in srgb,
      var(--theme-card-bg) 48%,
      var(--theme-panel-bg)
    );
  }

  .canvas-stage {
    container-name: post-studio-stage;
    container-type: size;
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 0;
    padding: var(--studio-canvas-padding);
    overflow: hidden;
  }

  .timeline-dock {
    min-width: 0;
    min-height: 0;
    padding: var(--studio-canvas-padding) var(--studio-panel-padding);
    overflow-x: auto;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
    border-top: 1px solid var(--theme-stroke);
    background: var(--theme-panel-bg);
  }

  .focused-nav {
    display: none;
  }

  /* A container query cannot style its own container, so the scale steps land
     on every direct child instead of on `.post-studio`. All of them, not just
     the body: the action bar carries the render button, and leaving it out
     froze that at 12px on a 3840 screen while the columns underneath stepped
     to 20px. */
  @container post-studio (min-width: 105rem) {
    .studio-body,
    .studio-notice,
    .post-studio > :global(.actionbar) {
      --studio-control-height: 3.25rem;
      --studio-body-size: 0.9375rem;
      --studio-meta-size: 0.8125rem;
      --studio-section-title-size: 1.25rem;
      --studio-panel-gap: var(--spacing-xl);
      --studio-panel-padding: var(--spacing-xl);
      --studio-canvas-padding: var(--spacing-lg);
    }
  }

  @container post-studio (min-width: 180rem) {
    .studio-body,
    .studio-notice,
    .post-studio > :global(.actionbar) {
      --studio-control-height: 4.25rem;
      --studio-body-size: 1.25rem;
      --studio-meta-size: 1.0625rem;
      --studio-section-title-size: 1.75rem;
      --studio-panel-gap: 2.75rem;
      --studio-panel-padding: 3rem;
      --studio-canvas-padding: 2.5rem;
    }
  }

  @media (min-width: 70.0625rem) and (max-height: 70rem) {
    .studio-body {
      --studio-panel-gap: 0.75rem;
      --studio-panel-padding: 1rem;
      --studio-canvas-padding: 0.75rem;
    }
  }

  /* Phone width only: one panel at a time, each filling the body. Anything
     wider keeps the frame column beside the settings (see compactWorkspace).
     The timing bar is a sibling of the columns, so the columns step aside
     when timing is showing rather than collapsing to an empty row above it. */
  @container post-studio (max-width: 37.5rem) {
    .studio-body,
    .workspace {
      position: relative;
      display: block;
      min-height: 0;
      overflow: hidden;
    }

    .workspace {
      height: 100%;
    }

    .post-studio[data-mobile-panel="timing"] .workspace {
      display: none;
    }

    .canvas-panel,
    .inspector-rail,
    .timeline-dock {
      display: none;
      width: 100%;
      height: 100%;
      border: 0;
    }

    .post-studio[data-mobile-panel="canvas"] .canvas-panel {
      display: grid;
    }

    .post-studio[data-mobile-panel="edit"] .inspector-rail,
    .post-studio[data-mobile-panel="timing"] .timeline-dock {
      display: grid;
    }

    .inspector-rail,
    .timeline-dock {
      padding: var(--spacing-md);
    }

    .focused-nav {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      border-top: 1px solid var(--theme-stroke);
      background: var(--theme-panel-bg);
    }

    .focused-nav button {
      display: grid;
      place-items: center;
      gap: var(--spacing-xs);
      min-height: 3.75rem;
      padding: var(--spacing-xs);
      border: 0;
      border-top: 2px solid transparent;
      background: transparent;
      color: var(--theme-text-dim);
      font: inherit;
      font-size: var(--font-size-compact);
      cursor: pointer;
    }

    .focused-nav button.active {
      border-top-color: var(--theme-accent);
      color: var(--theme-text);
    }

    .focused-nav button:focus-visible {
      outline: 3px solid var(--theme-accent);
      outline-offset: -4px;
    }
  }

  /* Short screens keep whichever layout the width chose; they only tighten
     it. The tabs (phone width) lay their icon beside the label. */
  @media (max-height: 40rem) {
    .inspector-rail,
    .timeline-dock {
      padding: var(--spacing-sm) var(--spacing-md);
    }

    .focused-nav button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-sm);
      min-height: 3rem;
    }
  }
</style>
