import {
  FEATURE_VIDEO_API,
  isFeatureVideoSlug,
} from "$lib/shared/media-composition/domain/feature-video-url";

/**
 * Names for the renders a feature video keeps in its `exports/` folder, and
 * the answer the dev server gives once one is saved. The editor, the dev
 * bridge and the route share these.
 */

/** The largest render the dev server keeps. */
export const FEATURE_EXPORT_MAX_BYTES = 2 * 1024 ** 3;

export const FEATURE_EXPORT_NAME_RULE =
  "An export name starts with a letter or digit, uses only letters, digits, spaces, dots, dashes and underscores, and ends in .mp4 (at most 104 characters).";

const NAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,99}\.mp4$/i;
/** Names Windows keeps for devices, with or without an extension. */
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;

export function isFeatureExportName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    NAME.test(value) &&
    !value.includes("..") &&
    !RESERVED.test(value)
  );
}

const pad = (value: number) => String(value).padStart(2, "0");

/** `<slug>-YYYYMMDD-HHMMSS.mp4`, in this computer's time. */
export function defaultFeatureExportName(
  slug: string,
  date = new Date()
): string {
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${slug}-${day}-${time}.mp4`;
}

/** The route a render is sent to; `name` picks its file name in exports/. */
export function featureVideoExportUrl(slug: string, name?: string): string {
  if (!isFeatureVideoSlug(slug))
    throw new Error(`"${slug}" is not a feature video name.`);
  const route = `${FEATURE_VIDEO_API}/${slug}/exports`;
  return name ? `${route}?name=${encodeURIComponent(name)}` : route;
}

/** The dev server's answer once a render is in exports/. */
export interface SavedFeatureExport {
  /** Inside the project folder, like `exports/promo-1-0-20261007-090503.mp4`. */
  file: string;
  /** The whole path on this computer. */
  path: string;
  bytes: number;
}

export function isSavedFeatureExport(
  value: unknown
): value is SavedFeatureExport {
  if (!value || typeof value !== "object") return false;
  const saved = value as Record<string, unknown>;
  return (
    typeof saved.file === "string" &&
    saved.file.startsWith("exports/") &&
    typeof saved.path === "string" &&
    typeof saved.bytes === "number" &&
    Number.isFinite(saved.bytes) &&
    saved.bytes > 0
  );
}
