import type {
  MediaCompositionPreset,
  PresetSourceGeometry,
} from "$lib/shared/media-composition/domain/media-composition-preset-schema";
import type { LayoutRegion } from "$lib/shared/media-composition/domain/media-layout-schema";
import {
  fadeBlackOpacityAt,
  regionRectIsOnFrame,
  type EvaluatedFrameLayer,
} from "$lib/shared/media-composition/services/frame-evaluator";
import {
  paintSurfaceGeometry,
  toPaintFrame,
  type PostStudioLayerPainter,
} from "$lib/shared/media-composition/services/post-studio-layer-painter";
import {
  backdropLayer,
  paintBlurredBackdrop,
} from "$lib/shared/media-composition/services/post-backdrop-painter";
import {
  calculateMediaFit,
  calculateSourceCropFit,
  resolvePanOffset,
  type PixelRect,
} from "$lib/shared/media-composition/services/media-fit";
import {
  paintEdgeBorder,
  paintEdgeShadow,
  regionEdgePixels,
  turnAboutCentre,
} from "$lib/shared/media-composition/services/region-edge-painter";
import { traceRoundedRect } from "$lib/shared/render/utils/trace-rounded-rect";
import { videoColorFilter } from "$lib/shared/media-composition/domain/post-video-color-grade";
import type { PostStudioExportVideoFrames } from "$lib/shared/media-composition/services/post-studio-export-video-frames";
import { POST_STUDIO_DOM_CAPTURE_OPTIONS } from "$lib/shared/media-composition/services/post-studio-dom-capture";
import { tunnelHookPanelOpacity } from "$lib/shared/media-composition/domain/tunnel-hook";
import { sampleEasing } from "$lib/shared/media-composition/domain/post-project-keyframes";
import type { PostStudioPictographCapture } from "$lib/shared/media-composition/services/post-studio-pictograph-capture";

export interface FrameLayerGeometry {
  region: PixelRect;
  drawRect: PixelRect;
  rotationDegrees: number;
  scale: number;
  translateX: number;
  translateY: number;
  flipHorizontal: boolean;
  sourceCrop?: PresetSourceGeometry["crop"];
}

export interface RenderPostStudioFrameInput {
  canvas: HTMLCanvasElement;
  root: HTMLElement;
  preset: MediaCompositionPreset;
  layers: readonly EvaluatedFrameLayer[];
  cardFrameCache: Map<string, HTMLCanvasElement>;
  pictographCapture?: PostStudioPictographCapture;
  /** Painted sources by role. A painted layer never reads the DOM. */
  painters?: ReadonlyMap<string, PostStudioLayerPainter>;
  videoFrames?: PostStudioExportVideoFrames;
  /** The post time these layers were evaluated at. */
  timeSeconds?: number;
}

function outputRegion(
  preset: MediaCompositionPreset,
  region: LayoutRegion
): PixelRect {
  return {
    x: region.x * preset.output.width,
    y: region.y * preset.output.height,
    width: region.width * preset.output.width,
    height: region.height * preset.output.height,
  };
}

/**
 * Resolves the exact pixel geometry shared by external video/image layers and
 * the export compositor. Translation is serialized as a fraction of the region
 * size, keeping presets resolution independent.
 */
