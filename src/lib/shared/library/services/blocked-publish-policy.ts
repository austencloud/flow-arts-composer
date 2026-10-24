/**
 * blocked-publish-policy — when a refused publish may run again, and when the
 * person hears about it.
 *
 * Session triage 2026-10-22 (E3/F2): a tester's public copies point at ids or
 * content claims another owner holds, so every publish attempt is refused by
 * the rules. The boot retry treated that `PublishPermissionError` as transient,
 * replayed it on every app open, and the repository showed "not public on
 * other devices yet" each time. A rules refusal does not heal on its own; it
 * needs new content or an explicit save from the person.
 *
 * Owners: the retry pass (`library-sync-retry.ts`) asks `shouldRetryBlocked
 * Publish`; the repository asks `claimBlockedPublishWarning` before warning.
 * The device-scoped warning flag follows the guest save nudge's storage
 * pattern (`auth-drawer-state.svelte.ts`) but is keyed per sequence, which a
 * single boolean flag cannot express.
 */

import { PublishPermissionError } from "./publish-permission-error";

/** A permission-blocked publish is reconsidered at most this often. */
export const BLOCKED_PUBLISH_RETRY_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Typed reason stored on the Dexie row's `pendingSyncMetadata.blockedReason`. */
export const PUBLISH_PERMISSION_DENIED = "PUBLISH_PERMISSION_DENIED";

/**
 * The publish transaction (or one of its reads) was refused by the rules.
 * `PublishPermissionError` is a plain Error, not a FirebaseError, so an
 * `instanceof FirebaseError` check alone never sees it.
 */
export function isPublishPermissionDenied(error: unknown): boolean {
  return error instanceof PublishPermissionError;
}

export interface PublishBlock {
  readonly blockedReason?: string;
  /** Epoch ms when the block was recorded. */
  readonly blockedAt?: number;
  /** Content hash of the sequence that was refused. */
  readonly blockedContentHash?: string;
}

/**
 * May the background pass try a blocked publish again?
 *
 * Only when the content changed since the refusal (a different hash) AND the
 * daily window has passed. The same content was refused once and will be
 * refused again. A block recorded without a timestamp or hash (older rows,
 * other permanent reasons) stays held until an explicit save rewrites the
 * row's metadata, as before. `currentContentHash` is only called once the
 * cheap checks pass, so held rows cost no hashing.
 */
export async function shouldRetryBlockedPublish(
  block: PublishBlock | undefined,
  now: number,
  currentContentHash: () => Promise<string | undefined>
): Promise<boolean> {
  if (!block?.blockedReason) return true;
  if (block.blockedAt === undefined || !block.blockedContentHash) return false;
  if (now - block.blockedAt < BLOCKED_PUBLISH_RETRY_INTERVAL_MS) return false;
  const hash = await currentContentHash();
  return hash !== undefined && hash !== block.blockedContentHash;
}

const WARNED_KEY = "tka-blocked-publish-warned";
const WARNED_CAP = 200;
const warnedThisSession = new Set<string>();

function readWarned(): string[] {
  try {
    const raw = localStorage.getItem(WARNED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * True the first time on this device that a refused publish of `sequenceId`
 * should be shown; false afterwards. Records the claim as it answers.
 */
export function claimBlockedPublishWarning(sequenceId: string): boolean {
  if (warnedThisSession.has(sequenceId)) return false;
  warnedThisSession.add(sequenceId);
  const warned = readWarned();
  if (warned.includes(sequenceId)) return false;
  try {
    localStorage.setItem(
      WARNED_KEY,
      JSON.stringify([...warned, sequenceId].slice(-WARNED_CAP))
    );
  } catch {
    /* The session guard still applies when storage is unavailable. */
  }
  return true;
}

/** Test seam: forget the in-memory session guard. */
export function resetBlockedPublishWarningsForTest(): void {
  warnedThisSession.clear();
}
