import { z } from "zod";
import { takeFileKey } from "#lib/shared/media-composition/domain/post-plan.js";
import {
  PostProjectSchema,
  type PostProject,
} from "#lib/shared/media-composition/domain/post-project.js";
import {
  FEATURE_VIDEO_API,
  FEATURE_VIDEO_SLUG_PATTERN,
  featureVideoMediaUrl,
  isFeatureVideoMediaUrl,
  isFeatureVideoSlug,
} from "#lib/shared/media-composition/domain/feature-video-url.js";

/** Kept here too, for the callers that already import them from this file. */
export {
  FEATURE_VIDEO_API,
  FEATURE_VIDEO_SLUG_PATTERN,
  featureVideoMediaUrl,
  isFeatureVideoMediaUrl,
  isFeatureVideoSlug,
};

/**
 * A feature video is a Post project kept as a folder on this computer, such
 * as a promo or a feature walkthrough, instead of as the one post each
 * sequence has. Only the dev server reads and writes the folder; nothing
 * here touches the account or this browser's saved posts.
 *
 *   <root>/<slug>/project.json   the post, its title and its revision
 *   <root>/<slug>/history/       each earlier save, as r000001.json and on
 *   <root>/<slug>/media/         footage, captures, music and images it plays
 *   <root>/<slug>/captures/      raw capture output before it becomes media
 *   <root>/<slug>/exports/       finished renders
 */

export const FEATURE_VIDEO_FILE_FORMAT = "feature-video-v1";
/** The largest project.json the dev server writes. */
export const FEATURE_VIDEO_MAX_FILE_BYTES = 12_000_000;
/** How many earlier saves history/ keeps. */
export const FEATURE_VIDEO_HISTORY_LIMIT = 200;
export const FEATURE_VIDEO_MEDIA_FOLDERS = [
  "footage",
  "captures",
  "music",
  "images",
] as const;
/** The media route serves only these kinds of file, with these types. */
export const FEATURE_VIDEO_MEDIA_TYPES: Readonly<Record<string, string>> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export const FeatureVideoFileSchema = z
  .object({
    format: z.literal(FEATURE_VIDEO_FILE_FORMAT),
    slug: z.string().regex(FEATURE_VIDEO_SLUG_PATTERN),
    title: z.string().trim().min(1).max(120),
    /** Goes up by one with each save; a save names the revision it started from. */
    revision: z.number().int().positive(),
    savedAt: z.number().finite(),
    project: PostProjectSchema,
  })
  .strict();

export type FeatureVideoFile = z.infer<typeof FeatureVideoFileSchema>;

export interface FeatureVideoSummary {
  slug: string;
  title: string;
  revision: number;
  savedAt: number;
  sequenceId: string;
}

/**
 * The same post for a copy of its folder: the project's own media URLs point
 * into the copy. A take's key moves with its URL only when it was the key the
 * URL gave it, and the timing filed under that take follows. Anything else,
 * including another project's media, stays as it was.
 */
export function rehomeFeatureMediaUrls(
  project: PostProject,
  from: string,
  to: string
): PostProject {
  const prefix = `${FEATURE_VIDEO_API}/${from}/media/`;
  const target = `${FEATURE_VIDEO_API}/${to}/media/`;
  const move = (url: string) =>
    url.startsWith(prefix) ? target + url.slice(prefix.length) : url;
  const keyMoves = new Map<string, string>();
  const takes = project.takes.map((take) => {
    if (take.ref.kind !== "linked") return take;
    const url = move(take.ref.url);
    if (url === take.ref.url) return take;
    const ref = { kind: "linked" as const, url };
    if (take.takeKey !== takeFileKey(take.ref)) return { ...take, ref };
    const takeKey = takeFileKey(ref);
    keyMoves.set(take.takeKey, takeKey);
    return { ...take, ref, takeKey };
  });
  const timings =
    project.timings &&
    Object.fromEntries(
      Object.entries(project.timings).map(([takeId, timing]) => {
        const takeKey = keyMoves.get(timing.takeKey);
        return [takeId, takeKey ? { ...timing, takeKey } : timing];
      })
    );
  const images = project.images?.map((image) => {
    if (image.ref.kind !== "linked") return image;
    const url = move(image.ref.url);
    return url === image.ref.url
      ? image
      : { ...image, ref: { kind: "linked" as const, url } };
  });
  const music = project.music && {
    ...project.music,
    url: move(project.music.url),
  };
  return {
    ...project,
    takes,
    ...(timings ? { timings } : {}),
    ...(images ? { images } : {}),
    ...(music ? { music } : {}),
  };
}