export function resolveFrameLayerGeometry(input: {
  preset: MediaCompositionPreset;
  region: LayoutRegion;
  sourceWidth: number;
  sourceHeight: number;
  transform: EvaluatedFrameLayer["transform"];
  sourceGeometry?: PresetSourceGeometry;
}): FrameLayerGeometry {
  if (input.sourceGeometry) {
    const geometry = input.sourceGeometry;
    const region = {
      x: geometry.x * input.preset.output.width,
      y: geometry.y * input.preset.output.height,
      width: geometry.width * input.preset.output.width,
      height: geometry.height * input.preset.output.height,
    };
    const fitted = calculateSourceCropFit({
      sourceWidth: input.sourceWidth,
      sourceHeight: input.sourceHeight,
      crop: geometry.crop,
      regionWidth: region.width,
      regionHeight: region.height,
    });
    const pan = resolvePanOffset({
      drawWidth: fitted.width,
      drawHeight: fitted.height,
      regionWidth: region.width,
      regionHeight: region.height,
      scale: input.transform.scale,
      translateX: input.transform.translateX,
      translateY: input.transform.translateY,
      rotationDegrees: geometry.rotation + input.transform.rotationDegrees,
    });
    return {
      region,
      drawRect: {
        x: region.x + fitted.x,
        y: region.y + fitted.y,
        width: fitted.width,
        height: fitted.height,
      },
      rotationDegrees: geometry.rotation + input.transform.rotationDegrees,
      scale: input.transform.scale,
      translateX: pan.x,
      translateY: pan.y,
      flipHorizontal: input.transform.flipHorizontal,
      sourceCrop: geometry.crop,
    };
  }
  const region = outputRegion(input.preset, input.region);
  const fit = calculateMediaFit({
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    regionWidth: region.width,
    regionHeight: region.height,
    fit: input.region.fit,
  });

  const pan = resolvePanOffset({
    drawWidth: fit.drawRect.width,
    drawHeight: fit.drawRect.height,
    regionWidth: region.width,
    regionHeight: region.height,
    scale: input.transform.scale,
    translateX: input.transform.translateX,
    translateY: input.transform.translateY,
    rotationDegrees: input.transform.rotationDegrees,
  });

  return {
    region,
    drawRect: {
      x: region.x + fit.drawRect.x,
      y: region.y + fit.drawRect.y,
      width: fit.drawRect.width,
      height: fit.drawRect.height,
    },
    rotationDegrees: input.transform.rotationDegrees,
    scale: input.transform.scale,
    translateX: pan.x,
    translateY: pan.y,
    flipHorizontal: input.transform.flipHorizontal,
  };
}

function waitForEvent(
  target: EventTarget,
  eventName: string,
  timeoutMs = 5_000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Media failed while waiting for ${eventName}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      target.removeEventListener(eventName, onEvent);
      target.removeEventListener("error", onError);
    };
    target.addEventListener(eventName, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

async function syncVideo(
  video: HTMLVideoElement,
  sourceTimeSeconds: number
): Promise<void> {
  if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
    await waitForEvent(video, "loadedmetadata");
  }
  const ceiling = Math.max(0, video.duration - 1 / 120);
  const target = Math.min(ceiling, Math.max(0, sourceTimeSeconds));
  if (Math.abs(video.currentTime - target) > 1 / 240) {
    video.currentTime = target;
    await waitForEvent(video, "seeked");
  } else if (video.seeking) {
    // The preview's own sync can start this very seek a moment earlier, which
    // leaves currentTime already on target while the old frame is still the
    // one decoded. Drawing now would bake the previous frame into the file.
    await waitForEvent(video, "seeked");
  }
}

function applyLayerTransform(
  context: CanvasRenderingContext2D,
  geometry: FrameLayerGeometry
): void {
  const centerX = geometry.region.x + geometry.region.width / 2;
  const centerY = geometry.region.y + geometry.region.height / 2;
  context.translate(
    centerX + geometry.translateX,
    centerY + geometry.translateY
  );
  context.rotate((geometry.rotationDegrees * Math.PI) / 180);
  context.scale(geometry.scale, geometry.scale);
  // Applied last, so the reflection is about the slot's own centre line rather
  // than the frame's - a layer in the bottom half stays in the bottom half.
  if (geometry.flipHorizontal) context.scale(-1, 1);
  context.translate(-centerX, -centerY);
}

function drawSource(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  geometry: FrameLayerGeometry
): void {
  if (geometry.sourceCrop) {
    const crop = geometry.sourceCrop;
    const dimensions =
      geometry.sourceCrop &&
      (source instanceof HTMLVideoElement
        ? { width: source.videoWidth, height: source.videoHeight }
        : source instanceof HTMLImageElement
          ? { width: source.naturalWidth, height: source.naturalHeight }
          : source instanceof HTMLCanvasElement
            ? { width: source.width, height: source.height }
            : null);
    if (!dimensions) return;
    context.drawImage(
      source,
      crop.left * dimensions.width,
      crop.top * dimensions.height,
      (crop.right - crop.left) * dimensions.width,
      (crop.bottom - crop.top) * dimensions.height,
      geometry.drawRect.x,
      geometry.drawRect.y,
      geometry.drawRect.width,
      geometry.drawRect.height
    );
    return;
  }
  context.drawImage(
    source,
    geometry.drawRect.x,
    geometry.drawRect.y,
    geometry.drawRect.width,
    geometry.drawRect.height
  );
}

