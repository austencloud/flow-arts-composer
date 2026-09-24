import type { MediaCompositionPreset } from "$lib/shared/media-composition/domain/media-composition-preset-schema";
import type { LayoutRegion } from "$lib/shared/media-composition/domain/media-layout-schema";
import {
  regionRectIsOnFrame,
  type EvaluatedFrameLayer,
} from "$lib/shared/media-composition/services/frame-evaluator";
import type { PostStudioLayerPainter } from "$lib/shared/media-composition/services/post-studio-layer-painter";
import {
  calculateMediaFit,
  resolvePanOffset,
  type PixelRect,
} from "$lib/shared/media-composition/services/media-fit";

export interface FrameLayerGeometry {
  region: PixelRect;
  drawRect: PixelRect;
  rotationDegrees: number;
  scale: number;
  translateX: number;
  translateY: number;
  flipHorizontal: boolean;
}

export interface RenderPostStudioFrameInput {
  canvas: HTMLCanvasElement;
  root: HTMLElement;
  preset: MediaCompositionPreset;
  layers: readonly EvaluatedFrameLayer[];
  cardFrameCache: Map<string, HTMLCanvasElement>;
  /** Painted sources by role. A painted layer never reads the DOM. */
  painters?: ReadonlyMap<string, PostStudioLayerPainter>;
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
}): FrameLayerGeometry {
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
  context.drawImage(
    source,
    geometry.drawRect.x,
    geometry.drawRect.y,
    geometry.drawRect.width,
    geometry.drawRect.height
  );
}

function mediaDimensions(
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
  const bounds = cardElement.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    throw new Error("Choreo card export surface has no size");
  }

  const { domToCanvas } = await import("modern-screenshot");
  const canvas = await domToCanvas(cardElement, {
    width: bounds.width,
    height: bounds.height,
    scale: targetWidth / bounds.width,
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

/**
 * A painted layer draws straight into the output at output resolution, so the
 * file never inherits the preview canvas's size.
 */
async function drawPaintedLayer(
  context: CanvasRenderingContext2D,
  preset: MediaCompositionPreset,
  region: LayoutRegion,
  layer: EvaluatedFrameLayer,
  painter: PostStudioLayerPainter
): Promise<void> {
  const pixels = outputRegion(preset, region);
  const width = Math.round(pixels.width);
  const height = Math.round(pixels.height);
  if (width <= 0 || height <= 0) return;
  await painter.prepare({ width, height });

  const geometry = resolveFrameLayerGeometry({
    preset,
    region,
    sourceWidth: pixels.width,
    sourceHeight: pixels.height,
    transform: layer.transform,
  });
  context.save();
  context.beginPath();
  context.rect(pixels.x, pixels.y, pixels.width, pixels.height);
  context.clip();
  context.globalAlpha = layer.opacity;
  applyLayerTransform(context, geometry);
  painter.paint(context, geometry.drawRect, {
    sequencePosition: layer.sequencePosition,
    carouselPosition: layer.carouselPosition,
    displayedBeatNumber: layer.displayedBeatNumber,
    projectProgress: layer.projectProgress,
    sourceTimeSeconds: layer.sourceTimeSeconds,
  });
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
  const context = input.canvas.getContext("2d", {
    alpha: false,
    desynchronized: true,
  });
  if (!context) throw new Error("Could not create the post export canvas");

  context.save();
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 1;
  context.fillStyle = input.preset.output.backgroundColor;
  context.fillRect(0, 0, input.canvas.width, input.canvas.height);
  context.restore();

  const regionOrder = new Map(
    [...input.preset.regions]
      .sort((left, right) => left.zIndex - right.zIndex)
      .map((region, index) => [region.id, index])
  );
  const clipOrder = new Map(
    input.preset.clips.map((clip, index) => [clip.id, index])
  );
  const orderedLayers = [...input.layers].sort(
    (left, right) =>
      (regionOrder.get(left.regionId) ?? 0) -
        (regionOrder.get(right.regionId) ?? 0) ||
      (clipOrder.get(left.clipId) ?? 0) - (clipOrder.get(right.clipId) ?? 0)
  );

  for (const layer of orderedLayers) {
    const staticRegion = input.preset.regions.find(
      (candidate) => candidate.id === layer.regionId
    );
    const clip = input.preset.clips.find(
      (candidate) => candidate.id === layer.clipId
    );
    if (!staticRegion || clip?.kind !== "visual") continue;
    // Where the region sits NOW. A region in motion carries its rect on the
    // layer; the static rect is only where it rests.
    const region: LayoutRegion = { ...staticRegion, ...layer.regionRect };
    if (!regionRectIsOnFrame(region)) continue;

    const regionPixels = outputRegion(input.preset, region);
    const painter = input.painters?.get(layer.sourceRole);
    if (painter) {
      await drawPaintedLayer(context, input.preset, region, layer, painter);
      continue;
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
    context.save();
    context.beginPath();
    context.rect(
      regionPixels.x,
      regionPixels.y,
      regionPixels.width,
      regionPixels.height
    );
    context.clip();
    context.globalAlpha = layer.opacity;

    const renderMode = layerElement.dataset.renderMode;
    if (renderMode === "sequence-animation") {
      const geometry = resolveFrameLayerGeometry({
        preset: input.preset,
        region,
        sourceWidth: 1,
        sourceHeight: 1,
        transform: layer.transform,
      });
      applyLayerTransform(context, geometry);
      context.fillStyle = input.preset.output.backgroundColor;
      context.fillRect(
        geometry.region.x,
        geometry.region.y,
        geometry.region.width,
        geometry.region.height
      );
      const canvases = [...layerElement.querySelectorAll("canvas")].sort(
        (left, right) =>
          Number.parseFloat(getComputedStyle(left).zIndex || "0") -
          Number.parseFloat(getComputedStyle(right).zIndex || "0")
      );
      for (const canvas of canvases) {
        drawSource(context, canvas, geometry);
      }
    } else if (renderMode === "choreo-card") {
      const beat = layer.displayedBeatNumber ?? 0;
      const card = await captureCardLayer(
        layerElement,
        regionPixels.width,
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
      const media =
        layerElement.querySelector<HTMLVideoElement>("video") ??
        layerElement.querySelector<HTMLImageElement>("img");
      if (!media) {
        context.restore();
        continue;
      }
      if (media instanceof HTMLVideoElement) {
        await syncVideo(media, layer.sourceTimeSeconds);
      } else if (!media.complete) {
        await media.decode();
      }
      const dimensions = mediaDimensions(media);
      if (dimensions.width <= 0 || dimensions.height <= 0) {
        context.restore();
        continue;
      }
      const geometry = resolveFrameLayerGeometry({
        preset: input.preset,
        region,
        sourceWidth: dimensions.width,
        sourceHeight: dimensions.height,
        transform: layer.transform,
      });
      applyLayerTransform(context, geometry);
      drawSource(context, media, geometry);
    }

    context.restore();
  }
}
