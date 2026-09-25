<script lang="ts">
  import type { CompositionSourceBinding } from "$lib/shared/media-composition/state/media-composition-state.svelte";
  import type { LayoutRegion } from "$lib/shared/media-composition/domain/media-layout-schema";
  import type { EvaluatedFrameLayer } from "$lib/shared/media-composition/services/frame-evaluator";
  import { tryGetMediaCompositionContext } from "$lib/shared/media-composition/state/media-composition-context";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";
  import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
  import PostStudioSequenceAnimationLayer from "./PostStudioSequenceAnimationLayer.svelte";
  import PostStudioChoreoLayer from "./PostStudioChoreoLayer.svelte";
  import PostStudioTunnelLayer from "./PostStudioTunnelLayer.svelte";
  import PostStudioMandalaLayer from "./PostStudioMandalaLayer.svelte";
  import {
    calculateMediaFit,
    resolvePanOffset,
  } from "$lib/shared/media-composition/services/media-fit";
  import VisualSequenceSaveContextMenuHost from "$lib/shared/library/components/VisualSequenceSaveContextMenuHost.svelte";
  import { onDestroy } from "svelte";

  interface Props {
    binding: CompositionSourceBinding;
    fit: LayoutRegion["fit"];
    opacity: number;
    sourceTimeSeconds: number;
    playing: boolean;
    sequence: SequenceData;
    handLabeling?: HandLabeling | null;
    qrSequence?: SequenceData;
    cardRenderOptions?: Partial<SequenceExportOptions> | null;
    sequencePosition?: number;
    sequencePassIndex?: number;
    animationTimeSeconds?: number;
    breakdownMotion?: boolean;
    displayedBeatNumber?: number;
    clipId: string;
    transform: EvaluatedFrameLayer["transform"];
    /** The act's speed; the footage runs at it while the preview plays. */
    playbackRate?: number;
  }

  let {
    binding,
    fit,
    opacity,
    sourceTimeSeconds,
    playing,
    sequence,
    handLabeling = null,
    qrSequence,
    cardRenderOptions = null,
    sequencePosition,
    sequencePassIndex,
    animationTimeSeconds,
    breakdownMotion,
    displayedBeatNumber,
    clipId,
    transform,
    playbackRate = 1,
  }: Props = $props();
  const composition = tryGetMediaCompositionContext();
  let video = $state<HTMLVideoElement | null>(null);
  let pausedFrameRequest: { element: HTMLVideoElement; id: number } | null =
    null;
  let pausedFrameGeneration = 0;
  let primingVideo: HTMLVideoElement | null = null;
  let saveMenuHost: VisualSequenceSaveContextMenuHost | undefined = $state();

  /**
   * Pan is resolved here rather than expressed as a percentage of the layer,
   * so the preview pans exactly as far as the export does. `resolvePanOffset`
   * measures the move against the source the slot is hiding, which needs the
   * footage's own dimensions and the size the slot is actually drawn at.
   */
  let boxWidth = $state(0);
  let boxHeight = $state(0);
  let sourceWidth = $state(0);
  let sourceHeight = $state(0);

  const pan = $derived.by(() => {
    if (
      sourceWidth <= 0 ||
      sourceHeight <= 0 ||
      boxWidth <= 0 ||
      boxHeight <= 0
    ) {
      return { x: 0, y: 0 };
    }
    const drawRect = calculateMediaFit({
      sourceWidth,
      sourceHeight,
      regionWidth: boxWidth,
      regionHeight: boxHeight,
      fit,
    }).drawRect;
    return resolvePanOffset({
      drawWidth: drawRect.width,
      drawHeight: drawRect.height,
      regionWidth: boxWidth,
      regionHeight: boxHeight,
      scale: transform.scale,
      translateX: transform.translateX,
      translateY: transform.translateY,
    });
  });

  function syncVideoTime(): boolean {
    if (!video || video.readyState < 1 || !Number.isFinite(sourceTimeSeconds))
      return false;
    const ceiling = Math.max(0, video.duration - 1 / 60);
    const target = Math.min(ceiling, Math.max(0, sourceTimeSeconds));
    // Paused, the frame shown is the frame asked for; playing, the element
    // runs on its own clock and is only pulled back when it drifts.
    const tolerance = playing ? 0.12 : 1 / 30;
    if (Math.abs(video.currentTime - target) <= tolerance) return false;
    video.currentTime = target;
    return true;
  }

  function cancelPausedFrame(): void {
    pausedFrameGeneration += 1;
    if (pausedFrameRequest) {
      pausedFrameRequest.element.cancelVideoFrameCallback(
        pausedFrameRequest.id
      );
      pausedFrameRequest = null;
    }
    primingVideo = null;
  }

  function showPausedFrame(element: HTMLVideoElement): void {
    cancelPausedFrame();
    const generation = pausedFrameGeneration;
    primingVideo = element;
    // A newly mounted, paused video can stay at HAVE_METADATA after a seek.
    // Let it decode one frame, then return it to the paused preview state.
    const id = element.requestVideoFrameCallback(() => {
      if (generation !== pausedFrameGeneration) return;
      pausedFrameRequest = null;
      primingVideo = null;
      if (video === element && !playing) element.pause();
    });
    pausedFrameRequest = { element, id };
    void element.play().catch(() => {
      if (generation === pausedFrameGeneration) cancelPausedFrame();
    });
  }

  function onMetadata(): void {
    if (!video || !Number.isFinite(video.duration)) return;
    sourceWidth = video.videoWidth;
    sourceHeight = video.videoHeight;
    composition?.setSourceDuration(binding.roleKey, video.duration);
    syncVideoTime();
    if (!playing) showPausedFrame(video);
  }

  function onImageLoad(event: Event): void {
    const image = event.currentTarget as HTMLImageElement;
    sourceWidth = image.naturalWidth;
    sourceHeight = image.naturalHeight;
  }

  function handleContextMenu(event: MouseEvent): void {
    if (event.defaultPrevented) return;
    event.preventDefault();
    saveMenuHost?.openContextMenu(event.clientX, event.clientY);
  }

  $effect(() => {
    if (video && video.playbackRate !== playbackRate) {
      video.playbackRate = playbackRate;
    }
  });

  $effect(() => {
    sourceTimeSeconds;
    playing;
    const seeked = syncVideoTime();
    if (!video) {
      cancelPausedFrame();
      return;
    }
    if (playing) {
      cancelPausedFrame();
      if (video.paused) void video.play().catch(() => undefined);
    } else if (seeked) {
      showPausedFrame(video);
    } else if (primingVideo !== video && !video.paused) {
      video.pause();
    }
  });

  onDestroy(cancelPausedFrame);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="media-layer"
  bind:clientWidth={boxWidth}
  bind:clientHeight={boxHeight}
  style:opacity
  style:transform={`translate(${pan.x}px, ${pan.y}px) rotate(${transform.rotationDegrees}deg) scale(${transform.scale}) scaleX(${transform.flipHorizontal ? -1 : 1})`}
  data-clip-id={clipId}
  data-source-role={binding.roleKey}
  data-render-mode={binding.renderMode ?? "external-media"}
  oncontextmenu={handleContextMenu}