export function mediaDimensions(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): { width: number; height: number } {
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

async function captureCardLayer(
  layerElement: HTMLElement,
  targetWidth: number,
  cacheKey: string,
  cache: Map<string, HTMLCanvasElement>
): Promise<HTMLCanvasElement> {
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const cardElement = layerElement.querySelector<HTMLElement>(".choreo-layer");
  if (!cardElement) throw new Error("Choreo card export surface is missing");
  await waitForChoreoCardQr(cardElement);
  const bounds = cardElement.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    throw new Error("Choreo card export surface has no size");
  }

  const { domToCanvas } = await import("modern-screenshot");
  const canvas = await domToCanvas(cardElement, {
    width: bounds.width,
    height: bounds.height,
    scale: targetWidth / bounds.width,
    ...POST_STUDIO_DOM_CAPTURE_OPTIONS,
  });
  cache.set(cacheKey, canvas);
  return canvas;
}

function layerElementForClip(
  root: HTMLElement,
  clipId: string
): HTMLElement | null {
  return root.querySelector<HTMLElement>(
    `.media-layer[data-clip-id="${CSS.escape(clipId)}"]`
  );
}

function mediaIn(
  layerElement: HTMLElement
): HTMLVideoElement | HTMLImageElement | null {
  return (
    layerElement.querySelector<HTMLVideoElement>("video") ??
    layerElement.querySelector<HTMLImageElement>("img")
  );
}

/** The video or picture a clip shows, where the preview mounted it. */
export function mediaForClip(
  root: HTMLElement,
  clipId: string
): HTMLVideoElement | HTMLImageElement | null {
  const layerElement = layerElementForClip(root, clipId);
  return layerElement ? mediaIn(layerElement) : null;
}

/**
 * The blurred background, under every layer: the main clip on screen, read
 * from the same element its own layer draws.
 */
async function drawBackdrop(
  context: CanvasRenderingContext2D,
  input: RenderPostStudioFrameInput
): Promise<void> {
  const layer = backdropLayer(input.preset, input.layers);
  const media = layer
    ? input.videoFrames?.has(layer.sourceRole)
      ? await input.videoFrames.frameFor(
          layer.sourceRole,
          layer.sourceTimeSeconds
        )
      : mediaForClip(input.root, layer.clipId)
    : null;
  if (!layer || !media) return;
  if (media instanceof HTMLVideoElement) {
    await syncVideo(media, layer.sourceTimeSeconds);
  } else if (media instanceof HTMLImageElement && !media.complete) {
    await media.decode();
  }
  paintBlurredBackdrop(context, {
    source: media,
    sourceSize: mediaDimensions(media),
    frame: { width: input.canvas.width, height: input.canvas.height },
    transform: layer.transform,
    opacity: layer.opacity,
  });
}

/**
 * Wait until the opening hook's extra performers have their prop artwork, so a
 * frame never captures the ring half-drawn. Only the first hook frame waits;
 * the artwork stays loaded after that.
 */
export async function waitForTunnelHookArtwork(
  layerElement: HTMLElement,
  timeoutMs = 10_000
): Promise<void> {
  const pending = () =>
    layerElement.querySelector('[data-tunnel-hook-pending="true"]') !== null;
  if (!pending()) return;
  const deadline = performance.now() + timeoutMs;
  while (pending()) {
    if (performance.now() > deadline)
      throw new Error(
        "The opening hook's performers were not ready to render."
      );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve())
    );
  }
  // The renderer redraws once the artwork lands; let that frame paint.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Wait until a card has its QR code drawn. A card mounts on the frame it first
 * shows and mints its code a moment later, and the render keeps one capture
 * per beat, so capturing early showed a mandala in the QR cell for the whole
 * card.
 */
