import {
  createDeviceStore,
  type DeviceStoreKeys,
  type SaveResult,
  type StoreScope,
} from "@austencloud/video-editor";
import type { PostProject } from "@austencloud/video-editor/core";
import {
  createEmptyPostProject,
  tkaPlugin,
} from "$lib/shared/post-studio-plugin";
import { migratePostPlan } from "$lib/shared/media-composition/domain/post-project-migration";
import { loadPostPlan } from "$lib/shared/media-composition/services/post-plan-store";
import {
  parsePostTimingEffect,
  type PostTimingEffect,
} from "$lib/shared/media-composition/services/post-editor-history-store";
import { auth } from "$lib/shared/auth/firebase";

/**
 * Saves a sequence's v2 project on this device, beside its v1 plan (kept
 * around only so a project that predates the timeline editor still opens).
 * Cloud persistence is handled by the Post workspace after this local save.
 */

const PREFIX = "tka:post-studio:project:v2:";
const CLAIM_KEY = "tka:post-studio:legacy-owner:v1";
export type { SaveResult };

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** account:<uid> when signed in with an account, guest when device posts were claimed, else device. */
export function postOwnerId(): string {
  const user = auth.currentUser;
  if (user && !user.isAnonymous) return `account:${user.uid}`;
  return legacyPostOwner() ? "guest" : "device";
}

export const TKA_DEVICE_KEYS: DeviceStoreKeys = {
  project: ({ ownerId, subjectId }) =>
    ownerId === "device"
      ? `${PREFIX}${subjectId}`
      : `${PREFIX}${ownerId}:${subjectId}`,
  previous: (scope) =>
    scope.ownerId === "device"
      ? `${PREFIX}previous:${scope.subjectId}`
      : `${TKA_DEVICE_KEYS.project(scope)}:previous`,
  beforeImport: (scope) =>
    scope.ownerId.startsWith("account:")
      ? `${TKA_DEVICE_KEYS.project(scope)}:before-import`
      : `${PREFIX}before-import:${scope.subjectId}`,
  history: ({ subjectId }) => `tka:post-studio:history:v1:${subjectId}`,
  isSpareCopy: (key) =>
    key.startsWith(PREFIX) &&
    (key.endsWith(":previous") || key.startsWith(`${PREFIX}previous:`)),
};

export function legacyPostOwner(): string | null {
  try {
    return storage()?.getItem(CLAIM_KEY) ?? null;
  } catch {
    // A storage that throws on read counts as no claim, so a signed-out user
    // can still open and save posts instead of every call throwing.
    return null;
  }
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

const device = createDeviceStore<PostTimingEffect>({
  plugin: tkaPlugin,
  keys: TKA_DEVICE_KEYS,
  // Today's openPostProject after its loadPostProject call: a v1 plan migrated, else an empty post.
  openFallback: ({ subjectId }, now) => {
    const plan = loadPostPlan(subjectId);
    return plan
      ? migratePostPlan(plan, { now })
      : createEmptyPostProject({ sequenceId: subjectId, now });
  },
  parseEffect: parsePostTimingEffect,
  volatileFields: ["timings"],
});

const scopeFor = (sequenceId: string): StoreScope => ({
  ownerId: postOwnerId(),
  subjectId: sequenceId,
});

/** Keep the previous edit recoverable across reloads when importing a draft. */
export function backupPostProjectBeforeImport(project: PostProject): void {
  device.backupBeforeImport(scopeFor(project.sequenceId), project);
}

export function loadPostProject(sequenceId: string): PostProject | null {
  return device.loadProject(scopeFor(sequenceId));
}

/**
 * Saves the post on this device. The post itself always comes first: when
 * storage is full, the spare copies of earlier saves give way to it, and the
 * spare copy of this post is kept only when it still fits.
 */
export function savePostProject(project: PostProject): SaveResult {
  return device.saveProject(scopeFor(project.sequenceId), project);
}

/** The saved v2 project, else a v1 plan migrated, else an empty project. */
export function openPostProject(sequenceId: string, now: number): PostProject {
  return device.openProject(scopeFor(sequenceId), now);
}