>
  {#if binding.renderMode === "sequence-animation" && sequencePosition !== undefined}
    <PostStudioSequenceAnimationLayer
      {sequence}
      {sequencePosition}
      {sequencePassIndex}
      {animationTimeSeconds}
      {breakdownMotion}
      {playing}
      leftPropType={cardRenderOptions?.leftPropTypeOverride ??
        cardRenderOptions?.propTypeOverride}
      rightPropType={cardRenderOptions?.rightPropTypeOverride ??
        cardRenderOptions?.propTypeOverride}
    />
  {:else if binding.renderMode === "choreo-card" && displayedBeatNumber !== undefined}
    <PostStudioChoreoLayer
      {sequence}
      {displayedBeatNumber}
      {cardRenderOptions}
      {handLabeling}
      {qrSequence}
    />
  {:else if binding.renderMode === "tunnel"}
    <PostStudioTunnelLayer
      {sequence}
      {playing}
      bpm={composition?.tempoBpm ?? 60}
      leftPropType={cardRenderOptions?.leftPropTypeOverride ??
        cardRenderOptions?.propTypeOverride}
      rightPropType={cardRenderOptions?.rightPropTypeOverride ??
        cardRenderOptions?.propTypeOverride}
    />
  {:else if binding.renderMode === "mandala"}
    <PostStudioMandalaLayer
      {sequence}
      leftPropType={cardRenderOptions?.leftPropTypeOverride ??
        cardRenderOptions?.propTypeOverride}
      rightPropType={cardRenderOptions?.rightPropTypeOverride ??
        cardRenderOptions?.propTypeOverride}
    />
  {:else if binding.previewType === "video" || binding.kind === "video"}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      bind:this={video}
      src={binding.previewUrl ?? undefined}
      crossorigin="anonymous"
      muted
      playsinline
      preload="auto"
      style:object-fit={fit}
      onloadedmetadata={onMetadata}
    ></video>
  {:else}
    <img
      src={binding.previewUrl ?? undefined}
      crossorigin="anonymous"
      alt=""
      style:object-fit={fit}
      onload={onImageLoad}
    />
  {/if}
</div>

<VisualSequenceSaveContextMenuHost bind:this={saveMenuHost} {sequence} />

<style>
  /* The layer used to be pointer-transparent so the slot button underneath got
     every click. That also meant right-click never reached the media, so the
     canvas and the choreo card lost the context menus they carry everywhere
     else and the frame answered with the bare browser menu. Clicks bubble to
     the enclosing slot button on their own, so selecting a slot still works
     with the media taking events. */
  .media-layer {
    position: absolute;
    inset: 0;
    transform-origin: center;
  }

  img,
  video {
    width: 100%;
    height: 100%;
  }
</style>
