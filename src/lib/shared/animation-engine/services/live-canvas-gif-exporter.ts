import * as gifencModule from "gifenc";

// SSR loads gifenc's CommonJS entry; browser builds may select its ESM entry.
const gifencNamespace = gifencModule as typeof gifencModule & {
  default?: typeof gifencModule;
};
const { GIFEncoder, applyPalette, quantize } =
  typeof gifencNamespace.GIFEncoder === "function"
    ? gifencNamespace
    : gifencNamespace.default!;

/**
 * Read fresh on every call. `document.visibilityState` is a readonly property,
 * so a single inline comparison narrows it for the rest of the function and
 * survives every `await` - which would silently delete the guard that catches
 * the visitor switching tabs part-way through a capture.
 */
function isTabHidden(): boolean {
  return document.visibilityState === "hidden";
}

const GIF_FPS = 10;
const MAX_GIF_DIMENSION = 384;
const FRAME_WAIT_TIMEOUT_MS = 2_000;

export interface LiveCanvasGifExportOptions {
  durationMs: number;
  signal?: AbortSignal;
}

export function waitForAnimationFrame(signal?: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("GIF export cancelled", "AbortError"));
      return;
    }

    let frameId = 0;
    let timeoutId: number | undefined;
    let settled = false;

    const cleanup = () => {
      cancelAnimationFrame(frameId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abort);
    };

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const abort = () => {
      settle(() =>
        reject(new DOMException("GIF export cancelled", "AbortError"))
      );
    };

    signal?.addEventListener("abort", abort, { once: true });
    timeoutId = window.setTimeout(() => {
      settle(() =>
        reject(
          new Error(
            "GIF capture paused. Keep this tab visible while the animation is exported."
          )
        )
      );
    }, FRAME_WAIT_TIMEOUT_MS);
    frameId = requestAnimationFrame((time) => {
      settle(() => resolve(time));
    });
  });
}

function getCaptureDimensions(canvas: HTMLCanvasElement): {
  width: number;
  height: number;
} {
  const scale = Math.min(
    1,
    MAX_GIF_DIMENSION / Math.max(canvas.width, canvas.height)
  );
  return {
    width: Math.max(1, Math.round(canvas.width * scale)),
    height: Math.max(1, Math.round(canvas.height * scale)),
  };
}

function orderedCanvasLayers(canvas: HTMLCanvasElement): HTMLCanvasElement[] {
  const container = canvas.parentElement;
  if (!container) return [canvas];

  return [...container.querySelectorAll("canvas")]
    .filter((layer) => {
      const style = getComputedStyle(layer);
      return (
        layer.width > 0 &&
        layer.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    })
    .sort((left, right) => {
      const leftZIndex =
        Number.parseInt(getComputedStyle(left).zIndex, 10) || 0;
      const rightZIndex =
        Number.parseInt(getComputedStyle(right).zIndex, 10) || 0;
      return leftZIndex - rightZIndex;
    });
}

function drawLiveCanvasStack(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): void {
  const container = canvas.parentElement;
  const background = container
    ? getComputedStyle(container).backgroundColor
    : "";
  // GIF's palette path has no reliable partial-alpha equivalent. Match the
  // animator's normal light surface when an embed intentionally uses a
  // transparent wrapper so frames never inherit pixels from a prior draw.
  context.clearRect(0, 0, width, height);
  context.fillStyle =
    background &&
    background !== "rgba(0, 0, 0, 0)" &&
    background !== "transparent"
      ? background
      : "#f5f5f5";
  context.fillRect(0, 0, width, height);

  for (const layer of orderedCanvasLayers(canvas)) {
    const opacity = Number.parseFloat(getComputedStyle(layer).opacity);
    if (Number.isFinite(opacity) && opacity <= 0) continue;
    context.globalAlpha = Number.isFinite(opacity) ? opacity : 1;
    context.drawImage(
      layer,
      0,
      0,
      layer.width,
      layer.height,
      0,
      0,
      width,
      height
    );
  }
  context.globalAlpha = 1;
}

/**
 * Records the actual canvas frames instead of rebuilding the animation in a
 * second renderer. That keeps the downloaded GIF aligned with every setting
 * currently visible in the animator, including live effects and prop textures.
 */
export async function exportLiveCanvasAsGif(
  canvas: HTMLCanvasElement,
  { durationMs, signal }: LiveCanvasGifExportOptions
): Promise<Blob> {
  if (canvas.width === 0 || canvas.height === 0) {
    throw new Error(
      "The animation is still loading. Try GIF export again in a moment."
    );
  }
  if (isTabHidden()) {
    throw new Error("Keep this tab visible while the animation is exported.");
  }

  const { width, height } = getCaptureDimensions(canvas);
  const frameCanvas = document.createElement("canvas");
  frameCanvas.width = width;
  frameCanvas.height = height;
  const context = frameCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("GIF export could not prepare a canvas.");

  const encoder = GIFEncoder();
  const frameDelayMs = 1_000 / GIF_FPS;
  const totalFrames = Math.max(2, Math.ceil(durationMs / frameDelayMs));
  const startTime = await waitForAnimationFrame(signal);

  for (let frame = 0; frame < totalFrames; frame++) {
    if (signal?.aborted) {
      throw new DOMException("GIF export cancelled", "AbortError");
    }
    const targetTime = startTime + frame * frameDelayMs;
    let renderTime =
      frame === 0 ? startTime : await waitForAnimationFrame(signal);
    while (renderTime < targetTime) {
      renderTime = await waitForAnimationFrame(signal);
    }
    if (renderTime - targetTime > frameDelayMs * 1.5) {
      throw new Error(
        "GIF capture could not keep up with this animation. Try again after closing other tabs."
      );
    }

    if (isTabHidden()) {
      throw new Error(
        "GIF capture paused. Keep this tab visible while the animation is exported."
      );
    }

    drawLiveCanvasStack(context, canvas, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const palette = quantize(pixels, 256, { format: "rgb444" });
    const indexedPixels = applyPalette(pixels, palette, "rgb444");
    if (signal?.aborted) {
      throw new DOMException("GIF export cancelled", "AbortError");
    }
    encoder.writeFrame(indexedPixels, width, height, {
      palette,
      delay: Math.round(frameDelayMs),
      repeat: 0,
    });
  }

  encoder.finish();
  // A Uint8Array over ArrayBufferLike is a perfectly good BlobPart at runtime;
  // the current lib.dom union just does not spell it that way.
  return new Blob([encoder.bytes() as BlobPart], { type: "image/gif" });
}

export function downloadGif(blob: Blob, filename: string): void {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
