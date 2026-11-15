/**
 * setups-cache-mirror - the device copy of the Setups lists, so opening Setups
 * shows the last-seen saved and community setups on the first frame while
 * Firestore refreshes behind them. Austen, 2026-11-14: Setups "took a very
 * very long time to load ... when that sort of thing should be a very quick
 * experience". On live a cold desktop visit waited about 5 s for the setup
 * documents and 6 s for owner names; a phone-like visit 24 s and 31 s.
 *
 * Saved setups are kept per account and dropped on sign-out (auth-state calls
 * `clearSetupsMirror`). Community setups are public, so one copy serves every
 * viewer; the state filters out the viewer's own setups as it always has.
 * Storage and versioning go through the shared `local-mirror` owner.
 */
import {
  readMirror,
  removeMirror,
  writeMirror,
} from "#lib/shared/foundation/services/local-mirror.js";
import { normalizePersistedStartEndOptions } from "../domain/generator-persistence-normalizer";
import type {
  CommunitySetup,
  SavedGeneratorSetup,
} from "../domain/models/favorite-config";

const PERSONAL_PREFIX = "tka:setups-mirror:own:";
const COMMUNITY_KEY = "tka:setups-mirror:community";

/** Bump when the stored shape changes so old copies are ignored, not mis-read. */
const SCHEMA_VERSION = 1;

export interface CachedCommunitySetups {
  setups: CommunitySetup[];
  savedAt: number;
}

/** What favorite-state needs from the device copy; tests pass an in-memory one. */
export interface SetupsCache {
  readPersonal(userId: string): SavedGeneratorSetup[] | null;
  writePersonal(userId: string, setups: readonly SavedGeneratorSetup[]): void;
  readCommunity(): CachedCommunitySetups | null;
  writeCommunity(setups: readonly CommunitySetup[]): void;
}

type Serialized<T, K extends keyof T> = Omit<T, K> & Record<K, string>;
type SerializedSaved = Serialized<
  SavedGeneratorSetup,
  "createdAt" | "updatedAt"
>;
type SerializedCommunity = Serialized<CommunitySetup, "createdAt">;

// JSON keeps Dates as ISO strings; a NaN date means a corrupt or foreign blob,
// and one bad entry discards the whole copy (the panel then loads as before).
function reviveDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("unrevivable date");
  return date;
}

function isSetupRow(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { name?: unknown }).name === "string" &&
    typeof (value as { config?: unknown }).config === "object" &&
    (value as { config?: unknown }).config !== null
  );
}

function reviveSaved(row: SerializedSaved): SavedGeneratorSetup {
  if (!isSetupRow(row) || typeof row.id !== "string") {
    throw new Error("malformed saved setup");
  }
  return {
    ...row,
    startEndOptions: normalizePersistedStartEndOptions(
      row.startEndOptions ?? null
    ),
    createdAt: reviveDate(row.createdAt),
    updatedAt: reviveDate(row.updatedAt),
  };
}

function reviveCommunity(row: SerializedCommunity): CommunitySetup {
  if (
    !isSetupRow(row) ||
    typeof row.setupId !== "string" ||
    typeof row.userId !== "string"
  ) {
    throw new Error("malformed community setup");
  }
  return {
    ...row,
    startEndOptions: normalizePersistedStartEndOptions(
      row.startEndOptions ?? null
    ),
    createdAt: reviveDate(row.createdAt),
  };
}

export function readPersonalSetupsMirror(
  userId: string
): SavedGeneratorSetup[] | null {
  const rows = readMirror<SerializedSaved[]>(
    PERSONAL_PREFIX + userId,
    SCHEMA_VERSION
  )?.data;
  if (!Array.isArray(rows)) return null;
  try {
    return rows.map(reviveSaved);
  } catch {
    return null;
  }
}

export function writePersonalSetupsMirror(
  userId: string,
  setups: readonly SavedGeneratorSetup[]
): void {
  writeMirror(
    PERSONAL_PREFIX + userId,
    SCHEMA_VERSION,
    setups.map((setup) => ({
      ...setup,
      createdAt: setup.createdAt.toISOString(),
      updatedAt: setup.updatedAt.toISOString(),
    }))
  );
}

export function readCommunitySetupsMirror(): CachedCommunitySetups | null {
  const entry = readMirror<SerializedCommunity[]>(
    COMMUNITY_KEY,
    SCHEMA_VERSION
  );
  if (!entry || !Array.isArray(entry.data)) return null;
  try {
    return { setups: entry.data.map(reviveCommunity), savedAt: entry.savedAt };
  } catch {
    return null;
  }
}

export function writeCommunitySetupsMirror(
  setups: readonly CommunitySetup[]
): void {
  writeMirror(
    COMMUNITY_KEY,
    SCHEMA_VERSION,
    setups.map((setup) => ({
      ...setup,
      createdAt: setup.createdAt.toISOString(),
    }))
  );
}

/** Drop an account's saved setups so they never seed the next account. */
export function clearSetupsMirror(userId: string): void {
  removeMirror(PERSONAL_PREFIX + userId);
}

export const setupsCacheMirror: SetupsCache = {
  readPersonal: readPersonalSetupsMirror,
  writePersonal: writePersonalSetupsMirror,
  readCommunity: readCommunitySetupsMirror,
  writeCommunity: writeCommunitySetupsMirror,
};
