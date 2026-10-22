/**
 * SVG Image Cache
 *
 * Converts SVG strings to drawable images and caches them.
 * This is the key optimization - converting SVG once and reusing the image.
 *
 * Environment strategy:
 * - Main thread: HTMLImageElement (reliable SVG rendering via browser engine)
 * - Web Workers: ImageBitmap via createImageBitmap (only option without DOM)
 * - Node.js: canvas package's Image
 *
 * DrawableImage union type (ImageBitmap | HTMLImageElement) allows canvas
 * drawImage() to accept either type transparently.
 */

// TEMP assembly profiler — DECODE phase tap. Times the SVG→drawable miss path.

import { sanitizeSvgForBitmap } from "./svg-bitmap-sanitize";
import { assetFetch } from "../../net/asset-fetch";
import { describeImageSource } from "../utils/describe-image-source";

/** Union type for drawable images (works with canvas drawImage) */
export type DrawableImage = ImageBitmap | HTMLImageElement;

export class SvgImageCache {
  private cache = new Map<string, DrawableImage>();
  private pendingLoads = new Map<string, Promise<DrawableImage>>();
  /**
   * Safari can discard an SVG image's decoded backing store under memory
   * pressure and decode it again the next time Canvas2D draws it. Keep the
   * source blob alive for exactly as long as the cached image is reusable;
   * revoking it in `onload` leaves Safari with nothing to decode from later.
   */
  private sourceUrls = new Map<DrawableImage, string>();

  /**
   * Get or create an image from an SVG string
   * @param svgString The SVG content as a string
   * @param cacheKey Optional cache key (defaults to hash of SVG string)
   */
  async getImage(svgString: string, cacheKey?: string): Promise<DrawableImage> {
    const key = cacheKey || this.hashString(svgString);

    // Check cache first
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    // Check if already loading
    const pending = this.pendingLoads.get(key);
    if (pending) {
      return pending;
    }

    const loadPromise = this.svgToImage(svgString);
    this.pendingLoads.set(key, loadPromise);

    try {
      const img = await loadPromise;
      this.cache.set(key, img);
      return img;
    } finally {
      this.pendingLoads.delete(key);
    }
  }

  async getImageFromUrl(url: string): Promise<DrawableImage> {
    // Check cache first
    const cached = this.cache.get(url);
    if (cached) {
      return cached;
    }

    // Check if already loading
    const pending = this.pendingLoads.get(url);
    if (pending) {
      return pending;
    }

    const loadPromise = this.loadImageFromUrl(url);
    this.pendingLoads.set(url, loadPromise);

    try {
      const img = await loadPromise;
      this.cache.set(url, img);
      return img;
    } finally {
      this.pendingLoads.delete(url);
    }
  }

  /**
   * Convert SVG string to a drawable image
   * Detects environment and uses appropriate method.
   *
   * IMPORTANT: Main thread MUST use HTMLImageElement for SVGs.
   * createImageBitmap() is unreliable with SVGs (fails on malformed SVGs,
   * SVGs without explicit width/height, SVGs with special characters, etc.)
   * HTMLImageElement goes through the browser's full SVG renderer which is
   * far more forgiving. createImageBitmap is only used in workers where
   * HTMLImageElement is unavailable.
   */
  private svgToImage(svgString: string): Promise<DrawableImage> {
    // Main thread: use HTMLImageElement (reliable for all SVGs)
    if (typeof window !== "undefined" && typeof Blob !== "undefined" && typeof URL !== "undefined") {
      return this.browserSvgToImage(svgString);
    }
    // Worker: try createImageBitmap (only option without DOM)
    if (typeof createImageBitmap !== "undefined" && typeof Blob !== "undefined") {
      return this.bitmapSvgToImage(svgString);
    }
    // Node.js
    return this.nodeSvgToImage(svgString) as Promise<DrawableImage>;
  }

