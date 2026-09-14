/**
 * Video Export Service Implementation
 *
 * Uses WebCodecs API for hardware-accelerated video encoding with explicit
 * frame timestamps. This ensures correct BPM timing regardless of export speed.
 *
 * Falls back to WASM-based h264-mp4-encoder for browsers without WebCodecs (Firefox).
 */

export type VideoFormat = "webm" | "mp4";

export interface VideoExportOptions {
  /** Video format - mp4 (H.264) is recommended. Default: mp4 */
  format?: VideoFormat;
  /** Target bitrate in bits per second. Default: 5_000_000 (5 Mbps) */
  bitrate?: number;
  /** Frames per second. Default: 50 */
  fps?: number;
  /** Output filename. Default: animation.{format} */
  filename?: string;
  /** Auto-download when complete. Default: true */
  autoDownload?: boolean;
}
import { VIDEO_EXPORT_FPS } from "$lib/shared/animation-engine/domain/constants/timing";
import type { WebCodecsVideoEncoder } from "$lib/shared/animation-engine/services/web-codecs-video-encoder";
import type { WasmVideoEncoder } from "$lib/shared/animation-engine/services/wasm-video-encoder";

export class VideoExporter {
  private isCurrentlyExporting = false;
  private shouldCancel = false;
  private activeEncoder: WebCodecsVideoEncoder | WasmVideoEncoder | null = null;

  /**
   * Check if WebCodecs API is available (Chrome, Safari, Edge)
   */
  private hasWebCodecs(): boolean {
    return (
      typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined"
    );
  }

  isFormatSupported(_format: VideoFormat): boolean {
    // With WebCodecs or WASM fallback, we always support MP4
    // WebM would require different codec configuration
    return true;
  }

  getBestFormat(): VideoFormat {
    // Always return MP4 - it's universally supported and we encode to H.264
    return "mp4";
  }

  async createManualExporter(
    width: number,
    height: number,
    options: VideoExportOptions = {}
  ): Promise<{
    addFrame: (canvas: HTMLCanvasElement) => Promise<void>;
    finish: () => Promise<Blob>;
    cancel: () => void;
  }> {
    if (this.isCurrentlyExporting) {
      throw new Error("Export already in progress");
    }

    const { bitrate = 5_000_000, fps = VIDEO_EXPORT_FPS } = options;

    this.isCurrentlyExporting = true;
    this.shouldCancel = false;

    try {
      if (this.hasWebCodecs()) {
        const { WebCodecsVideoEncoder } = await import(
          "$lib/shared/animation-engine/services/web-codecs-video-encoder"
        );
        this.activeEncoder = new WebCodecsVideoEncoder({
          width,
          height,
          fps,
          bitrate,
        });
      } else {
        const { WasmVideoEncoder } = await import(
          "$lib/shared/animation-engine/services/wasm-video-encoder"
        );
        this.activeEncoder = new WasmVideoEncoder({
          width,
          height,
          fps,
          bitrate,
        });
      }

      await this.activeEncoder.initialize();
    } catch (error) {
      // Reset state on initialization error
      this.isCurrentlyExporting = false;
      this.activeEncoder = null;
      throw error;
    }

    const addFrame = async (canvas: HTMLCanvasElement): Promise<void> => {
      if (this.shouldCancel || !this.activeEncoder) {
        throw new Error("Export cancelled");
      }
      try {
        await this.activeEncoder.addFrame(canvas);
      } catch (error) {
        // Reset state on frame error
        this.cancelExport();
        throw error;
      }
    };

    const finish = async (): Promise<Blob> => {
      if (this.shouldCancel || !this.activeEncoder) {
        throw new Error("Export cancelled");
      }

      try {
        const blob = await this.activeEncoder.finish();
        this.isCurrentlyExporting = false;
        this.activeEncoder = null;
        return blob;
      } catch (error) {
        // Reset state on finish error
        this.cancelExport();
        throw error;
      }
    };

    const cancel = () => {
      this.cancelExport();
    };

    return { addFrame, finish, cancel };
  }

  cancelExport(): void {
    this.shouldCancel = true;

    if (this.activeEncoder) {
      this.activeEncoder.cancel();
      this.activeEncoder = null;
    }

    this.isCurrentlyExporting = false;
  }

  isExporting(): boolean {
    return this.isCurrentlyExporting;
  }
}
