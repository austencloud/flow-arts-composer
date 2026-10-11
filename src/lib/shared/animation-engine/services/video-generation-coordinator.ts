import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { VideoRenderProgress, VideoRenderResult } from "#lib/shared/animation-engine/services/video-pre-renderer.js";

export interface VideoGenerationOptions {
  fps?: number;
  quality?: number;
  width?: number;
  height?: number;
}
import { getVideoPreRenderer } from "#lib/shared/animation-engine/services/video-pre-renderer.js";

/**
 * VideoGenerationCoordinator
 *
 * Orchestrates video generation workflow including cache checking,
 * progress tracking, and error handling.
 */
export class VideoGenerationCoordinator {
  private videoService = getVideoPreRenderer();
  private generating = false;

  async checkCachedVideo(
    sequenceData: SequenceData
  ): Promise<VideoRenderResult | null> {
    const sequenceId = this.videoService.generateSequenceId(sequenceData);
    const cached = await this.videoService.getCachedVideo(sequenceId);
    return cached?.success ? cached : null;
  }

  async generateVideo(
    sequenceData: SequenceData,
    options: VideoGenerationOptions = {},
    onProgress?: (progress: VideoRenderProgress) => void
  ): Promise<VideoRenderResult> {
    if (this.generating) {
      throw new Error("Video generation already in progress");
    }

    this.generating = true;

    try {
      // Create a dummy canvas (the service uses its own offscreen canvas)
      const dummyCanvas = document.createElement("canvas");

      const result = await this.videoService.renderSequenceToVideo(
        sequenceData,
        dummyCanvas,
        {
          fps: options.fps ?? 60,
          quality: options.quality ?? 0.9,
          width: options.width ?? 500,
          height: options.height ?? 500,
        },
        onProgress
      );

      if (!result.success) {
        throw new Error(result.error || "Video generation failed");
      }

      return result;
    } finally {
      this.generating = false;
    }
  }

  cancelGeneration(): void {
    this.videoService.cancelRender();
    this.generating = false;
  }

  isGenerating(): boolean {
    return this.generating;
  }
}

// Singleton instance
let instance: VideoGenerationCoordinator | null = null;

export function getVideoGenerationCoordinator(): VideoGenerationCoordinator {
  if (!instance) {
    instance = new VideoGenerationCoordinator();
  }
  return instance;
}
