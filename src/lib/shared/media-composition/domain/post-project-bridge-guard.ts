import { isFeatureVideoMediaUrl } from "$lib/shared/media-composition/domain/feature-video";
import type { PostProject } from "$lib/shared/media-composition/domain/post-project";

/**
 * Parts of a post the manifest bridge may not change: the media and timing
 * a post is built from. A take's name is only a label, so it may change.
 * A feature video's own footage, a take playing from its media folder, may
 * be added, removed and relinked to a new recording: the CLI puts the file
 * there first. Its timing moves with it, so that take's timing may change
 * too.
 */
const LOCKED_KEYS = [
  "takes",
  "images",
  "timings",
  "mappingPreviewAppearances",
  "fonts",
  "importSource",
] as const;

type Take = PostProject["takes"][number];

const isFeatureTake = (take: Take) =>
  take.ref.kind === "linked" && isFeatureVideoMediaUrl(take.ref.url);

function lockedValue(
  project: PostProject,
  key: (typeof LOCKED_KEYS)[number],
  featureTakeIds: ReadonlySet<string>
) {
  if (key === "takes")
    return project.takes
      .filter((take) => !isFeatureTake(take))
      .map(({ label: _label, ...take }) => take);
  if (key === "timings")
    return Object.fromEntries(
      Object.entries(project.timings ?? {}).filter(
        ([takeId]) => !featureTakeIds.has(takeId)
      )
    );
  return project[key] ?? null;
}

/** The first locked part `next` changes, or null when it changes none. */
export function bridgeLockedChange(
  current: PostProject,
  next: PostProject
): string | null {
  const featureTakeIds = new Set(
    [...current.takes, ...next.takes]
      .filter(isFeatureTake)
      .map((take) => take.id)
  );
  for (const key of LOCKED_KEYS)
    if (
      JSON.stringify(lockedValue(next, key, featureTakeIds)) !==
      JSON.stringify(lockedValue(current, key, featureTakeIds))
    )
      return key;
  return null;
}
