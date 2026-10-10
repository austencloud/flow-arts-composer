import { z } from "zod";
import { doc, runTransaction } from "firebase/firestore";
import { auth, getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import {
  firestoreGetDetailed,
  firestoreList,
} from "#lib/shared/firestore/index.js";
import { awaitAuthSettled } from "#lib/shared/auth/state/auth-state.svelte.js";
import {
  PostProjectSchema,
  type PostProject,
} from "#lib/shared/media-composition/domain/post-project.js";
import {
  loadDiskPostDraft,
  loadPostDraft,
  loadUnclaimedStudioDraft,
  postDraftArchiveRecord,
  savePostDraftRecords,
} from "#lib/shared/media-composition/services/post-draft-storage.js";
import {
  accountPostProjectKeys,
  claimLegacyPosts,
  legacyPostOwner,
  loadPostProject,
  savePostProject,
} from "#lib/shared/media-composition/services/post-project-store.js";
import {
  listPostProjects,
  type PostProjectChoice,
} from "./post-workspace-projects";
import { loadPostPlan } from "#lib/shared/media-composition/services/post-plan-store.js";
import { migratePostPlan } from "#lib/shared/media-composition/domain/post-project-migration.js";
import { isIndependentStudioProjectId } from "#lib/shared/media-composition/domain/studio-project-id.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  cachePostSequence,
  resolvePostSequence,
} from "./post-workspace-projects";

const CloudPostSchema = z.object({
  id: z.string(),
  sequenceId: z.string(),
  project: z.string(),
  source: z.string().optional(),
  revision: z.number().int().nonnegative(),
  projectUpdatedAt: z.number().int().nonnegative(),
});
const revisions = new Map<string, number>();
const MAX_POSTS = 200;

function path(uid: string): string {
  return `users/${uid}/postProjects`;
}

function documentId(sequenceId: string): string {
  return encodeURIComponent(sequenceId);
}

function revisionKey(uid: string, sequenceId: string): string {
  return `${uid}:${sequenceId}`;
}

function parseCloudPost(record: z.infer<typeof CloudPostSchema>): PostProject {
  const parsed = PostProjectSchema.safeParse(JSON.parse(record.project));
  if (
    !parsed.success ||
    parsed.data.sequenceId !== record.sequenceId ||
    documentId(record.sequenceId) !== record.id ||
    parsed.data.updatedAt !== record.projectUpdatedAt
  )
    throw new Error(`A saved cloud post (${record.sequenceId}) is invalid.`);
  if (parsed.data.sourceKind === "none" && record.source)
    throw new Error(
      `A saved cloud post (${record.sequenceId}) has an unexpected source.`
    );
  if (record.source)
    cachePostSequence(parseCloudSequence(record.source, record.sequenceId));
  return parsed.data;
}

function parseCloudSequence(raw: string, sequenceId: string): SequenceData {
  const parsed: unknown = JSON.parse(raw);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("id" in parsed) ||
    parsed.id !== sequenceId ||
    !("steps" in parsed) ||
    !Array.isArray(parsed.steps) ||
    parsed.steps.length === 0
  )
    throw new Error(`A saved cloud source (${sequenceId}) is invalid.`);
  return parsed as SequenceData;
}

export async function currentPostAccount(): Promise<string | null> {
  await awaitAuthSettled();
  return auth.currentUser && !auth.currentUser.isAnonymous
    ? auth.currentUser.uid
    : null;
}

export async function listAccountPostProjects(
  uid: string
): Promise<PostProject[]> {
  const records = await firestoreList(
    path(uid),
    {
      safeParse(data: unknown) {
        const parsed = CloudPostSchema.safeParse(data);
        if (!parsed.success)
          throw new Error("A saved cloud post has invalid data.");
        return parsed;
      },
    },
    { limit: MAX_POSTS, serverOnly: true }
  );
  if (auth.currentUser?.uid !== uid)
    throw new Error("The account changed while loading posts.");
  if (records.length === MAX_POSTS)
    throw new Error("This account has more posts than can be listed safely.");
  return records.map(parseCloudPost);
}

export async function loadAccountPostProject(
  uid: string,
  sequenceId: string
): Promise<PostProject | null> {
  const record = await firestoreGetDetailed(
    path(uid),
    documentId(sequenceId),
    CloudPostSchema
  );
  if (auth.currentUser?.uid !== uid)
    throw new Error("The account changed while opening this post.");
  if (record.status === "unknown")
    throw new Error("Cloud posts could not be checked while offline.");
  if (record.status === "invalid")
    throw new Error("The cloud post has invalid data.");
  if (record.status === "absent") {
    revisions.set(revisionKey(uid, sequenceId), 0);
    return null;
  }
  const project = parseCloudPost(record.data);
  revisions.set(revisionKey(uid, sequenceId), record.data.revision);
  return project;
}

