import {
  PostProjectSchema,
  createEmptyPostProject,
  type PostProject,
} from "#lib/shared/media-composition/domain/post-project.js";
import { normalizeProject } from "#lib/shared/media-composition/domain/post-project-normalize.js";
import { migratePostPlan } from "#lib/shared/media-composition/domain/post-project-migration.js";
import { loadPostPlan } from "#lib/shared/media-composition/services/post-plan-store.js";
import { auth } from "#lib/shared/auth/firebase.js";

/**
 * Saves a sequence's v2 project on this device, beside its v1 plan (kept
 * around only so a project that predates the timeline editor still opens).
 * Cloud persistence is handled by the Post workspace after this local save.
 */

const PREFIX = "tka:post-studio:project:v2:";
const CLAIM_KEY = "tka:post-studio:legacy-owner:v1";
export type SaveResult = { ok: true } | { ok: false; error: string };

/** Keep the previous edit recoverable across reloads when importing a draft. */
export function backupPostProjectBeforeImport(project: PostProject): void {
  const store = storage();
  if (!store)
    throw new Error(
      "Device storage is unavailable. The current post was kept."
    );
  store.setItem(
    auth.currentUser && !auth.currentUser.isAnonymous
      ? `${projectKey(project.sequenceId)}:before-import`
      : `${PREFIX}before-import:${project.sequenceId}`,
    JSON.stringify(project)
  );
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function projectKey(sequenceId: string): string {
  const uid = auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser.uid : null;
  return uid
    ? `${PREFIX}account:${uid}:${sequenceId}`
    : legacyPostOwner()
      ? `${PREFIX}guest:${sequenceId}`
      : `${PREFIX}${sequenceId}`;
}

export function legacyPostOwner(): string | null {
  return storage()?.getItem(CLAIM_KEY) ?? null;
}

export function claimLegacyPosts(uid: string): void {
  if (auth.currentUser?.uid !== uid || auth.currentUser.isAnonymous)
    throw new Error("The account changed while claiming device posts.");
  const store = storage();
  if (!store) throw new Error("Device storage is unavailable.");
  const owner = store.getItem(CLAIM_KEY);
  if (owner && owner !== uid) throw new Error("These device posts belong to another account.");
  store.setItem(CLAIM_KEY, uid);
}

export function accountPostProjectKeys(uid: string): string[] {
  const store = storage();
  if (!store) return [];
  const prefix = `${PREFIX}account:${uid}:`;
  return Array.from({ length: store.length }, (_, index) => store.key(index))
    .filter((key): key is string => !!key?.startsWith(prefix) &&
      !key.endsWith(":previous") && !key.endsWith(":before-import"));
}

export function loadPostProject(sequenceId: string): PostProject | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(projectKey(sequenceId));
    if (!raw) return null;
    const parsed = PostProjectSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.sequenceId !== sequenceId) return null;
    // A project saved before an edit that changes how normalizing works (or
    // one written by hand for a test) may not already be laid out; every
    // reader gets the current rules applied rather than stale positions.
    return normalizeProject(parsed.data);
  } catch {
    return null;
  }
}

/** Spare copies of earlier saves, which give way when storage is full. */
function isSpareCopy(key: string): boolean {
  return (
    key.startsWith(PREFIX) &&
    (key.endsWith(":previous") || key.startsWith(`${PREFIX}previous:`))
  );
}

function dropSpareCopies(store: Storage, keep: string): void {
  const spare = Array.from({ length: store.length }, (_, index) =>
    store.key(index)
  ).filter((key): key is string => !!key && key !== keep && isSpareCopy(key));
  for (const key of spare) store.removeItem(key);
}

/**
 * Saves the post on this device. The post itself always comes first: when
 * storage is full, the spare copies of earlier saves give way to it, and the
 * spare copy of this post is kept only when it still fits.
 */
export function savePostProject(project: PostProject): SaveResult {
  const store = storage();
  if (!store) return { ok: false, error: "Device storage is unavailable." };
  try {
    const key = projectKey(project.sequenceId);
    const spareKey =
      (auth.currentUser && !auth.currentUser.isAnonymous) || legacyPostOwner()
        ? `${key}:previous`
        : `${PREFIX}previous:${project.sequenceId}`;
    const next = JSON.stringify(project);
    const previous = store.getItem(key);
    try {
      store.setItem(key, next);
    } catch {
      dropSpareCopies(store, spareKey);
      store.removeItem(spareKey);
      store.setItem(key, next);
    }
    if (previous !== null && previous !== next) {
      try {
        store.setItem(spareKey, previous);
      } catch {
        // No room for a spare copy; the post itself is saved.
        store.removeItem(spareKey);
      }
    }
    if (store.getItem(key) !== next) {
      return {
        ok: false,
        error: "The post could not be verified in device storage.",
      };
    }
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      error:
        cause &&
        typeof cause === "object" &&
        "message" in cause &&
        typeof cause.message === "string"
          ? cause.message
          : "The post could not be saved on this device.",
    };
  }
}

/** The saved v2 project, else a v1 plan migrated, else an empty project. */
export function openPostProject(sequenceId: string, now: number): PostProject {
  const saved = loadPostProject(sequenceId);
  if (saved) return saved;
  const plan = loadPostPlan(sequenceId);
  if (plan) return migratePostPlan(plan, { now });
  return createEmptyPostProject({ sequenceId, now });
}
