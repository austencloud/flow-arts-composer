import { refreshInteractiveCanvasFrame } from "$lib/shared/3d/rendering/interactive-canvas-frame";

/** Edge length of the square poster thumbnail stored per saved tunnel. Small so
 *  the WebP data URL stays a few KB (well under the Firestore 1MB doc limit),
 *  and because every tunnel in the collection grid ships its poster inside its
 *  own document — this one is a thumbnail and is sized like one. The much larger
 *  DISCOVERY_POSTER_SIZE below is a separate image that lives in Storage. */
export const POSTER_SIZE = 200;

/** Edge length of the world-readable discovery poster uploaded at publish time.
 *  Explore renders artwork edge-to-edge on a plinth that reaches ~950 CSS px on
 *  a 4K canvas, so a 200px thumbnail upscales ~4.8x and reads as blocks. 1024
 *  covers the widest card 1:1. */
export const DISCOVERY_POSTER_SIZE = 1024;

/**
 * Edge length of the offscreen stage the discovery poster is rendered on, before
 * being downscaled into DISCOVERY_POSTER_SIZE. Supersampling buys two things at
 * once: smoother strokes, and a materially smaller file, because the downscale
 * averages away the high-frequency speckle that WebP spends its bits on.
 *
 * Measured on a real glow-heavy tunnel, three captures each: rendering 1:1 at
 * 1024 produced 132/175/176 KB against the 200 KB Storage rule — one bad frame
 * from being rejected. The same tunnel rendered at 1536 and downscaled produced
 * 142/133/123 KB. The headroom is the point, not the sharpness alone.
 */
export const DISCOVERY_RENDER_SIZE = 1536;

/** Storage rule ceiling for `public-artifacts/**` (see storage.rules). */
export const POSTER_MAX_BYTES = 200 * 1024;

/** Tried in order until one fits POSTER_MAX_BYTES. */
export const POSTER_QUALITIES = [0.85, 0.7, 0.55] as const;

type CanvasFactory = () => HTMLCanvasElement;

const defaultFactory: CanvasFactory = () => document.createElement("canvas");

/** base64 carries 3 bytes per 4 characters; the data-URL header is negligible. */
function dataUrlBytes(dataUrl: string): number {
  return (dataUrl.length * 3) / 4;
}

/**
 * Encode a canvas as WebP, stepping quality down until the result fits
 * `POSTER_MAX_BYTES`. Returns the last (smallest) attempt if none fit, so the
 * caller still gets an image and the Storage rule is what rejects it, loudly.
 */
export function encodePosterWithinBudget(
  canvas: HTMLCanvasElement,
  maxBytes = POSTER_MAX_BYTES
): string {
  let dataUrl = "";
  for (const quality of POSTER_QUALITIES) {
    dataUrl = canvas.toDataURL("image/webp", quality);
    if (dataUrlBytes(dataUrl) <= maxBytes) return dataUrl;
  }
  return dataUrl;
}

/**
 * Downscale a rendered canvas to a WebP data URL of the requested size,
 * cover-fitting (center-crop to the target's aspect ratio) so the poster is
 * fully covered with no letterboxing. Returns "" if the source is empty or a 2D
 * context can't be obtained.
 *
 * Square is the default because a tunnel's roughly-circular pattern fills one.
 * Widescreen callers pass their own box: a film is 16:9, and center-cropping its
 * frame to a square removes the left and right thirds — exactly where the outer
 * performers stand in a group reveal.
 */
export function capturePosterFrame(
  source: HTMLCanvasElement,
  {
    width = POSTER_SIZE,
    height = POSTER_SIZE,
    makeCanvas = defaultFactory,
  }: {
    width?: number;
    height?: number;
    makeCanvas?: CanvasFactory;
  } = {}
): string {
  const sw = source.width;
  const sh = source.height;
  if (!sw || !sh || width <= 0 || height <= 0) return "";

  const target = makeCanvas();
  target.width = width;
  target.height = height;
  const ctx = target.getContext("2d");
  if (!ctx) return "";

  refreshInteractiveCanvasFrame(source);

  // Cover fit: take the largest centered source rect matching the target's
  // aspect ratio, then scale it to fill.
  const targetAspect = width / height;
  const cropWidth = Math.min(sw, sh * targetAspect);
  const cropHeight = Math.min(sh, sw / targetAspect);
  const sx = (sw - cropWidth) / 2;
  const sy = (sh - cropHeight) / 2;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(source, sx, sy, cropWidth, cropHeight, 0, 0, width, height);

  return target.toDataURL("image/webp", 0.8);
}

