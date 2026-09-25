import type { DrawableImage } from "./svg-image-cache";

/**
 * Decode a raster asset served from static/ (the element glyph WebPs) for
 * Canvas2D drawing.
 *
 * Browsers and workers fetch the file and decode it with createImageBitmap.
 * Node renders (pictograph CLI, server route) have no createImageBitmap, and
 * node-canvas cannot decode WebP, so the Node path reads the PNG that ships
 * beside each WebP straight from static/ and decodes it with node-canvas.
 *
 * Returns null when the browser fetch is not ok, so callers can skip a
 * missing asset quietly.
 */
export async function loadRasterImage(url: string): Promise<DrawableImage | null> {
  if (typeof createImageBitmap === "function") {
    const response = await fetch(url);
    if (!response.ok) return null;
    return createImageBitmap(await response.blob());
  }

  const [{ loadImage }, path] = await Promise.all([
    import("canvas"),
    import("path"),
  ]);
  const relativePath = url.replace(/^\//, "").replace(/\.webp$/i, ".png");
  const image = await loadImage(path.join(process.cwd(), "static", relativePath));
  return image as unknown as DrawableImage;
}
