import { fitOpenerImage } from "$lib/shared/share/domain/video-opener";

export type VideoOpenerImage =
  | HTMLImageElement
  | HTMLCanvasElement
  | ImageBitmap;

function imageSize(image: VideoOpenerImage): { width: number; height: number } {
  if (
    typeof HTMLImageElement !== "undefined" &&
    image instanceof HTMLImageElement
  ) {
    return { width: image.naturalWidth, height: image.naturalHeight };
  }
  return { width: image.width, height: image.height };
}

/**
 * Paints one opener frame: opaque black, then the image contain-fit and
 * centered. Black matches the flatten the encoder applies to every animation
 * frame, so the hold and the first animated frame share a background.
 */
export function drawOpenerFrame(
  ctx: CanvasRenderingContext2D,
  image: VideoOpenerImage,
  frameWidth: number,
  frameHeight: number
): void {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, frameWidth, frameHeight);
  const size = imageSize(image);
  const rect = fitOpenerImage({
    imageWidth: size.width,
    imageHeight: size.height,
    frameWidth,
    frameHeight,
  });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

/** Decodes a data or blob URL into a drawable image, or null on failure. */
export function loadOpenerImage(url: string): Promise<HTMLImageElement | null> {
  if (!url || typeof Image === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}