/** Reads a saved project and its source for library cards without changing the editor cache. */
export async function readAccountPostProjectPreview(
  uid: string,
  sequenceId: string
): Promise<{ project: PostProject; source: SequenceData | null } | null> {
  const record = await firestoreGetDetailed(
    path(uid),
    documentId(sequenceId),
    CloudPostSchema
  );
  if (auth.currentUser?.uid !== uid)
    throw new Error("The account changed while loading project previews.");
  if (record.status === "unknown")
    throw new Error(
      "Cloud project previews could not be checked while offline."
    );
  if (record.status === "invalid")
    throw new Error("The cloud project preview has invalid data.");
  if (record.status === "absent") return null;
  const cloud = record.data;
  const project = PostProjectSchema.safeParse(JSON.parse(cloud.project));
  if (
    !project.success ||
    project.data.sequenceId !== sequenceId ||
    project.data.updatedAt !== cloud.projectUpdatedAt ||
    cloud.id !== documentId(sequenceId)
  )
    throw new Error(`A saved cloud post (${sequenceId}) is invalid.`);
  if (project.data.sourceKind === "none" && cloud.source)
    throw new Error(
      `A saved cloud post (${sequenceId}) has an unexpected source.`
    );
  return {
    project: project.data,
    source: cloud.source ? parseCloudSequence(cloud.source, sequenceId) : null,
  };
}

/**
 * Writes the post to the account. The newest edit wins: when another tab or
 * device has since saved a later edit, that copy stays and is handed back
 * for the editor to take up; otherwise this one replaces whatever is there.
 */
export async function saveAccountPostProject(
  uid: string,
  project: PostProject,
  sequence: SequenceData | null
): Promise<PostProject | null> {
  const validated = PostProjectSchema.parse(project);
  const payload = JSON.stringify(validated);
  if (
    validated.sourceKind === "none"
      ? sequence !== null
      : !sequence ||
        sequence.id !== validated.sequenceId ||
        !sequence.steps?.length
  )
    throw new Error(
      "The source sequence is missing. This post was kept on this device."
    );
  // Deployed Firestore rules require a string source field. Empty means the
  // project explicitly has no sequence; readers treat it as absent.
  const source = sequence ? JSON.stringify(sequence) : "";
  const encoder = new TextEncoder();
  if (
    encoder.encode(payload).length > 700_000 ||
    encoder.encode(source).length > 200_000 ||
    encoder.encode(payload).length + encoder.encode(source).length > 900_000
  )
    throw new Error(
      "This post is too large for cloud sync. Download a backup."
    );
  const key = revisionKey(uid, validated.sequenceId);
  const db = await getFirestoreInstance();
  const ref = doc(db, path(uid), documentId(validated.sequenceId));
  let newer: PostProject | null = null;
  const next = await runTransaction(db, async (transaction) => {
    if (auth.currentUser?.uid !== uid)
      throw new Error("The account changed while saving this post.");
    newer = null;
    const existing = await transaction.get(ref);
    const data = existing.exists() ? existing.data() : null;
    const revision: number = data ? data.revision : 0;
    if (
      data &&
      revision !== revisions.get(key) &&
      data.projectUpdatedAt > validated.updatedAt
    ) {
      const record = CloudPostSchema.safeParse({
        ...data,
        id: documentId(validated.sequenceId),
      });
      try {
        newer = record.success ? parseCloudPost(record.data) : null;
      } catch {
        newer = null;
      }
      if (newer) return revision;
    }
    transaction.set(ref, {
      sequenceId: validated.sequenceId,
      project: payload,
      source,
      projectUpdatedAt: validated.updatedAt,
      revision: revision + 1,
    });
    return revision + 1;
  });
  revisions.set(key, next);
  return newer;
}

