import type { LayoutRegion } from "@austencloud/video-editor/core";
import type {
  PaintFrame,
  PaintRect,
  PostStudioLayerPainter,
} from "@austencloud/video-editor/render";
import {
  COMET_DEFAULT_TAPER,
  cometLookAt,
  type PostCometTrails,
} from "#lib/shared/media-composition/domain/comet-trails.js";
import {
  createCometReplay,
  decodeCometLightMap,
  type CometLightMap,
  type CometReplay,
} from "#lib/shared/media-composition/domain/comet-light-map.js";
import { createStaffPointMapper } from "./staff-effect-painter";

/**
 * Draws a video clip's comet trails: its light map replayed to the frame's
 * footage time, lit for the clip's tail length and brightness at that time,
 * then screened over the footage with the footage's own fit, crop, pan, turn
 * and flip. Preview and export run this same painter.
 */

const maps = new Map<string, Promise<CometLightMap>>();

/** A light map by URL, fetched and read once per page. */
export function loadCometLightMap(url: string): Promise<CometLightMap> {
  let found = maps.get(url);
  if (!found) {
    found = fetch(url)
      .then((response) => {
        if (!response.ok)
          throw new Error(`Light map ${url}: ${response.status}`);
        return response.arrayBuffer();
      })
      .then(decodeCometLightMap);
    // A failed fetch may succeed once the map is written; ask again next time.
    found.catch(() => maps.delete(url));
    maps.set(url, found);
  }
  return found;
}

export interface CometTrailsSource {
  /** The clip's comet settings, or null when it has none. */
  trails(): PostCometTrails | null;
  /** How the clip's slot fits its footage. */
  fit(): LayoutRegion["fit"];
}

type Surface = HTMLCanvasElement | OffscreenCanvas;

function makeSurface(width: number, height: number): Surface | null {
  if (typeof OffscreenCanvas !== "undefined")
    return new OffscreenCanvas(width, height);
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * The preview stacks each painted layer in its own canvas over the video, so
 * the screen has to happen between the layers, not inside the canvas. An
 * export draws straight onto the footage and screens there instead.
 */
function screenPreviewLayer(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
): void {
  const canvas = context.canvas;
  if (typeof HTMLCanvasElement === "undefined") return;
  if (!(canvas instanceof HTMLCanvasElement) || !canvas.isConnected) return;
  const layer = canvas.closest<HTMLElement>(".painted") ?? canvas;
  if (layer.style.mixBlendMode !== "screen") layer.style.mixBlendMode = "screen";
}

export function createCometTrailsPainter(
  source: CometTrailsSource
): PostStudioLayerPainter {
  let replay: { url: string; replay: CometReplay } | null = null;
  let surface: { url: string; canvas: Surface } | null = null;
  let drawn: { x: number; y: number; width: number; height: number } | null =
    null;
  let loading: string | null = null;

  function ensure(url: string): CometReplay | null {
    if (replay?.url === url) return replay.replay;
    if (loading !== url) {
      loading = url;
      void loadCometLightMap(url)
        .then((map) => {
          if (loading === url) {
            replay = { url, replay: createCometReplay(map) };
            surface = null;
            drawn = null;
          }
        })
        .catch((error: unknown) => {
          console.error("[PostStudio] Comet light map unavailable:", error);
          if (loading === url) loading = null;
        });
    }
    return null;
  }

  return {
    ownsTransform: true,
    async prepare() {
      const trails = source.trails();
      if (!trails) return;
      if (replay?.url === trails.map) return;
      const map = await loadCometLightMap(trails.map);
      if (replay?.url !== trails.map) {
        replay = { url: trails.map, replay: createCometReplay(map) };
        surface = null;
        drawn = null;
        loading = trails.map;
      }
    },
    paint(context, rect: PaintRect, frame: PaintFrame) {
      const trails = source.trails();
      if (!trails) return;
      const active = ensure(trails.map);
      if (!active) return;
      const seconds = frame.sourceTimeSeconds;
      const look = cometLookAt(trails, seconds);
      active.seek(seconds);
      const light = active.light({
        ...look,
        taper: trails.taper ?? COMET_DEFAULT_TAPER,
      });
      if (!light) return;

      const map = active.map;
      if (surface?.url !== trails.map) {
        const canvas = makeSurface(map.width, map.height);
        if (!canvas) return;
        surface = { url: trails.map, canvas };
        drawn = null;
      }
      const lightContext = surface.canvas.getContext("2d") as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null;
      if (!lightContext) return;
      if (drawn)
        lightContext.clearRect(drawn.x, drawn.y, drawn.width, drawn.height);
      lightContext.putImageData(
        new ImageData(light.rgba, light.width, light.height),
        light.x,
        light.y
      );
      drawn = light;

      // The footage's framing, as one map from picture fractions to pixels.
      const place = createStaffPointMapper({
        rect,
        sourceWidth: map.sourceWidth,
        sourceHeight: map.sourceHeight,
        fit: source.fit(),
        transform: frame.transform,
        sourceGeometry: frame.sourceGeometry,
      });
      const origin = place(0, 0);
      const across = place(1, 0);
      const down = place(0, 1);

      screenPreviewLayer(context);
      context.save();
      context.beginPath();
      context.rect(rect.x, rect.y, rect.width, rect.height);
      context.clip();
      context.transform(
        (across.x - origin.x) / map.width,
        (across.y - origin.y) / map.width,
        (down.x - origin.x) / map.height,
        (down.y - origin.y) / map.height,
        origin.x,
        origin.y
      );
      // Only the part of the picture the clip shows.
      const crop = frame.sourceGeometry?.crop;
      if (crop) {
        context.beginPath();
        context.rect(
          crop.left * map.width,
          crop.top * map.height,
          (crop.right - crop.left) * map.width,
          (crop.bottom - crop.top) * map.height
        );
        context.clip();
      }
      context.globalCompositeOperation = "screen";
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(
        surface.canvas,
        light.x,
        light.y,
        light.width,
        light.height,
        light.x,
        light.y,
        light.width,
        light.height
      );
      context.restore();
    },
  };
}
