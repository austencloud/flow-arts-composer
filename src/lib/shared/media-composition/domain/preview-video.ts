export const PREVIEW_VIDEO_POLICY = "avc-720p-v1";
export const MAX_PREVIEW_VIDEO_BYTES = 96 * 1024 * 1024;
export const MAX_PREVIEW_CACHE_BYTES = 256 * 1024 * 1024;
export const MAX_ACTIVE_PREVIEW_BYTES = 128 * 1024 * 1024;
export const MAX_PREVIEW_DURATION_SECONDS = 300;

export interface PreviewVideoCopy {
  blob: Blob;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  durationSeconds: number;
}

export interface PreviewVideoState {
  status: "preparing" | "ready" | "fallback";
  sourceUrl: string;
  url: string;
  progress: number;
  reason?: string;
  width?: number;
  height?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  durationSeconds?: number;
}

export function previewVideoDimensions(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("The video dimensions are unreadable");
  }
  const scale = Math.min(1, 1280 / width, 720 / height);
  return {
    width: Math.max(2, Math.round((width * scale) / 2) * 2),
    height: Math.max(2, Math.round((height * scale) / 2) * 2),
  };
}

export function previewVideoCacheKey(sourceUrl: string, assetKey: string) {
  // A replaced upload must never inherit an older file's playback copy.
  return JSON.stringify([PREVIEW_VIDEO_POLICY, assetKey, sourceUrl]);
}