export async function listSyncedPostProjects(): Promise<{
  projects: PostProjectChoice[];
  error: string | null;
}> {
  const uid = await currentPostAccount();
  if (!uid) return listPostProjects();
  const errors: string[] = [];
  const local = new Map<string, PostProject>();
  for (const key of accountPostProjectKeys(uid)) {
    const id = key.slice(`tka:post-studio:project:v2:account:${uid}:`.length);
    const project = loadPostProject(id);
    if (project) local.set(id, project);
  }
  let legacyChoices: PostProjectChoice[] = [];
  const owner = legacyPostOwner();
  {
    const legacy = await listPostProjects();
    legacyChoices = legacy.projects.filter(
      (choice) =>
        choice.hasDraft &&
        (!owner || isIndependentStudioProjectId(choice.sequenceId))
    );
    if (legacy.error) errors.push(legacy.error);
    for (const choice of legacyChoices) {
      const unclaimedStudio =
        !owner && isIndependentStudioProjectId(choice.sequenceId);
      const draft = unclaimedStudio
        ? await loadUnclaimedStudioDraft(choice.sequenceId)
        : await loadPostDraft(choice.sequenceId);
      if (draft.error) {
        errors.push(draft.error);
        continue;
      }
      const project =
        draft.project ??
        (() => {
          const plan = loadPostPlan(choice.sequenceId);
          return plan ? migratePostPlan(plan, { now: Date.now() }) : null;
        })();
      if (!project) continue;
      if (auth.currentUser?.uid !== uid)
        throw new Error("The account changed while importing device posts.");
      if (unclaimedStudio && project.sourceKind !== "none") {
        const source = await resolvePostSequence(choice.sequenceId);
        if (!source) {
          errors.push(
            `The source sequence for ${choice.sequenceId} is unavailable. The device draft was kept.`
          );
          continue;
        }
        cachePostSequence(source);
      }
      const current = local.get(choice.sequenceId);
      if (current && current.updatedAt >= project.updatedAt) continue;
      const saved = savePostProject(project);
      if (saved.ok) local.set(choice.sequenceId, project);
      else errors.push(saved.error);
    }
    if (!owner && errors.length === 0) claimLegacyPosts(uid);
  }
  let cloud: PostProject[] = [];
  let cloudListed = false;
  try {
    cloud = await listAccountPostProjects(uid);
    cloudListed = true;
  } catch (cause) {
    errors.push(
      cause instanceof Error
        ? cause.message
        : "Cloud posts could not be listed."
    );
  }
  const cloudById = new Map(
    cloud.map((project) => [project.sequenceId, project])
  );
  if (cloudListed) {
    for (const project of local.values()) {
      const remote = cloudById.get(project.sequenceId);
      if (!remote) {
        try {
          const source =
            project.sourceKind === "none"
              ? null
              : await resolvePostSequence(project.sequenceId);
          if (!source && project.sourceKind !== "none")
            throw new Error(
              `The source sequence for ${project.sequenceId} is unavailable. This post was kept on this device.`
            );
          revisions.set(revisionKey(uid, project.sequenceId), 0);
          await saveAccountPostProject(uid, project, source);
          cloudById.set(project.sequenceId, project);
        } catch (cause) {
          errors.push(
            cause instanceof Error
              ? cause.message
              : "A local post could not sync."
          );
        }
      } else if (project.updatedAt > remote.updatedAt) {
        // This device has the newer copy; it goes up.
        try {
          const source =
            project.sourceKind === "none"
              ? null
              : await resolvePostSequence(project.sequenceId);
          if (source || project.sourceKind === "none")
            await saveAccountPostProject(uid, project, source);
          cloudById.set(project.sequenceId, project);
        } catch (cause) {
          console.warn(`[Post] ${project.sequenceId} will sync later:`, cause);
        }
      }
    }
  }
  const choices = new Map<string, PostProjectChoice>();
  for (const project of [...local.values(), ...cloudById.values()]) {
    const existing = choices.get(project.sequenceId);
    if (!existing || project.updatedAt > existing.updatedAt)
      choices.set(project.sequenceId, {
        sequenceId: project.sequenceId,
        title: project.title ?? project.sequenceId,
        word: "",
        updatedAt: project.updatedAt,
        hasDraft: true,
      });
  }
  return {
    projects: [...choices.values()].sort((a, b) => b.updatedAt - a.updatedAt),
    error: errors.join(" ") || null,
  };
}

export async function loadSyncedPostDraft(sequenceId: string): Promise<{
  project: PostProject | null;
  diskAvailable: boolean;
  error: string | null;
}> {
  const uid = await currentPostAccount();
  if (!uid) return loadPostDraft(sequenceId);
  let local = loadPostProject(sequenceId);
  if (!local && !legacyPostOwner()) {
    const legacy = isIndependentStudioProjectId(sequenceId)
      ? await loadUnclaimedStudioDraft(sequenceId)
      : await loadPostDraft(sequenceId);
    const project =
      legacy.project ??
      (() => {
        const plan = loadPostPlan(sequenceId);
        return plan ? migratePostPlan(plan, { now: Date.now() }) : null;
      })();
    if (project) {
      if (auth.currentUser?.uid !== uid)
        throw new Error("The account changed while opening this post.");
      // Opens even when the device copy could not be written; the next edit saves it.
      const saved = savePostProject(project);
      if (!saved.ok)
        console.warn(
          `[Post] ${sequenceId} opened without a device copy:`,
          saved.error
        );
      local = project;
    }
  }
  // In development the disk folder also holds every browser's saves, so a
  // post edited on another site of this computer opens at its newest too.
  const disk = loadDiskPostDraft(sequenceId);
  try {
    const remote = await loadAccountPostProject(uid, sequenceId);
    // The newest copy opens; when it is not the cloud's, the next save sends it up.
    return {
      project: newestPost(local, remote, await disk),
      diskAvailable: false,
      error: null,
    };
  } catch (cause) {
    const project = newestPost(local, await disk);
    if (project) {
      console.warn(
        `[Post] ${sequenceId} opened without the cloud copy, which could not be read:`,
        cause
      );
      return { project, diskAvailable: false, error: null };
    }
    return {
      project: null,
      diskAvailable: false,
      error:
        cause instanceof Error
          ? cause.message
          : "Cloud post could not be loaded.",
    };
  }
}

