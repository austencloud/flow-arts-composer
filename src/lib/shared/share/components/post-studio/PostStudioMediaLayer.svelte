<script lang="ts">
  import type { CompositionSourceBinding } from "$lib/shared/media-composition/state/media-composition-state.svelte";
  import type { LayoutRegion } from "$lib/shared/media-composition/domain/media-layout-schema";
  import type { EvaluatedFrameLayer } from "$lib/shared/media-composition/services/frame-evaluator";
  import { tryGetMediaCompositionContext } from "$lib/shared/media-composition/state/media-composition-context";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
  import type {
    PostAnimationItem,
    PostMovesMode,
  } from "$lib/shared/media-composition/domain/post-project";
  import {
    qrImageForAppearance,
    type PostQrAppearance,
  } from "./post-qr-image-appearance";
  import PostStudioSequenceAnimationLayer from "./PostStudioSequenceAnimationLayer.svelte";
  import PostStudioChoreoLayer from "./PostStudioChoreoLayer.svelte";
  import PostStudioTunnelLayer from "./PostStudioTunnelLayer.svelte";
  import PostStudioMandalaLayer from "./PostStudioMandalaLayer.svelte";
  import {
    calculateMediaFit,
    calculateSourceCropFit,
    resolvePanOffset,
  } from "$lib/shared/media-composition/services/media-fit";
  import VisualSequenceSaveContextMenuHost from "$lib/shared/library/components/VisualSequenceSaveContextMenuHost.svelte";
  import { onDestroy, untrack } from "svelte";
  import {
    previewPlaybackRate,
    shouldSeekPreviewVideo,
  } from "$lib/shared/media-composition/services/video-preview-seek";
  import type { PreviewVideoController } from "$lib/shared/media-composition/services/post-preview-clock";
  import { PreviewVideoFrameRecovery } from "$lib/shared/media-composition/services/preview-video-frame-recovery";
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
    exporting?: boolean;
    sequence: SequenceData;
    qrSequence?: SequenceData;
    cardRenderOptions?: Partial<SequenceExportOptions> | null;
    qrAppearance?: PostQrAppearance;
    animationAppearance?: PostAnimationItem["animationAppearance"] | null;
    sequencePosition?: number;
    sequencePassIndex?: number;
    sequenceProgress?: number;
    animationTimeSeconds?: number;
    breakdownMotion?: boolean;
    breakdownMode?: PostMovesMode;
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
    onPlaybackVideo?: (controller: PreviewVideoController | null) => void;
  }

  let {
    binding,
    fit,
    opacity,
    sourceTimeSeconds,
    playing,
    exporting = false,
    sequence,
    qrSequence,
    cardRenderOptions = null,
    qrAppearance,
    animationAppearance = null,
    sequencePosition,
    sequencePassIndex,
    sequenceProgress,
    animationTimeSeconds,
    breakdownMotion,
    breakdownMode,
    labelsPainted = false,
    displayedBeatNumber,
    clipId,
    colorGrade,
    transform,
    sourceGeometry,
    playbackRate = 1,
    previewGain = 0,
    onSourceSize,
    onPlaybackVideo,
  }: Props = $props();
  const composition = tryGetMediaCompositionContext();
  // The footage stays alive when the editor refreshes its binding each frame.
  const videoSource = $derived(binding.previewUrl ?? "");
  let imageSource = $state(binding.previewUrl ?? "");
  $effect(() => {
    const source = binding.previewUrl ?? "";
    const appearance = qrAppearance;
    imageSource = source;
    if (!source || !appearance) return;
    let current = true;
    void qrImageForAppearance(source, appearance).then(
      (url) => {
        if (current && url) imageSource = url;
      },
      () => {
        /* Leave the imported artwork visible if rendering fails. */
      }
    );
    return () => {
      current = false;
    };
  });
  let video = $state<HTMLVideoElement | null>(null);
  let retainedCanvas = $state<HTMLCanvasElement | null>(null);
  let hasRetainedFrame = $state(false);
  let frameRecovery: PreviewVideoFrameRecovery | null = null;
  let videoWaiting = false;
  let playbackHeld = false;
  let playRequest: HTMLVideoElement | null = null;
  let previousClipId: string | null = null;
  let previousPlaybackRate: number | null = null;
  let previousTargetTime: number | null = null;
  let queuedJump = false;
  let awaitingPlayingFrame = false;
  let playingFrameRequest: { element: HTMLVideoElement; id: number } | null =
    null;
  let playingFrameGeneration = 0;
  let lastCorrectionAt = -Infinity;
  let recoveryStartedAt: number | null = null;
  let lastPresentedTime: number | null = null;
  let lastFrameProgressAt: number | null = null;
  let frameVisibilityBlocked = false;
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
  const sourcePan = $derived.by(() =>
    resolvePanOffset({
      drawWidth: boxWidth,
      drawHeight: boxHeight,
      regionWidth: boxWidth,
      regionHeight: boxHeight,
      scale: transform.scale,
      translateX: transform.translateX,
      translateY: transform.translateY,
      rotationDegrees:
        (sourceGeometry?.rotation ?? 0) + transform.rotationDegrees,
    })
  );

  const cropped = $derived.by(() => {
    if (
      !sourceGeometry ||
      sourceWidth <= 0 ||
      sourceHeight <= 0 ||
      boxWidth <= 0 ||
      boxHeight <= 0
    )
      return null;
    const crop = sourceGeometry.crop;
    const fitted = calculateSourceCropFit({
      sourceWidth,
      sourceHeight,
      crop,
      regionWidth: boxWidth,
      regionHeight: boxHeight,
    });
    const fullWidth = fitted.width / (crop.right - crop.left);
    const fullHeight = fitted.height / (crop.bottom - crop.top);
    return {
      left: `${((fitted.x - crop.left * fullWidth) / boxWidth) * 100}%`,
      top: `${((fitted.y - crop.top * fullHeight) / boxHeight) * 100}%`,
      width: `${(fullWidth / boxWidth) * 100}%`,
      height: `${(fullHeight / boxHeight) * 100}%`,
    };
  });

  function syncVideoTime(discontinuity = false): boolean {
    if (exporting) return false;
    if (!video || video.readyState < 1 || !Number.isFinite(sourceTimeSeconds))
      return false;
    const ceiling = Math.max(0, video.duration - 1 / 60);
    const target = Math.min(ceiling, Math.max(0, sourceTimeSeconds));
    const now = performance.now();
    let visible =
      playing &&
      !video.paused &&
      !playbackHeld &&
      opacity > 0 &&
      document.visibilityState === "visible";
    let frameAge = lastFrameProgressAt === null ? 0 : now - lastFrameProgressAt;
    if (visible && (frameAge >= 3000 || frameVisibilityBlocked)) {
      const rect = video.getBoundingClientRect();
      visible =
        getComputedStyle(video).visibility === "visible" &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth;
    }
    if (visible && frameVisibilityBlocked) {
      lastFrameProgressAt = now;
      frameAge = 0;
    }
    frameVisibilityBlocked = !visible;
    // Browsers may stop presenting hidden footage; it gets a fresh grace
    // period when it comes back into view.
    if (!visible && lastFrameProgressAt !== null) lastFrameProgressAt = now;
    let targetBuffered = false;
    for (let index = 0; index < video.buffered.length; index += 1) {
      if (
        target >= video.buffered.start(index) &&
        target < video.buffered.end(index)
      ) {
        targetBuffered = true;
        break;
      }
    }
    // The post follows native playback. Only scrubs, cuts, and a stalled
    // decoder need a seek; the authored speed always stays steady.
    const shouldSeek = shouldSeekPreviewVideo({
      currentTime: video.currentTime,
      targetTime: target,
      previousTargetTime,
      playing,
      seeking: video.seeking,
      waiting: videoWaiting,
      awaitingFrame: awaitingPlayingFrame,
      discontinuity,
      sinceLastCorrectionMs: now - lastCorrectionAt,
      recoveryElapsedMs:
        recoveryStartedAt === null ? 0 : now - recoveryStartedAt,
      targetBuffered,
      presentedTime: lastPresentedTime,
      sinceLastPresentedFrameMs: frameAge,
      visible,
    });
    if (shouldSeek) {
      if (playing) {
        cancelPlayingFrame();
        awaitingPlayingFrame = true;
        lastCorrectionAt = now;
        recoveryStartedAt = now;
      }
      video.currentTime = target;
    }
    const rate = previewPlaybackRate(playbackRate);
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
      watchPlayingFrames(video, true);
    } else if (!syncVideoTime()) {
      showPausedFrame(video);
    }
  }

  function cancelPlayingFrame(): void {
    playingFrameGeneration += 1;
    lastPresentedTime = null;
    lastFrameProgressAt = null;
    if (playingFrameRequest) {
      playingFrameRequest.element.cancelVideoFrameCallback(
        playingFrameRequest.id
      );
      playingFrameRequest = null;
    }
  }

  function watchPlayingFrames(
    element: HTMLVideoElement,
    recovering = false
  ): void {
    cancelPlayingFrame();
    if (typeof element.requestVideoFrameCallback !== "function") return;
    lastFrameProgressAt = performance.now();
    if (recovering) {
      awaitingPlayingFrame = true;
      recoveryStartedAt ??= lastFrameProgressAt;
    }
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
      if (lastPresentedTime !== metadata.mediaTime) {
        lastPresentedTime = metadata.mediaTime;
        lastFrameProgressAt = performance.now();
      }
      firstMediaTime ??= metadata.mediaTime;
      remaining -= 1;
      if (
        awaitingPlayingFrame &&
        remaining <= 0 &&
        metadata.mediaTime > firstMediaTime
      ) {
        awaitingPlayingFrame = false;
        videoWaiting = false;
        recoveryStartedAt = null;
      }
      // Keep watching after recovery: a running clock does not prove that
      // the camera is still showing new frames.
      playingFrameRequest = {
        element,
        id: element.requestVideoFrameCallback(onFrame),
      };
    };
    playingFrameRequest = {
      element,
      id: element.requestVideoFrameCallback(onFrame),
    };
  }

  function onSeeking(): void {
    if (playing) {
      cancelPlayingFrame();
      awaitingPlayingFrame = true;
      recoveryStartedAt ??= performance.now();
    }
  }

  function onWaiting(): void {
    videoWaiting = true;
    if (playing) recoveryStartedAt ??= performance.now();
    if (playing && video && !video.seeking) watchPlayingFrames(video, true);
  }

  function onCanPlay(): void {
    videoWaiting = false;
    if (!awaitingPlayingFrame) recoveryStartedAt = null;
  }

  function cancelPausedFrame(): void {
    frameRecovery?.cancel();
  }

  function showPausedFrame(element: HTMLVideoElement): void {
    cancelPlayingFrame();
    awaitingPlayingFrame = false;
    recoveryStartedAt = null;
    queuedJump = false;
    if (video === element) frameRecovery?.presentPausedFrame();
  }

  function onMetadata(): void {
    if (!video || !Number.isFinite(video.duration)) return;
    cancelPausedFrame();
    cancelPlayingFrame();
    awaitingPlayingFrame = false;
    recoveryStartedAt = null;
    videoWaiting = false;
    previousTargetTime = null;
    sourceWidth = binding.sourceWidth ?? video.videoWidth;
    sourceHeight = binding.sourceHeight ?? video.videoHeight;
    onSourceSize?.({ width: sourceWidth, height: sourceHeight });
    composition?.setSourceDuration(
      binding.roleKey,
      binding.durationSeconds ?? video.duration
    );
    syncVideoTime();
    if (!playing && !video.seeking) showPausedFrame(video);
    frameRecovery?.update();
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

  function startPlayback(element: HTMLVideoElement): void {
    if (!playing || playbackHeld || !element.paused || playRequest === element)
      return;
    playRequest = element;
    void element
      .play()
      .then(() => {
        if (video === element && (!playing || playbackHeld)) element.pause();
      })
      .catch(() => undefined)
      .finally(() => {
        if (playRequest === element) playRequest = null;
      });
  }

  $effect(() => {
    const element = video;
    const canvas = retainedCanvas;
    const source = videoSource;
    if (exporting) return;
    hasRetainedFrame = false;
    if (!element || !canvas) return;
    return untrack(() => {
      const recovery = new PreviewVideoFrameRecovery({
        video: element,
        canvas,
        readState: () => ({
          playing,
          targetTime: sourceTimeSeconds,
          source: videoSource,
        }),
        isCurrent: () => video === element && videoSource === source,
        onFrame: () => {
          hasRetainedFrame = true;
        },
        onRestore: () => {
          videoWaiting = false;
          syncVideoTime(true);
          if (playing) {
            watchPlayingFrames(element, true);
            startPlayback(element);
          }
        },
      });
      frameRecovery = recovery;
      recovery.update();
      if (!playing && element.readyState >= 1)
        recovery.presentPausedFrame(true);
      return () => {
        recovery.destroy();
        cancelPlayingFrame();
        if (frameRecovery === recovery) frameRecovery = null;
      };
    });
  });

  $effect(() => {
    playing;
    sourceTimeSeconds;
    if (exporting) return;
    frameRecovery?.update();
  });

  $effect(() => {
    const element = video;
    const register = onPlaybackVideo;
    if (!element || !register) return;
    const controller: PreviewVideoController = {
      read: () => {
        // Read while the playhead is held too, so recovery never needs the
        // composition to advance before the decoder can resume.
        syncVideoTime();
        return {
          currentTime: element.currentTime,
          // A decoded current frame can start playback. Waiting for future
          // frames here can deadlock a paused clip at a cut or speed change.
          ready: !element.seeking && element.readyState >= 2,
          ended: element.ended,
        };
      },
      align: () => {
        if (element.seeking) queuedJump = true;
        else syncVideoTime(true);
      },
      hold: (held) => {
        playbackHeld = held;
        if (held) element.pause();
        else startPlayback(element);
      },
    };
    register(controller);
    return () => register(null);
  });

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
    if (exporting) {
      video?.pause();
      return;
    }
    const jumped =
      previousTargetTime !== null &&
      Math.abs(sourceTimeSeconds - previousTargetTime) > 0.5;
    const changedClip = previousClipId !== null && previousClipId !== clipId;
    const changedSpeed =
      previousPlaybackRate !== null && previousPlaybackRate !== playbackRate;
    previousClipId = clipId;
    previousPlaybackRate = playbackRate;
    if (playing && (jumped || changedClip || changedSpeed)) queuedJump = true;
    const seeked = syncVideoTime(changedClip || changedSpeed);
    if (seeked || !playing) queuedJump = false;
    previousTargetTime = sourceTimeSeconds;
    if (!video) {
      cancelPausedFrame();
      return;
    }
    if (playing) {
      if (!playingFrameRequest && !video.seeking) watchPlayingFrames(video);
      startPlayback(video);
    } else if (seeked) {
      cancelPlayingFrame();
      awaitingPlayingFrame = false;
      recoveryStartedAt = null;
      // The frame must arrive from the completed seek, not the old position.
      if (!video.seeking) showPausedFrame(video);
    } else if (!frameRecovery?.isPriming && !video.paused) {
      cancelPlayingFrame();
      awaitingPlayingFrame = false;
      recoveryStartedAt = null;
      video.pause();
    } else if (!playing) {
      cancelPlayingFrame();
      awaitingPlayingFrame = false;
      recoveryStartedAt = null;
    }
  });

  onDestroy(() => {
    cancelPausedFrame();
    cancelPlayingFrame();
    frameRecovery?.destroy();
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
    ? `translate(${sourcePan.x}px, ${sourcePan.y}px) rotate(${sourceGeometry.rotation + transform.rotationDegrees}deg) scale(${transform.scale}) scaleX(${transform.flipHorizontal ? -1 : 1})`
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
      {displayedBeatNumber}
      {sequencePassIndex}
      {sequenceProgress}
      {animationTimeSeconds}
      {breakdownMotion}
      {breakdownMode}
      {labelsPainted}
      {animationAppearance}
      {playing}
      leftPropType={cardRenderOptions?.leftPropTypeOverride ??
        cardRenderOptions?.propTypeOverride}
      rightPropType={cardRenderOptions?.rightPropTypeOverride ??
        cardRenderOptions?.propTypeOverride}
    />
  {:else if binding.renderMode === "choreo-card"}
    <PostStudioChoreoLayer
      {sequence}
      {displayedBeatNumber}
      {cardRenderOptions}
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
      src={videoSource || undefined}
      crossorigin="anonymous"
      muted
      playsinline
      preload="auto"
      class:fitted={fitted !== null || cropped !== null}
      style:filter={videoColorFilter(colorGrade)}
      style:object-fit={cropped
        ? "fill"
        : sourceGeometry
          ? "contain"
          : fitted
            ? "fill"
            : fit}
      style:left={cropped?.left ?? fitted?.left}
      style:top={cropped?.top ?? fitted?.top}
      style:width={cropped?.width ?? fitted?.width}
      style:height={cropped?.height ?? fitted?.height}
      onloadedmetadata={onMetadata}
      onerror={() => binding.onPreviewError?.()}
      onseeking={onSeeking}
      onseeked={onSeeked}
      onwaiting={onWaiting}
      oncanplay={onCanPlay}
      onplaying={onCanPlay}
    ></video>
    <!-- Keep the decoded picture visible while the browser restores its video surface.
         Export still reads the original video element and its source dimensions. -->
    <canvas
      bind:this={retainedCanvas}
      class="retained-frame"
      class:fitted={fitted !== null || cropped !== null}
      style:visibility={hasRetainedFrame ? "visible" : "hidden"}
      style:filter={videoColorFilter(colorGrade)}
      style:object-fit={cropped
        ? "fill"
        : sourceGeometry
          ? "contain"
          : fitted
            ? "fill"
            : fit}
      style:left={cropped?.left ?? fitted?.left}
      style:top={cropped?.top ?? fitted?.top}
      style:width={cropped?.width ?? fitted?.width}
      style:height={cropped?.height ?? fitted?.height}
      aria-hidden="true"
    ></canvas>
  {:else}
    <img
      src={imageSource || undefined}
      crossorigin="anonymous"
      alt=""
      class:fitted={fitted !== null || cropped !== null}
      style:object-fit={cropped
        ? "fill"
        : sourceGeometry
          ? "contain"
          : fitted
            ? "fill"
            : fit}
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

  .retained-frame {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .fitted {
    position: absolute;
    max-width: none;
    max-height: none;
  }
</style>
