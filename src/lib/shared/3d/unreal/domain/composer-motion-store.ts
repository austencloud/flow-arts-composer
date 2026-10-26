import Dexie, { type Table } from "dexie";
import { sha256Hex } from "../../../foundation/utils/canonical-digest.js";
import type { CapturedPoseClip } from "../../native-capture/captured-pose-player.js";

/**
 * Keeps baked Composer performer motion on this device, so a sequence bakes
 * once per browser instead of on every page load, sequence switch or prop
 * change. Only the Web pose clip is kept: the native motion bundle embeds the
 * whole rig and is rebuilt by a fresh capture when Unreal or a download needs
 * it. Nothing leaves the device.
 *
 * Storage can be missing or blocked (private windows, strict settings). Every
 * call then behaves as a miss, and the performer simply bakes again as it did
 * before this store existed.
 */

/** Bump when the saved clip format changes; older rows then read as misses. */
export const COMPOSER_MOTION_STORE_SCHEMA = 1;
const DEFAULT_LIMIT = 24;
const DB_NAME = "tka-composer-motion";

interface StoredComposerMotion {
  key: string;
  schema: number;
  lastUsed: number;
  pose: CapturedPoseClip;
}

/**
 * The signature is the full sequence plus every capture input, often tens of
 * kilobytes, so rows are keyed by its hash. The signature already carries the
 * capture revision, so a change to how motion is captured changes the key.
 */
export function composerMotionStoreKey(signature: string): Promise<string> {
  return sha256Hex(signature);
}

/** A saved row's clip, or null when it was written by another format or is damaged. */
export function storedComposerPose(row: unknown): CapturedPoseClip | null {
  if (!row || typeof row !== "object") return null;
  const { schema, pose } = row as Partial<StoredComposerMotion>;
  if (schema !== COMPOSER_MOTION_STORE_SCHEMA || !pose) return null;
  if (!Array.isArray(pose.frames) || pose.frames.length === 0) return null;
  if (!Number.isFinite(pose.durationSeconds) || pose.durationSeconds <= 0)
    return null;
  return pose;
}

/** Given keys ordered least recently used first, the ones past the cap. */
export function composerMotionKeysToEvict(
  keysOldestFirst: readonly string[],
  limit: number
): string[] {
  return keysOldestFirst.slice(0, Math.max(0, keysOldestFirst.length - limit));
}

class ComposerMotionDatabase extends Dexie {
  poses!: Table<StoredComposerMotion, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({ poses: "key, lastUsed" });
  }
}

export class ComposerMotionStore {
  private database: ComposerMotionDatabase | null = null;
  private readonly limit: number;
  private readonly databaseName: string;

  constructor(options: { limit?: number; databaseName?: string } = {}) {
    this.limit = options.limit ?? DEFAULT_LIMIT;
    this.databaseName = options.databaseName ?? DB_NAME;
  }

  private db(): ComposerMotionDatabase | null {
    if (typeof indexedDB === "undefined") return null;
    this.database ??= new ComposerMotionDatabase(this.databaseName);
    return this.database;
  }

  async load(signature: string): Promise<CapturedPoseClip | null> {
    const db = this.db();
    if (!db) return null;
    try {
      const key = await composerMotionStoreKey(signature);
      const row = await db.poses.get(key);
      if (!row) return null;
      const pose = storedComposerPose(row);
      if (!pose) {
        await db.poses.delete(key);
        return null;
      }
      // Reading counts as use, so clips for sequences in rotation outlive
      // ones that were baked once and never opened again.
      void db.poses.update(key, { lastUsed: Date.now() }).catch(() => {});
      return pose;
    } catch {
      return null;
    }
  }

  /** Rejects when storage refuses the write; the caller decides how loud to be. */
  async save(signature: string, pose: CapturedPoseClip): Promise<void> {
    const db = this.db();
    if (!db) return;
    const key = await composerMotionStoreKey(signature);
    await db.poses.put({
      key,
      schema: COMPOSER_MOTION_STORE_SCHEMA,
      lastUsed: Date.now(),
      pose,
    });
    // primaryKeys() walks the lastUsed index without reading the clips, which
    // can each be megabytes of transforms.
    const keys = await db.poses.orderBy("lastUsed").primaryKeys();
    const stale = composerMotionKeysToEvict(keys, this.limit);
    if (stale.length > 0) await db.poses.bulkDelete(stale);
  }
}

let deviceStore: ComposerMotionStore | undefined;

export function getComposerMotionStore(): ComposerMotionStore {
  return (deviceStore ??= new ComposerMotionStore());
}
