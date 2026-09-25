<script lang="ts">
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
    CAPTIONS_ROLE,
    stripModeFromRole,
    stripRole,
    takeIdFromRole,
  } from "$lib/shared/media-composition/domain/post-plan-compiler";
  import type { StripMode } from "$lib/shared/media-composition/domain/strip-view";
  import type { CompositionSourceBinding } from "$lib/shared/media-composition/state/media-composition-state.svelte";
  import {
    createPostBuilderState,
    POST_BUILDER_STEPS,
    type CatalogTakeSource,
    type PostBuilderStep,
  } from "$lib/shared/media-composition/state/post-builder-state.svelte";
  import type { PostStudioLayerPainter } from "$lib/shared/media-composition/services/post-studio-layer-painter";
  import { createBeatCarouselPainter } from "$lib/shared/media-composition/services/beat-carousel-painter";
  import { createSequenceStripPainter } from "$lib/shared/media-composition/services/sequence-strip-painter";
  import { createCaptionPainter } from "$lib/shared/media-composition/services/caption-painter";
  import { loadAnimationOverlayPainter } from "$lib/shared/media-composition/services/animation-overlay-painter-registry";
  import { buildPostAudioTrack } from "$lib/shared/media-composition/services/post-audio-track";
  import {
    exportPostStudioVideo,
    type PostStudioExportProgress,
  } from "$lib/shared/media-composition/services/post-studio-exporter";
  import AnimationPanel from "$lib/shared/animation-panel/components/AnimationPanel.svelte";
  import ExportTakeover from "$lib/shared/video-export/components/ExportTakeover.svelte";
  import type { PostStudioShareExport } from "../post-studio-share-export";
  import PostBuilderCanvas from "./PostBuilderCanvas.svelte";
  import PostBuilderTransport from "./PostBuilderTransport.svelte";
  import PostTakesPanel from "./PostTakesPanel.svelte";
  import PostTimingStage from "./PostTimingStage.svelte";
  import PostTimingPanel from "./PostTimingPanel.svelte";
  import PostActsPanel from "./PostActsPanel.svelte";
  import PostCaptionsPanel from "./PostCaptionsPanel.svelte";
  import PostRenderPanel from "./PostRenderPanel.svelte";
  import { createPostTimingSession } from "./post-timing-session.svelte";

  /**
   * One post, built in five steps: the takes, each take's timing, the acts
   * that cut them together, the words over them and the render. Every step
   * reads the same builder, so the frame drawn here is the frame the file
   * gets.
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
    onAudioChange: (audio: "takes" | "silent") => void;
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

  const STEP_LABEL: Record<PostBuilderStep, string> = {
    takes: "Takes",
    timing: "Timing",
    acts: "Acts",
    captions: "Captions",
    render: "Render",
  };

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
        label: video.description?.trim() || "Performance video",
        url: video.videoUrl,
        durationSeconds: video.duration,
        ...(video.beatMap ? { legacyStepMap: video.beatMap } : {}),
      }))
  );

  let overlayPainter = $state.raw<PostStudioLayerPainter | null>(null);

  const builder = createPostBuilderState({
    getSequence: () => sequence,
    getCatalogVideo: (videoId) =>
      catalog.find((video) => video.videoId === videoId) ?? null,
    hasAnimationOverlay: () => overlayPainter !== null,
  });
  const session = createPostTimingSession(builder);

  untrack(() => {
    if (audioSeed && audioSeed !== builder.plan.audio)
      builder.setAudio(audioSeed);
  });

  $effect(() => {
    void catalog;
    untrack(() => builder.attachCatalogTakes());
  });

  $effect(() => {
    onAudioChange(builder.plan.audio);
  });

  /**
   * The performer works in their own frame and the camera sees it reflected,
   * so beside footage the notation follows the take's hand labeling: a
   * catalog video remembers its own, anything else mirrors.
   */
  const handLabeling = $derived.by((): HandLabeling | null => {
    const take = builder.takesInUse[0] ?? builder.plan.takes[0];
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

  const carouselPainter = $derived(createBeatCarouselPainter(displaySequence));
  const stripPainters = $derived(
    new Map<StripMode, PostStudioLayerPainter>(
      (["arrows", "mandala", "alternate"] as const).map((mode) => [
        mode,
        createSequenceStripPainter({ sequence: displaySequence, mode }),
      ])
    )
  );
  const captionPainter = createCaptionPainter(
    () => builder.compiled?.captions ?? []
  );

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
      const take = builder.plan.takes.find((entry) => entry.id === takeId);
      const url = builder.mediaUrl(takeId);
      return {
        roleKey: role,
        kind: "video",
        label: take?.label ?? "Take",
        previewUrl: url,
        previewType: "video",
        renderMode: "external-media",
        ...(take ? { durationSeconds: take.durationSeconds } : {}),
        status: url ? "ready" : "missing",
        missingMessage: "Pick this take's file again",
      };
    }
    const strip = stripModeFromRole(role);
    if (strip) {
      const painter = stripPainters.get(strip);
      return painter ? painted(role, "Moves", painter) : null;
    }
    switch (role) {
      case POST_STUDIO_ROLE.animation:
        return {
          roleKey: role,
          kind: "sequence-animation",
          label: "Animation",
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
        return painted(role, "Beat carousel", carouselPainter);
      case CAPTIONS_ROLE:
        return painted(role, "Captions", captionPainter);
      case ANIMATION_OVERLAY_ROLE:
        return overlayPainter
          ? painted(role, "Beat and letter", overlayPainter)
          : null;
      case POST_STUDIO_ROLE.card:
        return {
          roleKey: role,
          kind: "choreo-card",
          label: "Choreo card",
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
      [CAPTIONS_ROLE, captionPainter],
    ]);
    for (const [mode, painter] of stripPainters) {
      painters.set(stripRole(mode), painter);
    }
    if (overlayPainter) painters.set(ANIMATION_OVERLAY_ROLE, overlayPainter);
    return painters;
  }

  // ---- Steps and layout ------------------------------------------------

  let canvasRoot = $state<HTMLElement | null>(null);
  let exportProgress = $state<PostStudioExportProgress | null>(null);
  let exportError = $state("");
  let exportedUrl = $state<string | null>(null);
  let exportCancelled = false;
  let lookOpen = $state(false);

  const exporting = $derived(exportProgress !== null);
  const exportPercent = $derived(
    exportProgress && exportProgress.totalFrames > 0
      ? Math.round(
          (exportProgress.completedFrames / exportProgress.totalFrames) * 100
        )
      : 0
  );
  /** The Timing step swaps the post for the take being mapped. */
  const showTimingStage = $derived(
    builder.step === "timing" && !sharing && !previewTarget && !exporting
  );
  const sequenceName = $derived(
    simplifyRepeatedWord(
      sequence.displayName || deriveWord(sequence) || "Vertical post"
    )
  );
  const exportFilename = $derived(
    `${simplifyRepeatedWord(sequenceName || "tka-post")}.mp4`
  );
  const canRender = $derived(
    Boolean(builder.compiled) &&
      builder.durationSeconds > 0 &&
      !exporting &&
      !sharedSurfaces?.moving
  );

  function goToStep(next: PostBuilderStep): void {
    if (next === builder.step) return;
    if (builder.step === "timing") session.pause();
    builder.step = next;
  }

  // The viewer shell shows the studio's own panel in its side inspector.
  $effect(() => {
    if (active) sharedSurfaces?.setInspectorContent("studio");
  });

  $effect(() =>
    sharedSurfaces?.setControls(() => ({
      playing: builder.isPlaying,
      bpm: 60,
      propType: selectedPropType,
      toggle: builder.togglePlayback,
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
      if (builder.isPlaying !== entry.playing && builder.step !== "timing") {
        builder.togglePlayback();
      }
    });
  });

  /**
   * A post is a moving thing, so it opens moving, once, and only when there
   * is a post to play. Mapping plays the take instead, never both at once.
   */
  let autoPlayStarted = false;
  $effect(() => {
    if (sharedSurfaces || autoPlayStarted || !active || showTimingStage) return;
    if (builder.durationSeconds <= 0 || builder.isPlaying) return;
    autoPlayStarted = true;
    untrack(() => builder.togglePlayback());
  });

  $effect(() => {
    if (showTimingStage) untrack(() => builder.pause());
    else untrack(() => session.pause());
  });

  $effect(() => {
    // The shell reads the outgoing play intent before releasing its loan.
    if (!active && !sharedSurfaces?.active) {
      untrack(() => {
        builder.pause();
        session.pause();
      });
    }
  });

  let frameRequest: number | null = null;
  let previousFrameTime: number | null = null;

  function frame(now: number): void {
    if (previousFrameTime !== null) {
      builder.advance((now - previousFrameTime) / 1000);
    }
    previousFrameTime = now;
    if (builder.isPlaying) frameRequest = requestAnimationFrame(frame);
  }

  $effect(() => {
    if (!builder.isPlaying) return;
    frameRequest = requestAnimationFrame(frame);
    return () => {
      if (frameRequest !== null) cancelAnimationFrame(frameRequest);
      frameRequest = null;
      previousFrameTime = null;
    };
  });

  // ---- Render -------------------------------------------------------------

  function nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  async function renderPost(): Promise<boolean> {
    if (exporting || !builder.compiled || builder.durationSeconds <= 0) {
      return false;
    }
    session.pause();
    if (!canvasRoot) {
      builder.step = "render";
      await tick();
      await nextFrame();
    }
    const root = canvasRoot;
    const compiled = builder.compiled;
    if (!root || !compiled) return false;

    const previousTime = builder.previewSeconds;
    const wasPlaying = builder.isPlaying;
    builder.pause();
    exportCancelled = false;
    exportError = "";
    const totalFrames = Math.ceil(
      compiled.durationSeconds * compiled.preset.output.frameRate
    );
    exportProgress = { completedFrames: 0, totalFrames, phase: "audio" };

    let audioUrl: string | null = null;
    try {
      const takeUrls = new Map<string, string>();
      for (const take of builder.plan.takes) {
        const url = builder.mediaUrl(take.id);
        if (url) takeUrls.set(take.id, url);
      }
      const audio = await buildPostAudioTrack({
        post: compiled,
        mode: builder.plan.audio,
        takeUrls,
      });
      if (exportCancelled) return false;
      audioUrl = audio ? URL.createObjectURL(audio) : null;
      exportProgress = { completedFrames: 0, totalFrames, phase: "rendering" };

      const blob = await exportPostStudioVideo({
        root,
        preset: compiled.preset,
        durationSeconds: compiled.durationSeconds,
        getLayers: () => builder.frameLayers,
        seek: builder.seek,
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
            : "The post could not be rendered.";
      }
      return false;
    } finally {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      exportProgress = null;
      builder.seek(previousTime);
      if (wasPlaying) builder.togglePlayback();
    }
  }

  function cancelExport(): void {
    exportCancelled = true;
  }

  const releaseExport = registerExport({
    render: renderPost,
    cancel: cancelExport,
  });

  onDestroy(() => {
    exportCancelled = true;
    releaseExport();
    if (frameRequest !== null) cancelAnimationFrame(frameRequest);
    if (exportedUrl) URL.revokeObjectURL(exportedUrl);
    builder.dispose();
  });
</script>

<section
  class="post-studio"
  data-external-inspector={!!externalInspector}
  data-sharing={sharing}
  aria-label={`Post Studio, ${sequenceName}`}
>
  <div class="layout">
    <div class="stage">
      {#if showTimingStage}
        <PostTimingStage
          {session}
          squarePainter={stripPainters.get("arrows") ?? null}
        />
      {:else}
        <div
          class="preview-host"
          inert={!!previewTarget}
          use:reparentToInspector={previewTarget}
        >
          <div class="canvas-slot">
            <PostBuilderCanvas
              {builder}
              sequence={displaySequence}
              qrSequence={sequence}
              {bindingFor}
              {cardRenderOptions}
              handLabeling={labeledCard.labeling}
              showStripGuide={builder.step === "acts"}
              bind:root={canvasRoot}
            />
          </div>
        </div>
        <PostBuilderTransport {builder} />
      {/if}
    </div>

    <aside
      class="tools"
      class:external={!!externalInspector}
      use:reparentToInspector={externalInspector}
      inert={sharing || undefined}
      aria-label="Post steps"
    >
      <nav class="steps" aria-label="Steps">
        <ol>
          {#each POST_BUILDER_STEPS as step, index (step)}
            <li>
              <button
                type="button"
                class="step"
                class:current={builder.step === step}
                aria-current={builder.step === step ? "step" : undefined}
                onclick={() => goToStep(step)}
              >
                <span class="mark" aria-hidden="true">
                  {#if builder.stepDone[step] && builder.step !== step}
                    <i class="fa-solid fa-check"></i>
                  {:else}
                    {index + 1}
                  {/if}
                </span>
                <span class="label">{STEP_LABEL[step]}</span>
                {#if builder.stepDone[step]}
                  <span class="sr-only">, done</span>
                {/if}
              </button>
            </li>
          {/each}
        </ol>
      </nav>

      <div class="panel">
        {#if builder.step === "takes"}
          <PostTakesPanel
            {builder}
            {catalog}
            catalogLoading={videoLibrary?.loading ?? false}
            catalogError={videoLibrary?.error ?? ""}
          />
        {:else if builder.step === "timing"}
          <PostTimingPanel {session} />
        {:else if builder.step === "acts"}
          <PostActsPanel {builder} />
          <div class="look">
            <button
              type="button"
              class="look-toggle"
              aria-expanded={lookOpen}
              onclick={() => (lookOpen = !lookOpen)}
            >
              <i
                class="fa-solid {lookOpen
                  ? 'fa-chevron-down'
                  : 'fa-chevron-right'}"
                aria-hidden="true"
              ></i>
              Props, trails and colors
            </button>
            {#if lookOpen}
              <div class="look-panel">
                <AnimationPanel
                  layout="sidebar"
                  isExporting={false}
                  isPlaying={builder.isPlaying}
                  onPlaybackToggle={builder.togglePlayback}
                  showTempoControls={false}
                  showEffectsPlayback={false}
                  {selectedPropType}
                  {onPropChange}
                  sequence={displaySequence}
                />
              </div>
            {/if}
          </div>
        {:else if builder.step === "captions"}
          <PostCaptionsPanel {builder} />
        {:else}
          <PostRenderPanel
            {builder}
            {canRender}
            {exporting}
            {exportPercent}
            {exportedUrl}
            {exportFilename}
            {exportError}
            onRender={() => void renderPost()}
            onCancel={cancelExport}
            {onSharePost}
          />
        {/if}
      </div>
    </aside>
  </div>
</section>

<!-- The render reads the live canvas frame by frame. Any edit made while it
     runs lands in the middle of the output, so the app is locked until it
     finishes or is cancelled. -->
<ExportTakeover
  phase={exporting ? "capturing" : "idle"}
  progress={exportPercent / 100}
  phaseLabel={exportProgress?.phase === "audio"
    ? "Mixing the sound"
    : exportProgress
      ? `Rendering frame ${exportProgress.completedFrames} of ${exportProgress.totalFrames}`
      : "Rendering"}
  onCancel={cancelExport}
  label="Rendering your post"
/>

<style>
  .post-studio {
    container: post-studio / inline-size;
    width: 100%;
    min-width: 0;
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    background: var(--theme-panel-bg, transparent);
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: 1rem;
    min-height: 100%;
    padding: 0.75rem;
    box-sizing: border-box;
  }
  .stage {
    display: grid;
    align-content: start;
    gap: 0.75rem;
    min-width: 0;
  }
  .preview-host {
    display: grid;
    justify-items: center;
    min-width: 0;
  }
  .canvas-slot {
    width: min(100%, calc((100dvh - 14rem) * 0.5625), 28rem);
    min-width: min(100%, 12rem);
  }
  .tools {
    display: grid;
    align-content: start;
    gap: 1rem;
    min-width: 0;
  }
  .tools.external {
    height: 100%;
    padding: 0.75rem;
    overflow-y: auto;
    box-sizing: border-box;
  }
  .steps ol {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .step {
    display: grid;
    justify-items: center;
    gap: 0.25rem;
    width: 100%;
    min-height: 3.25rem;
    padding: 0.375rem 0.125rem;
    border: 1px solid transparent;
    border-radius: 0.625rem;
    color: var(--theme-text-secondary, #aaa);
    background: transparent;
    font: inherit;
    cursor: pointer;
  }
  .step:hover {
    color: var(--theme-text, #fff);
  }
  .step:focus-visible {
    outline: 2px solid var(--theme-primary, currentColor);
    outline-offset: 2px;
  }
  .step.current {
    border-color: var(--theme-primary, #d4813a);
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg);
  }
  .mark {
    display: grid;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    border: 1px solid currentColor;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
  }
  .step.current .mark {
    border-color: var(--theme-primary, #d4813a);
    color: var(--theme-primary, #d4813a);
  }
  .label {
    max-width: 100%;
    overflow: hidden;
    font-size: 0.8125rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .panel {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }
  .look {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
    border-top: 1px solid var(--theme-stroke, #484755);
    padding-top: 0.5rem;
  }
  .look-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.75rem;
    padding: 0;
    border: 0;
    color: var(--theme-text, #fff);
    background: none;
    font: inherit;
    font-size: 0.9375rem;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }
  .look-toggle:focus-visible {
    outline: 2px solid var(--theme-primary, currentColor);
    outline-offset: 2px;
  }
  .look-panel {
    min-width: 0;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* Side by side once the frame and the tools both fit; each column then
     scrolls on its own so the post stays in view while a panel is long. */
  @container post-studio (min-width: 56rem) {
    .post-studio:not([data-external-inspector="true"]) .layout {
      grid-template-columns: minmax(0, 1fr) minmax(20rem, 26rem);
      align-content: stretch;
      height: 100%;
      min-height: 0;
    }
    .post-studio:not([data-external-inspector="true"]) .stage,
    .post-studio:not([data-external-inspector="true"]) .tools {
      min-height: 0;
      overflow-y: auto;
    }
  }

  .post-studio[data-sharing="true"] .tools:not(.external) {
    display: none;
  }
</style>