/**
 * Downscale a rendered tunnel canvas to a POSTER_SIZE² WebP data URL. Cover-fits
 * (center-crop) so the roughly-circular pattern fills the square. Returns "" if
 * the source is empty or a 2D context can't be obtained.
 */
export function captureTunnelPoster(
  source: HTMLCanvasElement,
  makeCanvas: CanvasFactory = defaultFactory
): string {
  return capturePosterFrame(source, { makeCanvas });
}

/**
 * Composite EVERY rendered `<canvas>` layer inside a stage container (props +
 * trails + effect overlays — DOM order ≈ paint/z-order) into one square canvas.
 * The tunnel renders in stacked sibling canvases, so grabbing just the first one
 * loses the trails/effects; this overlays them all so the image matches what the
 * user sees. Each layer overlays the same stage box, so each is cropped to its
 * own centered square and drawn into the full target. Returns null if there is no
 * drawable layer / no 2D context. (A WebGL layer without preserveDrawingBuffer
 * may draw empty — harmless: it composites transparent over the 2D layers.)
 *
 * Separate from the encode step because the publish-time renderer polls this at a
 * tiny size to find out whether the stage has drawn anything yet; it needs the
 * pixels, not a data URL.
 */
export function compositeContainerLayers(
  container: HTMLElement | null | undefined,
  size: number,
  makeCanvas: CanvasFactory = defaultFactory,
  sortByZIndex = false
): HTMLCanvasElement | null {
  if (!container || size <= 0) return null;
  const layers = Array.from(container.querySelectorAll("canvas")).filter(
    (c) =>
      c.width > 0 &&
      c.height > 0 &&
      (!sortByZIndex ||
        (getComputedStyle(c).display !== "none" &&
          getComputedStyle(c).visibility !== "hidden"))
  );
  if (sortByZIndex) {
    layers.sort((left, right) => {
      const leftZ = Number.parseInt(getComputedStyle(left).zIndex, 10) || 0;
      const rightZ = Number.parseInt(getComputedStyle(right).zIndex, 10) || 0;
      return leftZ - rightZ;
    });
  }
  if (layers.length === 0) return null;

  const target = makeCanvas();
  target.width = size;
  target.height = size;
  const ctx = target.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, size, size);

  for (const layer of layers) {
    refreshInteractiveCanvasFrame(layer);
    const ls = Math.min(layer.width, layer.height);
    const lsx = (layer.width - ls) / 2;
    const lsy = (layer.height - ls) / 2;
    try {
      ctx.drawImage(layer, lsx, lsy, ls, ls, 0, 0, size, size);
    } catch {
      // A cross-origin-tainted or unreadable layer — skip it, keep the rest.
    }
  }

  return target;
}

/**
 * The composite above, encoded as a square WebP data URL. Returns "" when there
 * is nothing to draw.
 *
 * `size` defaults to the small in-document thumbnail. Publish-time callers pass
 * DISCOVERY_POSTER_SIZE and `budgetBytes` to get the Storage-hosted image.
 */
export function capturePosterFromContainer(
  container: HTMLElement | null | undefined,
  {
    size = POSTER_SIZE,
    budgetBytes,
    makeCanvas = defaultFactory,
  }: {
    size?: number;
    budgetBytes?: number;
    makeCanvas?: CanvasFactory;
  } = {}
): string {
  const target = compositeContainerLayers(container, size, makeCanvas);
  if (!target) return "";

  return budgetBytes === undefined
    ? target.toDataURL("image/webp", 0.8)
    : encodePosterWithinBudget(target, budgetBytes);
}