function newestPost(...copies: (PostProject | null)[]): PostProject | null {
  return copies.reduce<PostProject | null>(
    (newest, copy) =>
      copy && (!newest || copy.updatedAt > newest.updatedAt) ? copy : newest,
    null
  );
}

export async function resolveSyncedPostSequence(
  sequenceId: string
): Promise<SequenceData | null> {
  const cached = await resolvePostSequence(sequenceId);
  if (cached) return cached;
  const uid = await currentPostAccount();
  if (!uid) return null;
  await loadAccountPostProject(uid, sequenceId);
  return resolvePostSequence(sequenceId);
}

/** The first wait before trying a cloud write again, doubling up to the cap. */
const CLOUD_RETRY_MS = 15_000;
const CLOUD_RETRY_CAP_MS = 5 * 60_000;
const cloudRetries = new Map<
  string,
  { timer: ReturnType<typeof setTimeout>; attempt: number }
>();

/** Drops every waiting cloud retry. An account change calls this. */
export function cancelPostCloudRetries(): void {
  for (const pending of cloudRetries.values()) clearTimeout(pending.timer);
  cloudRetries.clear();
}

/** Keeps a copy in the dev server's draft folder, where there is one. */
function keepOnDisk(project: PostProject, uid: string): void {
  if (!import.meta.env.DEV) return;
  const archiveId = isIndependentStudioProjectId(project.sequenceId)
    ? `account:${uid}:${project.sequenceId}`
    : undefined;
  void savePostDraftRecords([postDraftArchiveRecord(project, archiveId)]).catch(
    (cause) => console.warn("[Post] The disk copy was not written:", cause)
  );
}

function accountChanged(): Error {
  return new Error(
    "The account changed. This post was kept on this device for the account that edited it."
  );
}

/**
 * Sends a post that is already saved on this device to the account that
 * opened it, and keeps a copy on disk in development. The caller binds the
 * account: a save or a retry that runs after someone else signs in writes
 * nothing. A cloud write that does not go through is tried again later with
 * the newest copy, so it never turns a save that landed on this device into
 * a failed one. Returns a later edit saved elsewhere, which the editor takes
 * up instead of this copy.
 */
export async function saveSyncedPostDraft(
  project: PostProject,
  sequence: SequenceData | null,
  uid: string
): Promise<PostProject | null> {
  if (!sequence && project.sourceKind !== "none")
    throw new Error(
      "The source sequence is missing. This post was kept on this device."
    );
  const retryKey = `${uid}:${project.sequenceId}`;
  const pending = cloudRetries.get(retryKey);
  clearTimeout(pending?.timer);
  cloudRetries.delete(retryKey);
  if ((await currentPostAccount()) !== uid) throw accountChanged();
  keepOnDisk(project, uid);
  try {
    const newer = await saveAccountPostProject(uid, project, sequence);
    if (newer) {
      // The device copy is keyed by whoever is signed in at this moment.
      if (auth.currentUser?.uid !== uid) throw accountChanged();
      savePostProject(newer);
      keepOnDisk(newer, uid);
    }
    return newer;
  } catch (cause) {
    if (
      cause instanceof Error &&
      cause.message.startsWith("The account changed")
    )
      throw cause;
    const attempt = (pending?.attempt ?? 0) + 1;
    console.warn(
      `[Post] ${project.sequenceId} is saved on this device and will sync to the cloud shortly:`,
      cause
    );
    cloudRetries.set(retryKey, {
      attempt,
      // The entry stays until the try, so the wait keeps doubling.
      timer: setTimeout(
        () => {
          void saveSyncedPostDraft(project, sequence, uid).then(
            () => undefined,
            () => undefined
          );
        },
        Math.min(CLOUD_RETRY_MS * 2 ** (attempt - 1), CLOUD_RETRY_CAP_MS)
      ),
    });
    return null;
  }
}
