// Which release notes a returning reader has not read yet, and when the
// one-time toast may fire. "Seen" means the notes were opened; "toasted" means
// the toast fired. They are kept apart so an ignored toast never counts as
// read, while the toast itself still fires only once per release.

import { compareVersions, type AppVersion } from "../models/version-models";

/**
 * Releases newer than the last one read, up to the running build, that have
 * notes to show. Newest first, so a reader who skipped four releases catches
 * up in one sheet. A release ahead of the running build is left out: this
 * build cannot show what it describes.
 */
export function selectUnseenReleases(
  versions: readonly AppVersion[],
  lastSeen: string | null,
  running: string
): AppVersion[] {
  return versions
    .filter(
      (v) =>
        (v.changelogEntries?.length ?? 0) > 0 &&
        compareVersions(v.version, running) <= 0 &&
        (lastSeen === null || compareVersions(v.version, lastSeen) > 0)
    )
    .sort((a, b) => compareVersions(b.version, a.version));
}

/** The toast fires once for the newest unread release, never again for it. */
export function shouldToastRelease(
  newestUnseen: string | null,
  lastToasted: string | null
): boolean {
  if (!newestUnseen) return false;
  return lastToasted === null || compareVersions(newestUnseen, lastToasted) > 0;
}

/**
 * The release a new deploy brings, when it brings one: the newest published
 * notes are ahead of the build that is running. Otherwise null, and the reload
 * prompt keeps its plain wording.
 */
export function releaseInUpdate(
  latestPublished: string | null,
  running: string
): string | null {
  if (!latestPublished) return null;
  return compareVersions(latestPublished, running) > 0 ? latestPublished : null;
}

export type DiscoveryPlan =
  /** First visit ever: take the running build as read, greet nothing. */
  | { kind: "baseline" }
  /** Nothing unread. */
  | { kind: "none" }
  /**
   * Unread notes. `toast` is the release to announce once, or null when the
   * toast already fired for it; the dot shows either way until opened.
   */
  | { kind: "unread"; unseen: AppVersion[]; toast: string | null };

/**
 * What the app does on load about release notes. It never marks anything
 * read except the first-visit baseline: reading happens when the notes open.
 */
export function planReleaseDiscovery({
  versions,
  lastSeen,
  lastToasted,
  running,
}: {
  versions: readonly AppVersion[];
  lastSeen: string | null;
  lastToasted: string | null;
  running: string;
}): DiscoveryPlan {
  if (lastSeen === null) return { kind: "baseline" };
  const unseen = selectUnseenReleases(versions, lastSeen, running);
  if (unseen.length === 0) return { kind: "none" };
  const newest = unseen[0]!.version;
  return {
    kind: "unread",
    unseen,
    toast: shouldToastRelease(newest, lastToasted) ? newest : null,
  };
}
