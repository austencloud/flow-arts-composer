/**
 * What this browser remembers about the install card: how often it has shown
 * on its own, when it was last waved away, and whether the person installed.
 *
 * The card never chases anyone. It offers itself at most twice, two weeks
 * apart, and never again after an install. The menu's "Get the app" button
 * stays for anyone who changes their mind.
 */

export const INSTALL_NUDGE_STORAGE_KEY = "tka-install-nudge";
export const MAX_AUTO_SHOWS = 2;
export const QUIET_DAYS_AFTER_DISMISS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface InstallNudgeMemory {
  autoShows: number;
  lastDismissedAt: number | null;
  installedAt: number | null;
}

export function emptyMemory(): InstallNudgeMemory {
  return { autoShows: 0, lastDismissedAt: null, installedAt: null };
}

export function canAutoShow(memory: InstallNudgeMemory, now: number): boolean {
  if (memory.installedAt !== null) return false;
  if (memory.autoShows >= MAX_AUTO_SHOWS) return false;
  if (
    memory.lastDismissedAt !== null &&
    now - memory.lastDismissedAt < QUIET_DAYS_AFTER_DISMISS * DAY_MS
  ) {
    return false;
  }
  return true;
}

function parseMemory(raw: string | null): InstallNudgeMemory {
  if (!raw) return emptyMemory();
  try {
    const parsed = JSON.parse(raw) as Partial<InstallNudgeMemory>;
    return {
      autoShows:
        typeof parsed.autoShows === "number" ? parsed.autoShows : 0,
      lastDismissedAt:
        typeof parsed.lastDismissedAt === "number"
          ? parsed.lastDismissedAt
          : null,
      installedAt:
        typeof parsed.installedAt === "number" ? parsed.installedAt : null,
    };
  } catch {
    return emptyMemory();
  }
}

export function readMemory(storage: Storage | undefined): InstallNudgeMemory {
  try {
    return parseMemory(storage?.getItem(INSTALL_NUDGE_STORAGE_KEY) ?? null);
  } catch {
    // Blocked storage (private mode, hardened settings) reads as a fresh
    // visitor; the per-visit flag in the state module still stops repeats.
    return emptyMemory();
  }
}

export function writeMemory(
  storage: Storage | undefined,
  memory: InstallNudgeMemory
): void {
  try {
    storage?.setItem(INSTALL_NUDGE_STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // Storage blocked: nothing to keep.
  }
}
