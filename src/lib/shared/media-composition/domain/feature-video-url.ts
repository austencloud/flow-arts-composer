/**
 * Feature video names and the URLs their media plays from. This file imports
 * nothing, so the post schema can check a music URL without importing
 * `feature-video.ts`, which imports the post schema.
 */

/** Lowercase letters, digits and dashes; it names the folder and the URL. */
export const FEATURE_VIDEO_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const FEATURE_VIDEO_API = "/api/dev/feature-videos";

export function isFeatureVideoSlug(value: unknown): value is string {
  return typeof value === "string" && FEATURE_VIDEO_SLUG_PATTERN.test(value);
}

/** The URL the editor plays a file in a project's media folder from. */
export function featureVideoMediaUrl(
  slug: string,
  relativePath: string
): string {
  if (!isFeatureVideoSlug(slug))
    throw new Error(`"${slug}" is not a feature video name.`);
  const segments = relativePath.split("/").filter(Boolean);
  if (segments.length === 0) throw new Error("A media path is required.");
  return `${FEATURE_VIDEO_API}/${slug}/media/${segments
    .map(encodeURIComponent)
    .join("/")}`;
}

const MEDIA_URL =
  /^\/api\/dev\/feature-videos\/[a-z0-9][a-z0-9-]{0,62}\/media\/.+$/;

export function isFeatureVideoMediaUrl(url: unknown): url is string {
  return typeof url === "string" && MEDIA_URL.test(url);
}