export async function waitForChoreoCardQr(
  cardElement: HTMLElement,
  timeoutMs = 10_000
): Promise<void> {
  const pending = () =>
    cardElement.querySelector('[data-qr-pending="true"]') !== null;
  if (!pending()) return;
  const deadline = performance.now() + timeoutMs;
  while (pending()) {
    if (performance.now() > deadline)
      throw new Error("The card's QR code was not ready to render.");
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve())
    );
  }
  // The code fades in; capture it once it has landed.
  await Promise.allSettled(
    [...cardElement.querySelectorAll("img")].map((image) => image.decode())
  );
  await Promise.allSettled(
    cardElement
      .getAnimations({ subtree: true })
      .filter(
        (animation) => animation.effect?.getTiming().iterations !== Infinity
      )
      .map((animation) => animation.finished)
  );
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

/** Wait for the current pictograph's preparation, grid, and layout to commit. */
export function waitForPictographMotion(
  layerElement: HTMLElement,
  timeoutMs = 5_000
): Promise<{ element: HTMLElement; bounds: DOMRect }> {
  return new Promise((resolve, reject) => {
    let frame = 0;
    let timer = 0;
    let settled = false;
    const observer = new MutationObserver(check);
    const cleanup = () => {
      settled = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
    function check() {
      if (settled) return;
      const element = layerElement.querySelector<HTMLElement>(
        "[data-pictograph-motion]"
      );
      const requiredContainers = [
        ...(element?.querySelectorAll<HTMLElement>(
          "[data-pictograph-render-ready]"
        ) ?? []),
      ].filter(
        (container) =>
          !container.closest('[data-pictograph-capture-required="false"]')
      );
      if (
        !element ||
        requiredContainers.length === 0 ||
        requiredContainers.some(
          (container) => container.dataset.pictographRenderReady !== "true"
        )
      )
        return;
      const bounds = element.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      cleanup();
      resolve({ element, bounds });
    }
    function checkLayout() {
      check();
      if (!settled) frame = requestAnimationFrame(checkLayout);
    }
    observer.observe(layerElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "data-pictograph-render-ready",
        "data-pictograph-capture-required",
      ],
    });
    timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("The pictograph motion layer was not ready to render."));
    }, timeoutMs);
    check();
    if (!settled) frame = requestAnimationFrame(checkLayout);
  });
}

/**
 * A painted layer draws straight into the output at output resolution, so the
 * file never inherits the preview canvas's size.
 */
async function drawPaintedLayer(
  context: CanvasRenderingContext2D,
  preset: MediaCompositionPreset,
  region: LayoutRegion,
  layer: EvaluatedFrameLayer,
  painter: PostStudioLayerPainter,
  timeSeconds: number | undefined,
  cornerRadius: number
): Promise<void> {
  const pixels = outputRegion(preset, region);
  const width = Math.round(pixels.width);
  const height = Math.round(pixels.height);
  if (width <= 0 || height <= 0) return;
  await painter.prepare({ width, height });
  const surface = paintSurfaceGeometry(painter, { width, height });

  const geometry = resolveFrameLayerGeometry({
    preset,
    region,
    sourceWidth: pixels.width,
    sourceHeight: pixels.height,
    transform: layer.transform,
  });
  context.save();
  turnAboutCentre(context, pixels, region.turn ?? 0);
  traceRoundedRect(
    context,
    {
      x: pixels.x - surface.rect.x,
      y: pixels.y - surface.rect.y,
      width: pixels.width + surface.width - width,
      height: pixels.height + surface.height - height,
    },
    cornerRadius
  );
  context.clip();
  context.globalAlpha = layer.opacity;
  if (!painter.ownsTransform) applyLayerTransform(context, geometry);
  painter.paint(context, geometry.drawRect, toPaintFrame(layer, timeSeconds));
  context.restore();
}

