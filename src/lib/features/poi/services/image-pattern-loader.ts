import type { StripPattern, StripFrame } from "#lib/shared/poi/domain/strip-pattern.js";

/**
 * Converts raster images into StripPattern data.
 *
 * Two modes:
 * - **Disc mode** (default): Tiles the image around the disc with pre-warping
 *   so each copy appears undistorted. Same approach as Ignis Pixel Utility.
 *   The image repeats N times around the circle, wider at the outer edge,
 *   narrower near the hub - compensating for the polar geometry.
 *
 * - **Strip mode**: Raw import - each column = one frame, each row = one LED.
 *   For pre-made POV strip images from other tools.
 */

/**
 * Hub fraction - must match the disc renderer's innerRadius ratio.
 */
export const HUB_FRACTION = 0.15;

/**
 * Default: tiled disc mapping with pre-warping.
 */
export function fromImageData(imageData: ImageData, targetLedCount: number): StripPattern {
  return fromDiscImage(imageData, targetLedCount);
}

/**
 * Tiled + pre-warped disc mapping.
 *
 * 1. Calculates how many times the image tiles around the disc based on
 *    its aspect ratio (so each copy has correct proportions at mid-radius).
 * 2. For each strip pixel (frame, led), maps to the source image with
 *    radius-dependent horizontal scaling - wider at outer edge, narrower
 *    near hub - so the disc preview shows undistorted copies.
 */
export function fromDiscImage(imageData: ImageData, targetLedCount: number): StripPattern {
  const { width: imgW, height: imgH, data: pixelData } = imageData;

  const hubFrac = HUB_FRACTION;
  const ringHeight = 1.0 - hubFrac; // 0.85

  // How many tiles around the disc?
  // At mid-radius, the image should have correct aspect ratio.
  const midR = (hubFrac + 1.0) / 2;
  const imageAspect = imgW / imgH;
  const tileCount = Math.max(1, Math.round(
    (2 * Math.PI * midR) / (ringHeight * imageAspect)
  ));

  // Angular span of one tile
  const tileAngle = (2 * Math.PI) / tileCount;

  // Frame count: enough for smooth rendering without being excessive
  // ~4px per LED at outer circumference gives good quality
  const frameCount = Math.max(360, Math.min(1440, tileCount * imgW));

  const frames: StripFrame[] = [];

  for (let f = 0; f < frameCount; f++) {
    const angle = (f / frameCount) * 2 * Math.PI;
    const colors = new Uint8Array(targetLedCount * 3);

    for (let led = 0; led < targetLedCount; led++) {
      const t = (led + 0.5) / targetLedCount;

      // Straight angle-to-x mapping: angle within tile → image x
      // The polar geometry naturally makes the image wider at the outer
      // edge and narrower near the hub (same as Ignis pre-warp effect)
      const srcX = ((angle % tileAngle) / tileAngle) * (imgW - 1);
      const srcY = t * (imgH - 1);

      // Bilinear interpolation
      const x0 = Math.floor(srcX);
      const y0 = Math.floor(srcY);
      const x1 = Math.min(x0 + 1, imgW - 1);
      const y1 = Math.min(y0 + 1, imgH - 1);
      const fx = srcX - x0;
      const fy = srcY - y0;

      const idx00 = (y0 * imgW + x0) * 4;
      const idx10 = (y0 * imgW + x1) * 4;
      const idx01 = (y1 * imgW + x0) * 4;
      const idx11 = (y1 * imgW + x1) * 4;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const offset = led * 3;
      colors[offset] = Math.round(
        pixelData[idx00]! * w00 + pixelData[idx10]! * w10 +
        pixelData[idx01]! * w01 + pixelData[idx11]! * w11
      );
      colors[offset + 1] = Math.round(
        pixelData[idx00 + 1]! * w00 + pixelData[idx10 + 1]! * w10 +
        pixelData[idx01 + 1]! * w01 + pixelData[idx11 + 1]! * w11
      );
      colors[offset + 2] = Math.round(
        pixelData[idx00 + 2]! * w00 + pixelData[idx10 + 2]! * w10 +
        pixelData[idx01 + 2]! * w01 + pixelData[idx11 + 2]! * w11
      );
    }

    frames.push({ colors });
  }

  return {
    ledCount: targetLedCount,
    frameCount,
    frames,
    metadata: {
      name: "Image Upload",
      source: "image-upload",
      createdAt: Date.now(),
    },
  };
}

/**
 * Strip mode - each column = one frame, each row = one LED.
 * For importing pre-made POV strip images from other tools.
 */
export function fromStripImage(imageData: ImageData, targetLedCount: number): StripPattern {
  const sourceHeight = imageData.height;
  const sourceWidth = imageData.width;

  let pixelData: Uint8ClampedArray;
  let width: number;
  let height: number;

  if (sourceHeight !== targetLedCount) {
    const canvas = new OffscreenCanvas(sourceWidth, targetLedCount);
    const ctx = canvas.getContext("2d")!;
    const tempCanvas = new OffscreenCanvas(sourceWidth, sourceHeight);
    const tempCtx = tempCanvas.getContext("2d")!;
    tempCtx.putImageData(imageData, 0, 0);
    ctx.drawImage(tempCanvas, 0, 0, sourceWidth, sourceHeight, 0, 0, sourceWidth, targetLedCount);
    const resized = ctx.getImageData(0, 0, sourceWidth, targetLedCount);
    pixelData = resized.data;
    width = sourceWidth;
    height = targetLedCount;
  } else {
    pixelData = imageData.data;
    width = sourceWidth;
    height = sourceHeight;
  }

  const frames: StripFrame[] = [];
  for (let col = 0; col < width; col++) {
    const colors = new Uint8Array(height * 3);
    for (let row = 0; row < height; row++) {
      const srcIdx = (row * width + col) * 4;
      const dstIdx = row * 3;
      colors[dstIdx] = pixelData[srcIdx]!;
      colors[dstIdx + 1] = pixelData[srcIdx + 1]!;
      colors[dstIdx + 2] = pixelData[srcIdx + 2]!;
    }
    frames.push({ colors });
  }

  return {
    ledCount: height,
    frameCount: width,
    frames,
    metadata: {
      name: "Image Upload",
      source: "image-upload",
      createdAt: Date.now(),
    },
  };
}

export async function fromFile(file: File, targetLedCount: number): Promise<StripPattern> {
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();

  const pattern = fromImageData(imageData, targetLedCount);
  pattern.metadata.sourceImagePath = file.name;
  pattern.metadata.name = file.name.replace(/\.[^.]+$/, "");
  return pattern;
}
