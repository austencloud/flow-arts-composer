/**
 * Step Number Compositor
 *
 * Composites a step number ON TOP of an already-rendered, number-free
 * pictograph cell blob, producing a new blob whose number is baked into the
 * pixels. This keeps the expensive persistent pictograph cache (pictographBlobCache)
 * shared across steps, while still making the number part of the
 * cell IMAGE — so it dissolves in perfect sync during the viewer's crossfade
 * instead of floating above it as a separate DOM layer (which read as a flash on
 * thin text).
 *
 * The number art matches the printed-deck pipeline exactly (reuses
 * drawStepNumber), so live preview and exported cards render the number
 * identically.
 */

import { drawStepNumber } from "#lib/shared/render/services/step-number-renderer.js";

/**
 * Draw `stepNumber` onto a copy of `baseBlob` and return the composited blob.
 * `size` is the cell's rendered height in px; `widthMultiplier` widens
 * duration-expanded cells (the number stays anchored top-left either way).
 */
export async function compositeStepNumberOnBlob(
  baseBlob: Blob,
  stepNumber: number,
  size: number,
  isDarkMode: boolean,
  widthMultiplier: number = 1,
): Promise<Blob> {
  const width = Math.round(size * (widthMultiplier || 1));
  const height = Math.round(size);

  const bitmap = await createImageBitmap(baseBlob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return baseBlob; // no 2D context — fall back to the number-free base

    ctx.drawImage(bitmap, 0, 0, width, height);
    // x=0,y=0 with cellSize=size reproduces the top-left placement + scale that
    // drawStepNumber uses for printed cards (50/950 of the cell from each edge).
    drawStepNumber(ctx, stepNumber, 0, 0, size, isDarkMode);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("step-number composite toBlob failed"))),
        "image/webp",
        0.92,
      );
    });
  } finally {
    bitmap.close();
  }
}
