import { tick } from "svelte";
import { BackgroundVideoEncoder } from "$lib/shared/animation-engine/services/background-video-encoder";
import type { EvaluatedFrameLayer } from "$lib/shared/media-composition/services/frame-evaluator";
import type { MediaCompositionPreset } from "$lib/shared/media-composition/domain/media-composition-preset-schema";
import { renderPostStudioFrame } from "$lib/shared/media-composition/services/post-studio-frame-compositor";
import { CanvasFrameCapturer } from "$lib/shared/video-export/services/canvas-frame-capturer";
import type { PostStudioLayerPainter } from "$lib/shared/media-composition/services/post-studio-layer-painter";

export interface PostStudioExportProgress {
  completedFrames: number;
  totalFrames: number;
  phase: "rendering" | "encoding" | "audio";
}

export interface ExportPostStudioVideoInput {
  root: HTMLElement;
  preset: MediaCompositionPreset;
  durationSeconds: number;
  getLayers: () => readonly EvaluatedFrameLayer[];
  seek: (seconds: number) => void;
  /** Painted sources by role; they draw at output resolution. */
  painters?: ReadonlyMap<string, PostStudioLayerPainter>;
  originalAudioUrl?: string | null;
  /**
   * Where the kept span starts inside the audio's own file. The picture already
   * accounts for a source trim — the evaluator offsets each layer's source time
   * — but audio is muxed straight from the URL, so without this the sound would
   * start from the head of the untrimmed take and drift against the picture by
   * exactly the amount trimmed.
   */
  originalAudioStartSeconds?: number;
  onProgress?: (progress: PostStudioExportProgress) => void;
  shouldCancel?: () => boolean;
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
}

function exportBitrate(width: number, height: number, fps: number): number {
  return Math.max(8_000_000, Math.round(width * height * fps * 0.14));
}

/**
 * Encodes the exact Post Studio frame plan through the existing background
 * encoder. The editor supplies source surfaces, but never timing math.
 */
export async function exportPostStudioVideo(
  input: ExportPostStudioVideoInput
): Promise<Blob> {
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) {
    throw new RangeError("Post duration must be positive");
  }

  const { width, height, frameRate } = input.preset.output;
  const totalFrames = Math.max(1, Math.ceil(input.durationSeconds * frameRate));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const encoder = new BackgroundVideoEncoder();
  const capturer = new CanvasFrameCapturer();
  const cardFrameCache = new Map<string, HTMLCanvasElement>();
  let captureComplete = false;
  let encodedFrames = 0;

  encoder.onProgress = (frameIndex) => {
    encodedFrames = Math.min(totalFrames, frameIndex + 1);
    if (!captureComplete) return;
    input.onProgress?.({
      completedFrames: encodedFrames,
      totalFrames,
      phase: "encoding",
    });
  };

  try {
    await encoder.initialize({
      width,
      height,
      fps: frameRate,
      bitrate: exportBitrate(width, height, frameRate),
      totalFrames,
      codec: "h264",
      originalAudio: input.originalAudioUrl
        ? {
            url: input.originalAudioUrl,
            startSeconds: input.originalAudioStartSeconds ?? 0,
            endSeconds:
              (input.originalAudioStartSeconds ?? 0) + input.durationSeconds,
          }
        : undefined,
    });

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      if (input.shouldCancel?.()) throw new Error("Export cancelled");
      const timeSeconds = Math.min(
        input.durationSeconds,
        frameIndex / frameRate
      );
      input.seek(timeSeconds);
      await tick();
      await nextPaint();
      await renderPostStudioFrame({
        canvas,
        root: input.root,
        preset: input.preset,
        layers: input.getLayers(),
        cardFrameCache,
        painters: input.painters,
      });

      const timestampMicros = Math.round((frameIndex / frameRate) * 1_000_000);
      encoder.addFrameCaptured(
        capturer.capture(canvas, timestampMicros),
        frameIndex,
        frameIndex % Math.max(1, Math.round(frameRate * 2)) === 0
      );
      await encoder.waitForFrameQueue(6);
      input.onProgress?.({
        completedFrames: frameIndex + 1,
        totalFrames,
        phase: "rendering",
      });
    }

    captureComplete = true;
    input.onProgress?.({
      completedFrames: encodedFrames,
      totalFrames,
      phase: "encoding",
    });
    if (input.originalAudioUrl) {
      input.onProgress?.({
        completedFrames: totalFrames,
        totalFrames,
        phase: "audio",
      });
    }
    return await encoder.finish();
  } catch (error) {
    encoder.cancel();
    throw error;
  }
}
