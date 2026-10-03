import { z } from "zod";

/**
 * Editing copies: the editor plays and scrubs a small H.264 copy of each
 * recording with a key frame every half second, so a seek decodes a few
 * small frames instead of seconds of 4K. Export always reads the original.
 */
export const PREVIEW_VIDEO_POLICY = "avc-720p-v2";
export const PREVIEW_KEY_FRAME_SECONDS = 0.5;
export const PREVIEW_VIDEO_BITRATE = 1_500_000;
export const PREVIEW_AUDIO_BITRATE = 96_000;
export const MAX_PREVIEW_DURATION_SECONDS = 60 * 60;
// An hour at the copy's bitrate, with room for a busy picture.
export const MAX_PREVIEW_VIDEO_BYTES = 1024 * 1024 * 1024;
export const MAX_PREVIEW_CACHE_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_ACTIVE_PREVIEW_BYTES = 1536 * 1024 * 1024;
/** A copy still being made is given up only after this long without progress. */
export const PREVIEW_STALL_MS = 90_000;

export interface PreviewVideoCopy {
  blob: Blob;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  durationSeconds: number;
}

/** A copy made ahead of time and served beside its recording. */
export interface PreparedPreviewVideo extends Omit<PreviewVideoCopy, "blob"> {
  url: string;
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

/** 720p: the short side at most 720 and the long side at most 1280, either way up. */
export function previewVideoDimensions(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("The video dimensions are unreadable");
  }
  const scale = Math.min(
    1,
    1280 / Math.max(width, height),
    720 / Math.min(width, height)
  );
  return {
    width: Math.max(2, Math.round((width * scale) / 2) * 2),
    height: Math.max(2, Math.round((height * scale) / 2) * 2),
  };
}

export function previewVideoCacheKey(sourceUrl: string, assetKey: string) {
  // A replaced upload must never inherit an older file's playback copy.
  return JSON.stringify([PREVIEW_VIDEO_POLICY, assetKey, sourceUrl]);
}

/**
 * What `scripts/make-edit-copies.ts` writes beside a recording as
 * `<name>.edit.json`, describing `<name>.edit.mp4`.
 */
export const EditCopyManifestSchema = z.object({
  policy: z.literal(PREVIEW_VIDEO_POLICY),
  source: z.object({
    bytes: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    durationSeconds: z.number().positive(),
  }),
  copy: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    durationSeconds: z.number().positive(),
  }),
});
export type EditCopyManifest = z.infer<typeof EditCopyManifestSchema>;

/** Where a prepared copy of a same-site recording would be, or null. */
export function editCopyPaths(
  sourceUrl: string
): { video: string; manifest: string } | null {
  if (!sourceUrl.startsWith("/") || sourceUrl.startsWith("//")) return null;
  const path = sourceUrl.split(/[?#]/)[0]!;
  const match = /^(.*\/[^/]+)\.[a-z0-9]+$/i.exec(path);
  if (!match || /\.edit$/i.test(match[1]!)) return null;
  return {
    video: `${match[1]}.edit.mp4`,
    manifest: `${match[1]}.edit.json`,
  };
}