/**
 * Draws one evaluated timestamp into the MP4 canvas. It intentionally reads
 * only source surfaces from the DOM; visibility, timing, opacity, region order,
 * fit, and transforms all come from the shared evaluator and preset model.
 */
export async function renderPostStudioFrame(
  input: RenderPostStudioFrameInput
): Promise<void> {
  // Not desynchronized: that draws into the front buffer, so the VideoFrame
  // captured from this canvas is no snapshot. The encoder read it while the
  // next frame was half drawn, and the file had frames with a region missing.
  const context = input.canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Could not create the post export canvas");

  context.save();
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 1;
  context.fillStyle = input.preset.output.backgroundColor;
  context.fillRect(0, 0, input.canvas.width, input.canvas.height);
  context.restore();
  await drawBackdrop(context, input);

  const regionOrder = new Map(
    [...input.preset.regions]
      .sort((left, right) => left.zIndex - right.zIndex)
      .map((region, index) => [region.id, index])
  );
  const clipOrder = new Map(
    input.preset.clips.map((clip, index) => [clip.id, index])
  );
  // The preview mounts one surface per role in each region. Split pieces can
  // both include their shared edge; the later piece owns that instant.
  const mountedLayers = new Map<string, EvaluatedFrameLayer>();
  for (const layer of input.layers) {
    const slot = JSON.stringify([layer.regionId, layer.sourceRole]);
    const previous = mountedLayers.get(slot);
    if (
      !previous ||
      (clipOrder.get(layer.clipId) ?? -1) >
        (clipOrder.get(previous.clipId) ?? -1)
    ) {
      mountedLayers.set(slot, layer);
    }
  }
  const orderedLayers = [...mountedLayers.values()].sort(
    (left, right) =>
      (regionOrder.get(left.regionId) ?? 0) -
        (regionOrder.get(right.regionId) ?? 0) ||
      (clipOrder.get(left.clipId) ?? 0) - (clipOrder.get(right.clipId) ?? 0)
  );

  const drawn: DrawnLayer[] = [];
  for (const layer of orderedLayers) {
    const staticRegion = input.preset.regions.find(
      (candidate) => candidate.id === layer.regionId
    );
    const clip = input.preset.clips.find(
      (candidate) => candidate.id === layer.clipId
    );
    if (!staticRegion || clip?.kind !== "visual") continue;
    // Where the region sits NOW, and how far it is turned. A region in
    // motion carries its rect on the layer; the static rect is only where it
    // rests, so its turn never leaks onto a moving one.
    const { turn: _restingTurn, ...resting } = staticRegion;
    const region: LayoutRegion = {
      ...resting,
      ...(layer.regionRect ?? staticRegion),
    };
    if (!layer.sourceGeometry && !regionRectIsOnFrame(region)) continue;
    drawn.push({
      layer,
      staticRegion,
      region,
      regionPixels: outputRegion(input.preset, region),
    });
  }

  // A region's edge wraps all of its layers: the shadow goes under the
  // first, the border over the last, at the most opaque layer's strength.
  const regionOpacity = new Map<string, number>();
  for (const { layer } of drawn) {
    regionOpacity.set(
      layer.regionId,
      Math.max(regionOpacity.get(layer.regionId) ?? 0, layer.opacity)
    );
  }

  for (const [index, entry] of drawn.entries()) {
    const { layer, region, regionPixels } = entry;
    const edge =
      !layer.sourceGeometry && region.edge
        ? regionEdgePixels(region.edge, regionPixels, input.preset.output)
        : null;
    const edgeOpacity = regionOpacity.get(layer.regionId) ?? layer.opacity;
    const turn = region.turn ?? 0;
    if (edge && drawn[index - 1]?.layer.regionId !== layer.regionId) {
      paintEdgeShadow(context, regionPixels, edge, edgeOpacity, turn);
    }
    await drawRegionLayer(context, input, entry, edge?.radius ?? 0);
    if (edge && drawn[index + 1]?.layer.regionId !== layer.regionId) {
      paintEdgeBorder(context, regionPixels, edge, edgeOpacity, turn);
    }
  }
  const blackOpacity = fadeBlackOpacityAt(
    input.preset,
    input.preset.duration.mode === "fixed" ? input.preset.duration.seconds : 0,
    input.timeSeconds ?? 0
  );
  if (blackOpacity > 0) {
    context.save();
    context.globalAlpha = blackOpacity;
    context.fillStyle = "#000";
    context.fillRect(0, 0, input.canvas.width, input.canvas.height);
    context.restore();
  }
}

