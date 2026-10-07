import { isFeatureVideoMediaUrl } from "$lib/shared/media-composition/domain/feature-video";
import type { PostProject } from "$lib/shared/media-composition/domain/post-project";

/**
 * Parts of a post the manifest bridge may not change: the media and timing
 * a post is built from. A take's name is only a label, so it may change.
 * A feature video's own footage, a take playing from its media folder, may
 * be added and removed: the CLI puts the file there first.
 */
const LOCKED_KEYS = [
  "takes",
  "images",
  "timings",
  "mappingPreviewAppearances",
  "fonts",
  "importSource",
] as const;

function lockedValue(project: PostProject, key: (typeof LOCKED_KEYS)[number]) {
  if (key !== "takes") return project[key] ?? null;
  return project.takes
    .filter(
      (take) =>
        !(take.ref.kind === "linked" && isFeatureVideoMediaUrl(take.ref.url))
    )
    .map(({ label: _label, ...take }) => take);
}

/** The first locked part `next` changes, or null when it changes none. */
export function bridgeLockedChange(
  current: PostProject,
  next: PostProject
): string | null {
  for (const key of LOCKED_KEYS)
    if (
      JSON.stringify(lockedValue(next, key)) !==
      JSON.stringify(lockedValue(current, key))
    )
      return key;
  return null;
}
