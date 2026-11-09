// The words on the reload prompt a new deploy brings. Every deploy gets the
// prompt; only a deploy that carries a published release names it, so the
// reload promises the What's New that follows. The lookup is one small read
// with a short deadline, and any failure keeps the plain wording: the Reload
// action never waits on the network.

import { releaseInUpdate } from "#lib/shared/versioning/domain/utils/release-discovery.js";

export const GENERIC_UPDATE_MESSAGE = "An update is ready.";

const LOOKUP_DEADLINE_MS = 2500;

export function releaseUpdateMessage(version: string): string {
  return `TKA v${version} is ready. Reload to see what's new.`;
}

export async function updateReadyMessage(
  running: string,
  fetchLatestRelease: () => Promise<string | null>,
  deadlineMs = LOOKUP_DEADLINE_MS
): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), deadlineMs);
  });
  try {
    const latest = await Promise.race([
      fetchLatestRelease().catch(() => null),
      deadline,
    ]);
    const release = releaseInUpdate(latest, running);
    return release ? releaseUpdateMessage(release) : GENERIC_UPDATE_MESSAGE;
  } finally {
    clearTimeout(timer);
  }
}