  /**
   * Browser/Worker implementation using createImageBitmap (preferred)
   * Works in both main thread and Web Workers.
   *
   * On main thread: Routes through Image element first because createImageBitmap(svgBlob)
   * is unreliable - it requires explicit width/height and fails on many valid SVGs.
   * Image element handles SVG parsing leniently, then we create ImageBitmap from it.
   *
   * In workers: No Image element available, so we inject dimensions and use blob directly.
   */
  private async bitmapSvgToImage(svgString: string): Promise<ImageBitmap> {
    // Main thread: use Image element intermediary (reliable SVG parsing)
    if (typeof HTMLImageElement !== "undefined") {
      return this.bitmapSvgViaImageElement(svgString);
    }
    // Worker: ensure dimensions exist, then use blob directly
    const processed = sanitizeSvgForBitmap(svgString);
    const blob = new Blob([processed], { type: "image/svg+xml;charset=utf-8" });
    return createImageBitmap(blob);
  }

  /**
   * Load SVG string via Image element, then convert to ImageBitmap.
   * Image element handles SVG quirks (missing dimensions, namespace issues) gracefully.
   */
  private bitmapSvgViaImageElement(svgString: string): Promise<ImageBitmap> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      img.onload = async () => {
        try {
          await img.decode();
          const bitmap = await createImageBitmap(img);
          URL.revokeObjectURL(url);
          resolve(bitmap);
        } catch (error) {
          URL.revokeObjectURL(url);
          reject(error);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Failed to load SVG as image: ${describeImageSource(svgString)}`));
      };

      img.src = url;
    });
  }

  /**
   * Browser fallback using HTMLImageElement (for environments without createImageBitmap)
   */
  private browserSvgToImage(svgString: string): Promise<HTMLImageElement> {
    // Inject width/height from viewBox so the resulting HTMLImageElement has
    // intrinsic (natural) dimensions. Without this, viewBox-only SVGs (grids,
    // letter glyphs) produce a dimensionless image, and a later
    // createImageBitmap(img) snapshot (AssetBundle build) throws
    // InvalidStateError. Aligns the main decode with the worker decode.
    const sanitized = sanitizeSvgForBitmap(svgString);
    return new Promise((resolve, reject) => {
      const img = new Image();
      const blob = new Blob([sanitized], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      img.onload = async () => {
        try {
          // `load` means the resource arrived. `decode` is the browser's
          // explicit guarantee that Canvas2D can use the pixels immediately.
          await img.decode();
          this.sourceUrls.set(img, url);
          resolve(img);
        } catch (error) {
          URL.revokeObjectURL(url);
          reject(error);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Failed to load SVG as image: ${describeImageSource(svgString)}`));
      };

      img.src = url;
    });
  }

  /**
   * Node.js implementation using canvas package's Image with data URL
   */
  private async nodeSvgToImage(svgString: string): Promise<unknown> {
    const canvas = await import('canvas');
    const { Image } = canvas;
    const img = new Image();

    let processedSvg = svgString;
    if (!svgString.includes('width=') || !svgString.includes('height=')) {
      const viewBoxMatch = svgString.match(/viewBox\s*=\s*["']([^"']+)["']/);
      if (viewBoxMatch?.[1]) {
        const parts = viewBoxMatch[1].split(/\s+/).map(Number);
        const width = parts[2];
        const height = parts[3];
        if (width && height) {
          processedSvg = svgString.replace(
            /<svg([^>]*)>/,
            `<svg$1 width="${width}" height="${height}">`
          );
        }
      }
    }

    const base64 = Buffer.from(processedSvg).toString('base64');

    return new Promise((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = (err: Error) => reject(new Error(`Failed to load SVG as image: ${err.message} (${describeImageSource(svgString)})`));
      img.src = `data:image/svg+xml;base64,${base64}`;
    });
  }

  /**
   * Load image from URL
   * Detects environment and uses appropriate method.
   *
   * Same rationale as svgToImage: main thread uses HTMLImageElement for
   * reliable SVG handling, workers use createImageBitmap as only option.
   */
  private async loadImageFromUrl(url: string): Promise<DrawableImage> {
    // Main thread: use HTMLImageElement (reliable for all SVGs)
    if (typeof window !== "undefined" && typeof fetch !== "undefined") {
      return this.browserLoadImageFromUrl(url);
    }
    // Worker: try createImageBitmap (only option without DOM)
    if (typeof createImageBitmap !== "undefined" && typeof fetch !== "undefined") {
      return this.bitmapLoadImageFromUrl(url);
    }
    // Node.js: read from file system and convert SVG
    return this.nodeLoadImageFromUrl(url) as Promise<DrawableImage>;
  }

  /**
   * Browser/Worker implementation using createImageBitmap (preferred)
   *
   * On main thread: Routes through Image element for reliable SVG handling.
   * In workers: Fetches as blob, injecting dimensions for SVGs.
   */
  private async bitmapLoadImageFromUrl(url: string): Promise<ImageBitmap> {
    // Main thread: use Image element (handles SVGs without dimensions)
    if (typeof HTMLImageElement !== "undefined") {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => createImageBitmap(img).then(resolve, reject);
        img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
        img.src = url;
      });
    }
    // Worker: fetch and handle SVGs specially
    const response = await assetFetch(url);
    if (url.endsWith(".svg")) {
      let svgText = await response.text();
      svgText = sanitizeSvgForBitmap(svgText);
      const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
      return createImageBitmap(blob);
    }
    const blob = await response.blob();
    return createImageBitmap(blob);
  }

  /**
   * Browser implementation for loading images from URLs.
   *
   * For SVG URLs, fetch the text and route through browserSvgToImage so the
   * width/height are injected from the viewBox. A raw `img.src = <svg url>` on a
   * viewBox-only SVG (grids, turn numbers) yields a DIMENSIONLESS HTMLImageElement;
   * a later createImageBitmap(img) snapshot (AssetBundle build, worker-pool seed)
   * then throws InvalidStateError and the asset is dropped from the bundle —
   * starving the worker pool. Routing through the sanitizer gives intrinsic
   * dimensions with the correct aspect ratio. Mirrors bitmapLoadImageFromUrl.
   */
  private async browserLoadImageFromUrl(url: string): Promise<HTMLImageElement> {
    if (url.endsWith(".svg") && typeof fetch !== "undefined") {
      try {
        const response = await assetFetch(url);
        if (response.ok) {
          const svgText = await response.text();
          return await this.browserSvgToImage(svgText);
        }
      } catch {
        // Fall through to the direct-load path below.
      }
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));

      img.src = url;
    });
  }

  /**
   * Node.js implementation for loading images from file system
   */
  private async nodeLoadImageFromUrl(url: string): Promise<unknown> {
    try {
      // Dynamic imports for ES modules
      const fs = await import('fs');
      const path = await import('path');

      // Convert URL path to file system path
      // /images/grid/diamond_grid.svg → static/images/grid/diamond_grid.svg

      // Remove leading slash and prepend 'static'
      const relativePath = url.startsWith('/') ? url.slice(1) : url;
      const filePath = path.join(process.cwd(), 'static', relativePath);

      // Read the SVG file
      const svgContent = fs.readFileSync(filePath, 'utf-8');

      // Convert SVG string to Image using our existing method
      const img = await this.nodeSvgToImage(svgContent);
      return img;
    } catch (error) {
      console.error(`[SvgImageCache] Failed to load ${url}:`, error);
      throw new Error(`Failed to load image from ${url}: ${error}`);
    }
  }


  /**
   * Simple string hash for cache keys
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `svg_${hash}`;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      pendingLoads: this.pendingLoads.size,
    };
  }

  /** Synchronously seed a decoded image under `key` (worker cache pre-population). */
  setImage(key: string, image: DrawableImage): void {
    this.cache.set(key, image);
  }

  /** Snapshot of the cache map (key → drawable). Used to build an AssetBundle. */
  entries(): Map<string, DrawableImage> {
    return new Map(this.cache);
  }

  /**
   * Clear the cache
   */
  clear() {
    // Close ImageBitmaps to free GPU memory
    for (const img of this.cache.values()) {
      if (typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap) {
        img.close();
      }
    }
    for (const url of this.sourceUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.sourceUrls.clear();
    this.cache.clear();
    this.pendingLoads.clear();
  }
}

// Singleton instance for global access
let instance: SvgImageCache | null = null;

export function getSvgImageCache(): SvgImageCache {
  if (!instance) {
    instance = new SvgImageCache();
  }
  return instance;
}

/**
 * Clear the global SVG image cache.
 * Call this when SVG content may have changed (e.g., after code updates).
 */
export function clearSvgImageCache(): void {
  if (instance) {
    instance.clear();
  }
}
