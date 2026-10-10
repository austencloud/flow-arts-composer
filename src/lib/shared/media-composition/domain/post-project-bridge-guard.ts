import { isFeatureVideoMediaUrl } from "#lib/shared/media-composition/domain/feature-video.js";
import type { PostProject } from "#lib/shared/media-composition/domain/post-project.js";

/**
 * Parts of a post the manifest bridge may not change: the media and timing
 * a post is built from. A take's name is only a label, so it may change.
 * A feature video's own footage, a take playing from its media folder, may
 * be added, removed and relinked to a new recording: the CLI puts the file
 * there first. Its timing moves with it, so the timing of a take that is
 * added, removed or relinked in this change may change too. Every other
 * take's timing stays locked.
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
  movedTakeIds: ReadonlySet<string>
) {
  if (key === "takes")
    return project.takes
      .filter((take) => !isFeatureTake(take))
      .map(({ label: _label, ...take }) => take);
  if (key === "timings")
    return Object.fromEntries(
      Object.entries(project.timings ?? {}).filter(
        ([takeId]) => !movedTakeIds.has(takeId)
      )
    );
  return project[key] ?? null;
}

/** The first locked part `next` changes, or null when it changes none. */
export function bridgeLockedChange(
  current: PostProject,
  next: PostProject
): string | null {
  const movedTakeIds = movedFeatureTakeIds(current, next);
  for (const key of LOCKED_KEYS)
    if (
      JSON.stringify(lockedValue(next, key, movedTakeIds)) !==
      JSON.stringify(lockedValue(current, key, movedTakeIds))
    )
      return key;
  return null;
}

/** Feature video takes this change adds, removes or points at another file. */
function movedFeatureTakeIds(current: PostProject, next: PostProject) {
  const before = new Map(current.takes.map((take) => [take.id, take.takeKey]));
  const after = new Map(next.takes.map((take) => [take.id, take.takeKey]));
  return new Set(
    [...current.takes, ...next.takes]
      .filter(isFeatureTake)
      .map((take) => take.id)
      .filter((id) => before.get(id) !== after.get(id))
  );
}
