<script lang="ts">
  import type { CompositionSourceBinding } from "$lib/shared/media-composition/state/media-composition-state.svelte";
  import type { LayoutRegion } from "$lib/shared/media-composition/domain/media-layout-schema";
  import type { EvaluatedFrameLayer } from "$lib/shared/media-composition/services/frame-evaluator";
  import { tryGetMediaCompositionContext } from "$lib/shared/media-composition/state/media-composition-context";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";
  import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
  import type { PostAnimationItem } from "$lib/shared/media-composition/domain/post-project";
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
  import {
    previewPlaybackRate,
    shouldSeekPreviewVideo,
  } from "$lib/shared/media-composition/services/video-preview-seek";
  import {
    videoColorFilter,
    type PostVideoColorGrade,
  } from "$lib/shared/media-composition/domain/post-video-color-grade";

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
    animationAppearance?: PostAnimationItem["animationAppearance"] | null;
    sequencePosition?: number;
    sequencePassIndex?: number;
    animationTimeSeconds?: number;
    breakdownMotion?: boolean;
    /** The post paints the animation's labels; see the animation layer. */
    labelsPainted?: boolean;
    displayedBeatNumber?: number;
    clipId: string;
    colorGrade?: PostVideoColorGrade;
    transform: EvaluatedFrameLayer["transform"];
    sourceGeometry?: EvaluatedFrameLayer["sourceGeometry"];
    /** The act's speed; the footage runs at it while the preview plays. */
    playbackRate?: number;
    /** Live preview only. Export audio is mixed separately. */
    previewGain?: number;
    /** Told the footage's or image's own size once it has loaded. */
    onSourceSize?: (size: { width: number; height: number }) => void;
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
    animationAppearance = null,
    sequencePosition,
    sequencePassIndex,
    animationTimeSeconds,
    breakdownMotion,
    labelsPainted = false,
    displayedBeatNumber,
    clipId,
    colorGrade,
    transform,
    sourceGeometry,
    playbackRate = 1,
    previewGain = 0,
    onSourceSize,
  }: Props = $props();
  const composition = tryGetMediaCompositionContext();
  let video = $state<HTMLVideoElement | null>(null);
  let pausedFrameRequest: { element: HTMLVideoElement; id: number } | null =
    null;
  let pausedFrameGeneration = 0;
  let primingVideo: HTMLVideoElement | null = null;
  let videoWaiting = false;
  let previousTargetTime: number | null = null;
  let queuedJump = false;
  let awaitingPlayingFrame = false;
  let playingFrameRequest: { element: HTMLVideoElement; id: number } | null =
    null;
  let playingFrameGeneration = 0;
  let lastCorrectionAt = -Infinity;
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

  const drawRect = $derived(
    sourceWidth > 0 && sourceHeight > 0 && boxWidth > 0 && boxHeight > 0
      ? calculateMediaFit({
          sourceWidth,
          sourceHeight,
          regionWidth: boxWidth,
          regionHeight: boxHeight,
          fit,
        }).drawRect
      : null
  );

  /**
   * The picture is drawn whole at its fitted size, as the export draws it,
   * and the slot crops it. Cropping it to its own box first (object-fit)
   * made a pan or a turn slide that cropped box across the slot, opening a
   * gap where the export shows the footage the slot was hiding. Placed in
   * shares of the box, so a box measured in whole pixels cannot leave a
   * hairline. Until the size is known, object-fit stands in.
   */
  const fitted = $derived(
    drawRect
      ? {
          left: `${(drawRect.x / boxWidth) * 100}%`,
          top: `${(drawRect.y / boxHeight) * 100}%`,
          width: `${(drawRect.width / boxWidth) * 100}%`,
          height: `${(drawRect.height / boxHeight) * 100}%`,
        }
      : null
  );

  const pan = $derived.by(() => {
    if (!drawRect) return { x: 0, y: 0 };
    return resolvePanOffset({
      drawWidth: drawRect.width,
      drawHeight: drawRect.height,
      regionWidth: boxWidth,
      regionHeight: boxHeight,
      scale: transform.scale,
      translateX: transform.translateX,
      translateY: transform.translateY,
      rotationDegrees: transform.rotationDegrees,
    });
  });

  const cropped = $derived(
    sourceGeometry
      ? {
          left: `${(-sourceGeometry.crop.left / (sourceGeometry.crop.right - sourceGeometry.crop.left)) * 100}%`,
          top: `${(-sourceGeometry.crop.top / (sourceGeometry.crop.bottom - sourceGeometry.crop.top)) * 100}%`,
          width: `${100 / (sourceGeometry.crop.right - sourceGeometry.crop.left)}%`,
          height: `${100 / (sourceGeometry.crop.bottom - sourceGeometry.crop.top)}%`,
        }
      : null
  );

  function syncVideoTime(discontinuity = false): boolean {
    if (!video || video.readyState < 1 || !Number.isFinite(sourceTimeSeconds))
      return false;
    const ceiling = Math.max(0, video.duration - 1 / 60);
    const target = Math.min(ceiling, Math.max(0, sourceTimeSeconds));
    // Paused frames and timeline jumps seek exactly. During playback, small
    // drift changes the rate briefly so footage keeps decoding smoothly.
    const shouldSeek = shouldSeekPreviewVideo({
      currentTime: video.currentTime,
      targetTime: target,
      previousTargetTime,
      playing,
      seeking: video.seeking,
      waiting: videoWaiting,
      awaitingFrame: awaitingPlayingFrame,
      discontinuity,
      sinceLastCorrectionMs: performance.now() - lastCorrectionAt,
    });
    if (shouldSeek) {
      if (playing) {
        cancelPlayingFrame();
        awaitingPlayingFrame = true;
        lastCorrectionAt = performance.now();
      }
      video.currentTime = target;
    }
    const recovering = video.seeking || videoWaiting || awaitingPlayingFrame;
    const rate = playing
      ? previewPlaybackRate(
          playbackRate,
          target - video.currentTime,
          recovering
        )
      : playbackRate;
    if (video.playbackRate !== rate) video.playbackRate = rate;
    return shouldSeek;
  }

  function onSeeked(): void {
    if (!video) return;
    if (playing) {
      if (queuedJump && syncVideoTime(true)) {
        queuedJump = false;
        return;
      }
      queuedJump = false;
      waitForPlayingFrames(video);
    } else if (!syncVideoTime()) {
      showPausedFrame(video);
    }
  }

  function cancelPlayingFrame(): void {
    playingFrameGeneration += 1;
    if (playingFrameRequest) {
      playingFrameRequest.element.cancelVideoFrameCallback(
        playingFrameRequest.id
      );
      playingFrameRequest = null;
    }
  }

  function waitForPlayingFrames(element: HTMLVideoElement): void {
    cancelPlayingFrame();
    awaitingPlayingFrame = true;
    const generation = playingFrameGeneration;
    let remaining = 2;
    let firstMediaTime: number | null = null;
    const onFrame: VideoFrameRequestCallback = (_, metadata) => {
      if (
        generation !== playingFrameGeneration ||
        video !== element ||
        !playing
      )
        return;
      playingFrameRequest = null;
      firstMediaTime ??= metadata.mediaTime;
      remaining -= 1;
      if (remaining <= 0 && metadata.mediaTime - firstMediaTime >= 0.75) {
        awaitingPlayingFrame = false;
        videoWaiting = false;
      } else {
        playingFrameRequest = {
          element,
          id: element.requestVideoFrameCallback(onFrame),
        };
      }
    };
    playingFrameRequest = {
      element,
      id: element.requestVideoFrameCallback(onFrame),
    };
  }

  function onSeeking(): void {
    cancelPausedFrame();
    if (playing) {
      cancelPlayingFrame();
      awaitingPlayingFrame = true;
    }
  }

  function onWaiting(): void {
    videoWaiting = true;
    if (playing && video && !video.seeking) waitForPlayingFrames(video);
  }

  function onCanPlay(): void {
    videoWaiting = false;
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
    cancelPlayingFrame();
    awaitingPlayingFrame = false;
    queuedJump = false;
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
    cancelPausedFrame();
    videoWaiting = false;
    previousTargetTime = null;
    sourceWidth = video.videoWidth;
    sourceHeight = video.videoHeight;
    onSourceSize?.({ width: sourceWidth, height: sourceHeight });
    composition?.setSourceDuration(binding.roleKey, video.duration);
    syncVideoTime();
    if (!playing && !video.seeking) showPausedFrame(video);
  }

  function onImageLoad(event: Event): void {
    const image = event.currentTarget as HTMLImageElement;
    sourceWidth = image.naturalWidth;
    sourceHeight = image.naturalHeight;
    onSourceSize?.({ width: sourceWidth, height: sourceHeight });
  }

  function handleContextMenu(event: MouseEvent): void {
    if (event.defaultPrevented) return;
    event.preventDefault();
    saveMenuHost?.openContextMenu(event.clientX, event.clientY);
  }

  // A new src resets the rate to the default, so the default carries it too.
  $effect(() => {
    if (!video) return;
    video.defaultPlaybackRate = playbackRate;
    video.preservesPitch = false;
  });

  $effect(() => {
    if (!video) return;
    const gain = Math.max(0, Math.min(1, previewGain));
    video.volume = gain;
    video.muted = !playing || gain === 0;
  });

  $effect(() => {
    sourceTimeSeconds;
    playing;
    const jumped =
      previousTargetTime !== null &&
      Math.abs(sourceTimeSeconds - previousTargetTime) > 0.5;
    if (playing && jumped) queuedJump = true;
    const seeked = syncVideoTime();
    if (seeked || !playing) queuedJump = false;
    previousTargetTime = sourceTimeSeconds;
    if (!video) {
      cancelPausedFrame();
      return;
    }
    if (playing) {
      cancelPausedFrame();
      if (video.paused)
        void video
          .play()
          .then(() => {
            if (!playing && primingVideo !== video) video?.pause();
          })
          .catch(() => undefined);
    } else if (seeked) {
      cancelPlayingFrame();
      awaitingPlayingFrame = false;
      // The frame must arrive from the completed seek, not the old position.
      if (!video.seeking) showPausedFrame(video);
    } else if (primingVideo !== video && !video.paused) {
      cancelPlayingFrame();
      awaitingPlayingFrame = false;
      video.pause();
    } else if (!playing) {
      cancelPlayingFrame();
      awaitingPlayingFrame = false;
    }
  });

  onDestroy(() => {
    cancelPausedFrame();
    cancelPlayingFrame();
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="media-layer"
  class:source-geometry={sourceGeometry !== undefined}
  bind:clientWidth={boxWidth}
  bind:clientHeight={boxHeight}
  style:opacity
  style:left={sourceGeometry ? `${sourceGeometry.x * 100}%` : undefined}
  style:top={sourceGeometry ? `${sourceGeometry.y * 100}%` : undefined}
  style:width={sourceGeometry ? `${sourceGeometry.width * 100}%` : undefined}
  style:height={sourceGeometry ? `${sourceGeometry.height * 100}%` : undefined}
  style:transform={sourceGeometry
    ? `rotate(${sourceGeometry.rotation}deg) scaleX(${transform.flipHorizontal ? -1 : 1})`
    : `translate(${pan.x}px, ${pan.y}px) rotate(${transform.rotationDegrees}deg) scale(${transform.scale}) scaleX(${transform.flipHorizontal ? -1 : 1})`}
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
      {labelsPainted}
      {animationAppearance}
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
      class:fitted={fitted !== null || cropped !== null}
      style:object-fit={fitted || cropped ? "fill" : fit}
      style:filter={videoColorFilter(colorGrade)}
      style:left={cropped?.left ?? fitted?.left}
      style:top={cropped?.top ?? fitted?.top}
      style:width={cropped?.width ?? fitted?.width}
      style:height={cropped?.height ?? fitted?.height}
      onloadedmetadata={onMetadata}
      onseeking={onSeeking}
      onseeked={onSeeked}
      onwaiting={onWaiting}
      oncanplay={onCanPlay}
      onplaying={onCanPlay}
    ></video>
  {:else}
    <img
      src={binding.previewUrl ?? undefined}
      crossorigin="anonymous"
      alt=""
      class:fitted={fitted !== null || cropped !== null}
      style:object-fit={fitted || cropped ? "fill" : fit}
      style:left={cropped?.left ?? fitted?.left}
      style:top={cropped?.top ?? fitted?.top}
      style:width={cropped?.width ?? fitted?.width}
      style:height={cropped?.height ?? fitted?.height}
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

  .media-layer.source-geometry {
    right: auto;
    bottom: auto;
    overflow: hidden;
  }

  img,
  video {
    width: 100%;
    height: 100%;
  }

  .fitted {
    position: absolute;
    max-width: none;
    max-height: none;
  }
</style>
