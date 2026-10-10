import { t } from "#lib/shared/i18n/i18n.svelte.js";
import { getVideoFileMetadata } from "#lib/shared/video-collaboration/helpers/create-video-from-upload.js";

/** The largest video the editor opens: phones record big files. */
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

/**
 * Checks a picked file is a video the editor can open and reads its length.
 * Throws with a message for Austen when it cannot.
 */
export async function readVideoFile(file: File): Promise<number> {
  if (!file.type.startsWith("video/")) {
    throw new Error(t("share_studio_choose_video_file"));
  }
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error(t("share_studio_video_under_500"));
  }
  const metadata = await getVideoFileMetadata(file);
  if (!Number.isFinite(metadata.duration) || metadata.duration <= 0) {
    throw new Error(t("share_studio_video_duration_unreadable"));
  }
  return metadata.duration;
}

export function videoFileError(caught: unknown): string {
  return caught instanceof Error
    ? caught.message
    : t("share_studio_video_unreadable");
}
