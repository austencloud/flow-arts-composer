import type { PostProject } from "$lib/shared/media-composition/domain/post-project";

/**
 * Parts of a post the manifest bridge may not change: the media and timing
 * a post is built from. A take's name is only a label, so it may change.
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
  return project.takes.map(({ label: _label, ...take }) => take);
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