interface DrawnLayer {
  layer: EvaluatedFrameLayer;
  staticRegion: LayoutRegion;
  /** The region where it sits at this frame. */
  region: LayoutRegion;
  regionPixels: PixelRect;
}

/** One layer, turned with its region and clipped to its rounded rect. */
async function drawRegionLayer(
  context: CanvasRenderingContext2D,
  input: RenderPostStudioFrameInput,
  { layer, staticRegion, region, regionPixels }: DrawnLayer,
  cornerRadius: number
): Promise<void> {
  const painter = input.painters?.get(layer.sourceRole);
  if (painter) {
    await drawPaintedLayer(
      context,
      input.preset,
      region,
      layer,
      painter,
      input.timeSeconds,
      cornerRadius
    );
    return;
  }

  const layerElement = layerElementForClip(input.root, layer.clipId);
  if (!layerElement) {
    // A visible layer with nothing mounted to read would render as an
    // empty region, and a file that is quietly missing a layer is worse
    // than one that fails and says why.
    throw new Error(
      `The ${staticRegion.label ?? layer.sourceRole} layer was not ready to render.`
    );
  }
  const colorGrade = input.preset.clips.find(
    (clip) => clip.kind === "visual" && clip.id === layer.clipId
  );
  if (layer.sourceGeometry) {
    const media = input.videoFrames?.has(layer.sourceRole)
      ? await input.videoFrames.frameFor(
          layer.sourceRole,
          layer.sourceTimeSeconds
        )
      : mediaIn(layerElement);
    if (!media) return;
    if (media instanceof HTMLVideoElement)
      await syncVideo(media, layer.sourceTimeSeconds);
    else if (media instanceof HTMLImageElement && !media.complete)
      await media.decode();
    const dimensions = mediaDimensions(media);
    if (dimensions.width <= 0 || dimensions.height <= 0) return;
    const geometry = resolveFrameLayerGeometry({
      preset: input.preset,
      region,
      sourceWidth: dimensions.width,
      sourceHeight: dimensions.height,
      transform: layer.transform,
      sourceGeometry: layer.sourceGeometry,
    });
    context.save();
    context.globalAlpha = layer.opacity;
    applyLayerTransform(context, geometry);
    context.filter = videoColorFilter(
      colorGrade?.kind === "visual" ? colorGrade.colorGrade : null
    );
    drawSource(context, media, geometry);
    context.restore();
    return;
  }
  context.save();
  turnAboutCentre(context, regionPixels, region.turn ?? 0);
  traceRoundedRect(context, regionPixels, cornerRadius);
  context.clip();
  context.globalAlpha = layer.opacity;

  const renderMode = layerElement.dataset.renderMode;
  if (renderMode === "arrangement") {
    const surface = layerElement.querySelector<HTMLElement>(
      "[data-arrangement-surface]"
    );
    if (!surface) throw new Error("Arrangement export surface is missing");
    const bounds = surface.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0)
      throw new Error("Arrangement export surface has no size");
    const scale = Math.max(
      1,
      regionPixels.width / bounds.width,
      regionPixels.height / bounds.height
    );
    const image = input.pictographCapture
      ? await input.pictographCapture.capture(
          surface,
          bounds.width,
          bounds.height,
          scale
        )
      : await (
          await import("modern-screenshot")
        ).domToCanvas(surface, {
          width: bounds.width,
          height: bounds.height,
          scale,
          ...POST_STUDIO_DOM_CAPTURE_OPTIONS,
        });
    const geometry = resolveFrameLayerGeometry({
      preset: input.preset,
      region: { ...region, fit: "fill" },
      sourceWidth: image.width,
      sourceHeight: image.height,
      transform: layer.transform,
    });
    applyLayerTransform(context, geometry);
    drawSource(context, image, geometry);
  } else if (renderMode === "sequence-animation") {
    // The preview lays this surface out to fill its region box, and a DOM
    // surface has no footage size to fit. Fitting a 1x1 stand-in with the
    // region's own "contain" drew the capture as a centred square, so a
    // non-square region came out narrower than on screen.
    const geometry = resolveFrameLayerGeometry({
      preset: input.preset,
      region: { ...region, fit: "fill" },
      sourceWidth: 1,
      sourceHeight: 1,
      transform: layer.transform,
    });
    applyLayerTransform(context, geometry);
    // Footage behind a tunnel intro shows through the panel until the canvas
    // settles, as it does on the live surface captured below.
    context.globalAlpha =
      layer.opacity * tunnelHookPanelOpacity(layer.tunnelHook, sampleEasing);
    context.fillStyle = input.preset.output.backgroundColor;
    context.fillRect(
      geometry.region.x,
      geometry.region.y,
      geometry.region.width,
      geometry.region.height
    );
    context.globalAlpha = layer.opacity;
    const animation = layerElement.querySelector<HTMLElement>(
      "[data-sequence-progress-visible]"
    );
    if (!animation) {
      throw new Error("Sequence animation export surface is missing");
    }
    await waitForTunnelHookArtwork(layerElement);
    if (animation.querySelector("[data-pictograph-motion]")) {
      await waitForPictographMotion(layerElement);
    }
    const bounds = animation.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      throw new Error("Sequence animation export surface has no size");
    }
    // The preview owns the label, path, header, effects, and progress layout.
    // Capturing its visible surface keeps every enabled layer in its real order.
    const scale = Math.max(1, regionPixels.width / bounds.width);
    const image = input.pictographCapture
      ? await input.pictographCapture.capture(
          animation,
          bounds.width,
          bounds.height,
          scale
        )
      : await (
          await import("modern-screenshot")
        ).domToCanvas(animation, {
          width: bounds.width,
          height: bounds.height,
          scale,
          ...POST_STUDIO_DOM_CAPTURE_OPTIONS,
        });
    drawSource(context, image, geometry);
  } else if (renderMode === "choreo-card") {
    const beat = layer.displayedBeatNumber ?? 0;
    // The capture is cached for the whole render, so a card whose box is
    // keyframed is captured at the frame's full width: one capture then
    // stays sharp at every size the move reaches.
    const boxAnimated = (input.preset.regionKeyframes ?? []).some(
      (track) => track.regionId === layer.regionId
    );
    const card = await captureCardLayer(
      layerElement,
      boxAnimated ? input.preset.output.width : regionPixels.width,
      `${layer.clipId}:${beat}`,
      input.cardFrameCache
    );
    const geometry = resolveFrameLayerGeometry({
      preset: input.preset,
      region,
      sourceWidth: card.width,
      sourceHeight: card.height,
      transform: layer.transform,
    });
    applyLayerTransform(context, geometry);
    drawSource(context, card, geometry);
  } else {
    const media = input.videoFrames?.has(layer.sourceRole)
      ? await input.videoFrames.frameFor(
          layer.sourceRole,
          layer.sourceTimeSeconds
        )
      : mediaIn(layerElement);
    if (!media) {
      context.restore();
      return;
    }
    if (media instanceof HTMLVideoElement) {
      await syncVideo(media, layer.sourceTimeSeconds);
    } else if (media instanceof HTMLImageElement && !media.complete) {
      await media.decode();
    }
    const dimensions = mediaDimensions(media);
    if (dimensions.width <= 0 || dimensions.height <= 0) {
      context.restore();
      return;
    }
    const geometry = resolveFrameLayerGeometry({
      preset: input.preset,
      region,
      sourceWidth: dimensions.width,
      sourceHeight: dimensions.height,
      transform: layer.transform,
    });
    applyLayerTransform(context, geometry);
    context.filter = videoColorFilter(
      colorGrade?.kind === "visual" ? colorGrade.colorGrade : null
    );
    drawSource(context, media, geometry);
  }

  context.restore();
}
