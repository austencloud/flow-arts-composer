import { downloadBlob } from "#lib/shared/foundation/services/file-downloader.js";
import { createRenderCanvas } from "./create-render-canvas";
import type { RenderCanvas } from "./types";

interface ImageFormatOptions {
  format: "png" | "jpeg" | "webp";
  quality?: number;
  compression?: number;
}

interface OptimizationSettings {
  enableCompression: boolean;
  quality: number;
  progressive?: boolean;
}

export async function svgStringToImage(svgString: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("Failed to load SVG as image"));
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    img.src = url;
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
  });
}

export async function canvasToImage(canvas: RenderCanvas): Promise<HTMLImageElement> {
  if (canvas instanceof OffscreenCanvas) {
    const blob = await canvas.convertToBlob({ type: "image/png", quality: 1.0 });
    const url = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to convert canvas to image")); };
      img.src = url;
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    });
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("Failed to convert canvas to image"));
    const dataUrl = (canvas as HTMLCanvasElement).toDataURL("image/png");
    img.src = dataUrl;
    img.onload = () => {
      resolve(img);
    };
  });
}

export async function svgToImage(svgString: string, size: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.width = size;
    img.height = size;
    img.onerror = () => reject(new Error("Failed to load SVG as image"));
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.src = url;
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
  });
}

/**
 * Decode a blob into an image element.
 *
 * The wait is bounded. An environment that fires neither `load` nor `error`
 * for an object URL leaves the promise pending forever, and callers sit on
 * the upload path — `pngBlobToWebp` is one. jsdom is the reliable reproducer,
 * but a real browser that drops an event would hang the same way, so the
 * timeout is a product guard, not a test accommodation.
 */
export async function blobToImage(
  blob: Blob,
  timeoutMs = 15_000
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    // Revoke on every exit, not just success — the old error path leaked it.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (action: () => void) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      action();
    };

    timer = setTimeout(
      () => settle(() => reject(new Error("Timed out loading blob as image"))),
      timeoutMs
    );
    img.onerror = () =>
      settle(() => reject(new Error("Failed to load blob as image")));
    img.onload = () => settle(() => resolve(img));
    img.src = url;
  });
}

export async function imageToBlob(img: HTMLImageElement): Promise<Blob> {
  const canvas = createRenderCanvas(img.width || img.naturalWidth, img.height || img.naturalHeight);

  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
  if (!ctx) {
    throw new Error("Failed to get 2D context for blob conversion");
  }

  ctx.drawImage(img, 0, 0);

  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: "image/png", quality: 1.0 });
  }

  return new Promise((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to convert canvas to blob"));
        }
      },
      "image/png",
      1.0
    );
  });
}

export class ImageFormatConverter {

  async canvasToBlob(
    canvas: HTMLCanvasElement,
    options: ImageFormatOptions
  ): Promise<Blob> {
    if (!canvas) throw new Error("Canvas is required");

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("Conversion failed")),
        this.getMimeType(options.format),
        options.quality
      );
    });
  }

  canvasToDataURL(
    canvas: HTMLCanvasElement,
    options: ImageFormatOptions
  ): string {
    if (!canvas) throw new Error("Canvas is required");
    return canvas.toDataURL(this.getMimeType(options.format), options.quality);
  }

  async convertMultipleCanvasesToBlobs(
    canvases: HTMLCanvasElement[],
    options: ImageFormatOptions
  ): Promise<Blob[]> {
    return Promise.all(
      canvases.map((canvas) => this.canvasToBlob(canvas, options))
    );
  }

  async downloadBlob(blob: Blob, filename: string): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('downloadBlob is only available in browser context');
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async optimizeForUseCase(
    blob: Blob,
    _optimization: OptimizationSettings
  ): Promise<Blob> {
    return blob;
  }

  getOptimalFormat(_canvas: HTMLCanvasElement): "PNG" | "JPEG" | "WEBP" {
    return "PNG";
  }

  validateFormatOptions(options: ImageFormatOptions): boolean {
    return options && ["png", "jpeg", "webp"].includes(options.format);
  }

  getSupportedFormats(): string[] {
    return ["PNG", "JPEG", "WEBP"];
  }

  estimateFileSize(
    _canvas: HTMLCanvasElement,
    _options: ImageFormatOptions
  ): number {
    return 100000;
  }

  getConversionStats() {
    return {
      totalConversions: 0,
      totalBytesProcessed: 0,
      averageCompressionRatio: 0,
      formatUsage: {},
    };
  }

  cleanup(): void {
    // No cleanup needed
  }

  async downloadCanvas(
    canvas: HTMLCanvasElement,
    filename: string,
    format: "PNG" | "JPEG" = "PNG",
    quality: number = 1.0
  ): Promise<void> {
    try {
      const blob = await this.canvasToBlob(canvas, {
        format: format.toLowerCase() as "png" | "jpeg",
        quality,
      });

      await downloadBlob(blob, filename);
    } catch (error) {
      throw new Error(
        `Download failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  generateVersionedFilename(
    word: string,
    format: string,
    timestamp?: Date
  ): string {
    const sanitizedWord = this.sanitizeForFilename(word) || "sequence";

    const date = timestamp || new Date();
    const dateString = date.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD

    const version = 1;

    const extension = format.toLowerCase();

    return `${sanitizedWord}_v${version}_${dateString}.${extension}`;
  }

  private sanitizeForFilename(input: string): string {
    if (!input) return "";

    return input
      .replace(/[<>:"/\\|?*]/g, "_")
      .replace(/\s+/g, "_")
      .substring(0, 100);
  }

  private getMimeType(format: string): string {
    const mimeTypes: Record<string, string> = {
      png: "image/png",
      jpeg: "image/jpeg",
      webp: "image/webp",
      PNG: "image/png",
      JPEG: "image/jpeg",
      WEBP: "image/webp",
    };
    return mimeTypes[format] || "image/png";
  }
}

export const imageFormatConverter = new ImageFormatConverter();
