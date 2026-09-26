<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { onDestroy, tick, untrack } from "svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { getViewerStudioSurfaces } from "$lib/shared/sequence-viewer/context/viewer-studio-surfaces-context";
  import { reparentToInspector } from "$lib/shared/sequence-viewer/components/reparent-to-inspector";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import { deriveWord } from "$lib/shared/foundation/services/word-deriver";
  import { getSequenceVideosStore } from "$lib/shared/video-collaboration/state/sequence-videos-store.svelte";
  import { createHandLabeledCard } from "$lib/shared/sequence-viewer/services/hand-labeled-card.svelte";
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
  } from "$lib/shared/media-composition/domain/post-plan-compiler";
  import {
    itemIdFromTextRole,
    textRole,
  } from "$lib/shared/media-composition/domain/post-project-compiler";
  import {
    POST_FRAME_RATE,
    mainItemAt,
    type PostItem,
    type PostVideoItem,
  } from "$lib/shared/media-composition/domain/post-project";
  import {
    moveMainItem,
    moveOverlayItem,
    setTrackFlag,
  } from "$lib/shared/media-composition/domain/post-project-edits";
  import type { StripMode } from "$lib/shared/media-composition/domain/strip-view";
  import type { CompositionSourceBinding } from "$lib/shared/media-composition/state/media-composition-state.svelte";
  import {
    createPostEditorState,
    type CatalogTakeSource,
    type PostEdit,
  } from "$lib/shared/media-composition/state/post-editor-state.svelte";
  import type { PostStudioLayerPainter } from "$lib/shared/media-composition/services/post-studio-layer-painter";
  import { createBeatCarouselPainter } from "$lib/shared/media-composition/services/beat-carousel-painter";
  import { createSequenceStripPainter } from "$lib/shared/media-composition/services/sequence-strip-painter";
  import { createTextItemPainter } from "$lib/shared/media-composition/services/text-item-painter";
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
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import type { PostStudioShareExport } from "../post-studio-share-export";
  import PostTimingStage from "../builder/PostTimingStage.svelte";
  import PostTimingPanel from "../builder/PostTimingPanel.svelte";
  import { createPostTimingSession } from "../builder/post-timing-session.svelte";
  import PostEditorCanvas from "./PostEditorCanvas.svelte";
  import PostEditorToolbar from "./PostEditorToolbar.svelte";
  import PostEditorTransport from "./PostEditorTransport.svelte";
  import PostItemSettings from "./PostItemSettings.svelte";
  import PostSettingsPanel from "./PostSettingsPanel.svelte";
  import PostExportPanel from "./PostExportPanel.svelte";
  import PostTimeline from "./timeline/PostTimeline.svelte";
  import { clampPixelsPerSecond } from "./timeline/post-timeline-geometry";
  import { itemDisplayLabel } from "./post-editor-labels";
  import { readVideoFile, videoFileError } from "./post-editor-files";

  /**
   * One post on one screen, the way a phone video editor works: the preview,
   * the tools, the timeline of clips and layers, and the settings of what is
   * selected. Every part reads the same editor state, so the frame drawn here
   * is the frame the file gets.
   */
  interface Props {
    active: boolean;
    sequence: SequenceData;
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
    getSequence: () => sequence,
    getCatalogVideo: (videoId) =>
      catalog.find((video) => video.videoId === videoId) ?? null,
    hasAnimationOverlay: () => overlayPainter !== null,
  });
  const session = createPostTimingSession(editor);

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
  const labeledCard = createHandLabeledCard({
    getSequence: () => sequence,
    getLabeling: () => handLabeling,
  });
  const displaySequence = $derived(labeledCard.sequence);

  // ---- What each layer draws -----------------------------------------------

  const carouselPainter = $derived(createBeatCarouselPainter(displaySequence));
  const stripPainters = $derived(
    new Map<StripMode, PostStudioLayerPainter>(
      (["arrows", "mandala", "alternate"] as const).map((mode) => [
        mode,
        createSequenceStripPainter({ sequence: displaySequence, mode }),
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

  let overlayVersion = 0;
  $effect(() => {
    const drawn = displaySequence;
    const version = ++overlayVersion;
    void loadAnimationOverlayPainter(drawn)
      .then((painter) => {
        if (version === overlayVersion) overlayPainter = painter;
      })
      .catch((error: unknown) => {
        console.error("[PostStudio] Beat overlay unavailable:", error);
        if (version === overlayVersion) overlayPainter = null;
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
    const takeId = takeIdFromRole(role);
    if (takeId) {
      const take = editor.takes.find((entry) => entry.id === takeId);
      const url = editor.mediaUrl(takeId);
      return {
        roleKey: role,
        kind: "video",
        label: take?.label ?? t("share_studio_deep_take"),
        previewUrl: url,
        previewType: "video",
        renderMode: "external-media",
        ...(take ? { durationSeconds: take.durationSeconds } : {}),
        status: url ? "ready" : "missing",
        missingMessage: t("share_studio_repick_local"),
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
    return painters;
  }

  const labelFor = (item: PostItem) => itemDisplayLabel(item, editor.project);

  // ---- Screen state ----------------------------------------------------------

  let canvasRoot = $state<HTMLElement | null>(null);
  let inspectorElement = $state<HTMLElement | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let readingFile = $state(false);
  let fileError = $state("");
  let lookOpen = $state(false);
  let pixelsPerSecond = $state(60);

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

  function exportFromToolbar(): void {
    // The post's settings hold the progress and the finished file.
    editor.selectedItemId = null;
    void renderPost();
  }

  function pickDeviceVideo(): void {
    if (readingFile) return;
    fileError = "";
    fileInput?.click();
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
      editor.addLocalVideo(file, duration);
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

  function zoomTimeline(factor: number): void {
    pixelsPerSecond = clampPixelsPerSecond(pixelsPerSecond * factor);
  }

  // ---- Keys ----------------------------------------------------------------

  const FRAME_SECONDS = 1 / POST_FRAME_RATE;
  const ZOOM_STEP = 1.25;

  function isTyping(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        Boolean(target.closest("input, textarea, select")))
    );
  }

  /** Controls that answer Space themselves. */
  function isControl(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLElement &&
      Boolean(target.closest("button, a, [role='slider'], [role='radio']"))
    );
  }

  /** Controls that use the arrow keys themselves. */
  function ownsArrows(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLElement &&
      Boolean(
        target.closest(
          "[role='slider'], [role='radio'], [role='radiogroup'], [role='menu'], [role='menuitem'], [role='listbox'], [role='option'], [role='tab'], [role='tablist']"
        )
      )
    );
  }

  /**
   * The editor's keys. On the beat tapper its own keys answer instead (T
   * taps, Space plays the take). A studio the viewer keeps mounted out of
   * sight ignores every key, and so does one that is rendering: the render
   * seeks the post frame by frame, and playback would move the clock between
   * a seek and its capture. Ctrl+Z and Ctrl+Y belong to the app's edit
   * history, which presses the toolbar's Undo and Redo.
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
      if (event.key.toLowerCase() === "d" && !event.shiftKey) {
        event.preventDefault();
        editor.duplicateSelected();
      }
      return;
    }
    switch (event.key) {
      case " ":
        if (event.repeat || isControl(event.target)) return;
        event.preventDefault();
        editor.togglePlayback();
        return;
      case "s":
      case "S":
        if (event.repeat) return;
        event.preventDefault();
        editor.pause();
        editor.splitAtPlayhead();
        return;
      case "Delete":
      case "Backspace":
        if (!editor.selectedItem) return;
        event.preventDefault();
        editor.deleteSelected();
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
        if (!editor.selectedItemId || editor.inGesture) return;
        event.preventDefault();
        editor.selectedItemId = null;
        return;
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
      setProp: onPropChange,
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

  // A control that swaps the settings (Tap beats, Back) leaves with them.
  // Focus follows to the new settings instead of dropping to the page.
  let shownPanel: string | null = null;
  $effect(() => {
    const panel = showTimingStage ? "timing" : "edit";
    const changed = shownPanel !== null && shownPanel !== panel;
    shownPanel = panel;
    if (!changed || !inspectorElement) return;
    const focused = document.activeElement;
    if (!focused || focused === document.body) {
      inspectorElement.focus({ preventScroll: true });
    }
  });

  // A control that changes the selection (Add clip, Back to the post) sits in
  // settings that are about to fade out and hide. Focus moves to the panel
  // before they hide, and Tab then continues into the new settings.
  $effect.pre(() => {
    void editor.selectedItemId;
    untrack(() => {
      const focused = document.activeElement;
      if (
        inspectorElement &&
        focused !== inspectorElement &&
        inspectorElement.contains(focused)
      ) {
        inspectorElement.focus({ preventScroll: true });
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

  function frame(now: number): void {
    if (previousFrameTime !== null) {
      editor.advance((now - previousFrameTime) / 1000);
    }
    previousFrameTime = now;
    if (editor.isPlaying) frameRequest = requestAnimationFrame(frame);
  }

  $effect(() => {
    if (!editor.isPlaying) return;
    frameRequest = requestAnimationFrame(frame);
    return () => {
      if (frameRequest !== null) cancelAnimationFrame(frameRequest);
      frameRequest = null;
      previousFrameTime = null;
    };
  });

  // ---- Render --------------------------------------------------------------

  function nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  async function renderPost(): Promise<boolean> {
    if (exporting || !editor.compiled || editor.durationSeconds <= 0) {
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
      const takeUrls = new Map<string, string>();
      for (const take of editor.takes) {
        const url = editor.mediaUrl(take.id);
        if (url) takeUrls.set(take.id, url);
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
        originalAudioUrl: audioUrl,
        originalAudioStartSeconds: 0,
        onProgress: (progress) => (exportProgress = progress),
        shouldCancel: () => exportCancelled,
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
  });
</script>

<svelte:window onkeydown={handleKey} />

{#snippet lookPanel()}
  <AnimationPanel
    layout="sidebar"
    isExporting={false}
    isPlaying={editor.isPlaying}
    onPlaybackToggle={editor.togglePlayback}
    showTempoControls={false}
    showEffectsPlayback={false}
    {selectedPropType}
    {onPropChange}
    sequence={displaySequence}
  />
{/snippet}

{#snippet exportPanel()}
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
{/snippet}

<!-- The editor owns Space, S, the arrows and Delete, so the viewer's own
     handlers skip it (the app's shortcuts, Shift+P, Ctrl+Z and the rest,
     still reach it); tabindex keeps a click inside it from sending focus back
     to the page. Undo and Redo on its toolbar answer the app's history keys
     while focus is inside it. -->
<section
  class="post-editor"
  tabindex="-1"
  data-viewer-keys-ignore
  data-edit-history-shortcut-scope
  data-external-inspector={!!externalInspector}
  data-sharing={sharing}
  data-mode={showTimingStage ? "timing" : "edit"}
  aria-label={t("post_editor_label", { name: sequenceName })}
>
  <div class="layout">
    {#if showTimingStage}
      <div class="stage timing">
        <PostTimingStage
          {session}
          squarePainter={stripPainters.get("arrows") ?? null}
        />
      </div>
    {:else}
      <div class="stage">
        <div class="preview-frame">
          <div
            class="preview-host"
            inert={!!previewTarget}
            use:reparentToInspector={previewTarget}
          >
            <div class="canvas-slot">
              <PostEditorCanvas
                {editor}
                sequence={displaySequence}
                qrSequence={sequence}
                {bindingFor}
                {labelFor}
                {cardRenderOptions}
                handLabeling={labeledCard.labeling}
                showStripGuide={editor.selectedItem?.kind === "video"}
                interactive={!exporting && !sharing && !previewTarget}
                bind:root={canvasRoot}
              />
            </div>
          </div>
        </div>
        <PostEditorTransport {editor} disabled={exporting} />
      </div>

      <div class="toolbar-slot" inert={sharing || undefined}>
        <PostEditorToolbar
          {editor}
          {catalog}
          {canTapBeats}
          canExport={canRender}
          {exporting}
          onAddDeviceVideo={pickDeviceVideo}
          onTapBeats={tapBeatsHere}
          onTutorial={applyTutorial}
          onExport={exportFromToolbar}
        />
        {#if fileError}
          <p class="file-error" role="alert">{fileError}</p>
        {/if}
      </div>

      <div class="timeline-slot" inert={sharing || exporting || undefined}>
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
          onMoveMain={(itemId, toIndex) =>
            applyMove((project, context) =>
              moveMainItem(project, itemId, toIndex, context)
            )}
          onMoveOverlay={(itemId, start, trackIndex) =>
            applyMove((project, context) =>
              moveOverlayItem(project, itemId, { start, trackIndex }, context)
            )}
          onTrackFlag={(trackId, flag, value) =>
            editor.edit((project, context) =>
              setTrackFlag(project, trackId, flag, value, context)
            )}
          onAddVideo={pickDeviceVideo}
          bind:pixelsPerSecond
        />
      </div>
    {/if}

    <aside
      class="inspector"
      tabindex="-1"
      data-viewer-keys-ignore
      class:external={!!externalInspector}
      bind:this={inspectorElement}
      use:reparentToInspector={externalInspector}
      inert={sharing || undefined}
      aria-label={t("post_editor_settings")}
    >
      {#if showTimingStage}
        <div class="timing-settings">
          <div class="row">
            <PanelButton onclick={session.exit}>
              <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
              {t("post_editor_back_to_editing")}
            </PanelButton>
          </div>
          <PostTimingPanel {session} />
        </div>
      {:else}
        <Crossfade key={editor.selectedItemId ?? "post"} animateHeight>
          {#if editor.selectedItem}
            <div class="item-panel">
              <div class="row">
                <PanelButton onclick={() => (editor.selectedItemId = null)}>
                  <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
                  {t("post_editor_back_to_post")}
                </PanelButton>
              </div>
              <PostItemSettings
                {editor}
                item={editor.selectedItem}
                onTapBeats={openBeats}
              />
            </div>
          {:else}
            <PostSettingsPanel
              {editor}
              {catalog}
              catalogLoading={videoLibrary?.loading ?? false}
              catalogError={videoLibrary?.error ?? ""}
              busy={readingFile}
              onAddDeviceVideo={pickDeviceVideo}
              onTapBeats={openTakeBeats}
              onTutorial={applyTutorial}
              {lookOpen}
              onLookToggle={() => (lookOpen = !lookOpen)}
              look={lookPanel}
              output={exportPanel}
            />
          {/if}
        </Crossfade>
      {/if}
    </aside>
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
</section>

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

<style>
  .post-editor:focus,
  .inspector:focus {
    outline: none;
  }

  .post-editor {
    /* The tools row, the ruler, the main track and two layers. */
    --post-timeline-height: 17.5rem;
    container: post-editor / inline-size;
    width: 100%;
    min-width: 0;
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    background: var(--theme-panel-bg, transparent);
  }

  /* A phone stacks the parts in the order they are used: the preview, the
     tools, the timeline, then the settings of what is selected. The settings
     come last so a change of selection never moves the timeline. */
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "stage"
      "toolbar"
      "timeline"
      "inspector";
    align-content: start;
    gap: 0.75rem;
    min-height: 100%;
    padding: 0.75rem;
    box-sizing: border-box;
  }

  .stage {
    grid-area: stage;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 0.5rem;
    min-width: 0;
    min-height: 0;
  }

  .stage.timing {
    display: block;
  }

  .post-editor[data-mode="timing"] .layout {
    grid-template-areas:
      "stage"
      "inspector";
  }

  /* The phone's preview takes most of the screen height, never more than a
     full-width frame would need. */
  .preview-frame {
    height: min(60dvh, calc(100cqw * 16 / 9));
    min-height: 0;
  }

  /* The host fills whatever holds it, here or in the share sheet, and the
     frame inside it is the largest 9:16 that fits. */
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
    width: min(100cqw, calc(100cqh * 9 / 16));
  }

  .toolbar-slot {
    grid-area: toolbar;
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }

  .file-error {
    margin: 0;
    color: var(--semantic-warning, #fbbf24);
    font-size: 0.875rem;
  }

  .timeline-slot {
    grid-area: timeline;
    min-width: 0;
    min-height: 0;
  }

  .inspector {
    grid-area: inspector;
    display: grid;
    align-content: start;
    min-width: 0;
  }

  .inspector.external {
    height: 100%;
    padding: 0.75rem;
    overflow-y: auto;
    box-sizing: border-box;
  }

  .item-panel,
  .timing-settings {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .file-input {
    display: none;
  }

  /* On a wide screen the post fills the height: the preview beside its
     settings, the tools and the timeline full width underneath. A short
     window scrolls rather than shrinking the preview to a thumbnail. The
     timeline keeps one height, so a new layer scrolls inside it instead of
     shrinking the preview. */
  @container post-editor (min-width: 56rem) {
    .layout {
      grid-template-columns: minmax(0, 1fr) minmax(20rem, 26rem);
      grid-template-rows: minmax(0, 1fr) auto var(--post-timeline-height);
      grid-template-areas:
        "stage inspector"
        "toolbar toolbar"
        "timeline timeline";
      height: max(100%, 36rem);
      min-height: 0;
    }

    .preview-frame {
      height: auto;
    }

    .inspector:not(.external) {
      min-height: 0;
      overflow-y: auto;
      padding-right: 0.25rem;
    }

    .post-editor[data-mode="timing"] .layout {
      grid-template-rows: minmax(0, 1fr);
      grid-template-areas: "stage inspector";
    }

    .post-editor[data-mode="timing"] .stage {
      min-height: 0;
      overflow-y: auto;
    }
  }

  /* The viewer's side panel holds the settings, so the post takes the full
     width here. */
  @container post-editor (min-width: 36rem) {
    .post-editor[data-external-inspector="true"] .layout {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr) auto var(--post-timeline-height);
      grid-template-areas:
        "stage"
        "toolbar"
        "timeline";
      height: max(100%, 36rem);
      min-height: 0;
    }

    .post-editor[data-external-inspector="true"] .preview-frame {
      height: auto;
    }

    .post-editor[data-external-inspector="true"][data-mode="timing"] .layout {
      grid-template-rows: minmax(0, 1fr);
      grid-template-areas: "stage";
    }
  }

  .post-editor[data-sharing="true"] .inspector:not(.external) {
    display: none;
  }
</style>
