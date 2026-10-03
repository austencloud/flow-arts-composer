import { z } from "zod";
import { doc, runTransaction } from "firebase/firestore";
import { auth, getFirestoreInstance } from "$lib/shared/auth/firebase";
import { firestoreGetDetailed, firestoreList } from "$lib/shared/firestore";
import { awaitAuthSettled } from "$lib/shared/auth/state/auth-state.svelte";
import { PostProjectSchema, type PostProject } from "$lib/shared/media-composition/domain/post-project";
import { loadPostDraft } from "$lib/shared/media-composition/services/post-draft-storage";
import { accountPostProjectKeys, claimLegacyPosts, legacyPostOwner, loadPostProject, savePostProject } from "$lib/shared/media-composition/services/post-project-store";
import { listPostProjects, type PostProjectChoice } from "./post-workspace-projects";
import { loadPostPlan } from "$lib/shared/media-composition/services/post-plan-store";
import { migratePostPlan } from "$lib/shared/media-composition/domain/post-project-migration";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { cachePostSequence, resolvePostSequence } from "./post-workspace-projects";

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
  if (!parsed.success || parsed.data.sequenceId !== record.sequenceId ||
      documentId(record.sequenceId) !== record.id ||
      parsed.data.updatedAt !== record.projectUpdatedAt)
    throw new Error(`A saved cloud post (${record.sequenceId}) is invalid.`);
  if (record.source) cachePostSequence(parseCloudSequence(record.source, record.sequenceId));
  return parsed.data;
}

function parseCloudSequence(raw: string, sequenceId: string): SequenceData {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || !("id" in parsed) ||
      parsed.id !== sequenceId || !("steps" in parsed) ||
      !Array.isArray(parsed.steps) || parsed.steps.length === 0)
    throw new Error(`A saved cloud source (${sequenceId}) is invalid.`);
  return parsed as SequenceData;
}

export async function currentPostAccount(): Promise<string | null> {
  await awaitAuthSettled();
  return auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser.uid : null;
}

export async function listAccountPostProjects(uid: string): Promise<PostProject[]> {
  const records = await firestoreList(path(uid), {
    safeParse(data: unknown) {
      const parsed = CloudPostSchema.safeParse(data);
      if (!parsed.success) throw new Error("A saved cloud post has invalid data.");
      return parsed;
    },
  }, { limit: MAX_POSTS, serverOnly: true });
  if (auth.currentUser?.uid !== uid) throw new Error("The account changed while loading posts.");
  if (records.length === MAX_POSTS)
    throw new Error("This account has more posts than can be listed safely.");
  return records.map(parseCloudPost);
}

export async function loadAccountPostProject(uid: string, sequenceId: string): Promise<PostProject | null> {
  const record = await firestoreGetDetailed(path(uid), documentId(sequenceId), CloudPostSchema);
  if (auth.currentUser?.uid !== uid) throw new Error("The account changed while opening this post.");
  if (record.status === "unknown") throw new Error("Cloud posts could not be checked while offline.");
  if (record.status === "invalid") throw new Error("The cloud post has invalid data.");
  if (record.status === "absent") {
    revisions.set(revisionKey(uid, sequenceId), 0);
    return null;
  }
  const project = parseCloudPost(record.data);
  revisions.set(revisionKey(uid, sequenceId), record.data.revision);
  return project;
}

/** A transaction rejects edits made elsewhere since this editor loaded. */
export async function saveAccountPostProject(uid: string, project: PostProject, sequence: SequenceData): Promise<void> {
  const validated = PostProjectSchema.parse(project);
  const payload = JSON.stringify(validated);
  if (sequence.id !== validated.sequenceId || !sequence.steps?.length)
    throw new Error("The source sequence is missing. This post was kept on this device.");
  const source = JSON.stringify(sequence);
  const encoder = new TextEncoder();
  if (encoder.encode(payload).length > 700_000 ||
      encoder.encode(source).length > 200_000 ||
      encoder.encode(payload).length + encoder.encode(source).length > 900_000)
    throw new Error("This post is too large for cloud sync. Download a backup.");
  const key = revisionKey(uid, validated.sequenceId);
  const expected = revisions.get(key);
  if (expected === undefined)
    throw new Error("Cloud state has not been checked. Reopen this post before saving online.");
  const db = await getFirestoreInstance();
  const ref = doc(db, path(uid), documentId(validated.sequenceId));
  const next = await runTransaction(db, async (transaction) => {
    if (auth.currentUser?.uid !== uid) throw new Error("The account changed while saving this post.");
    const existing = await transaction.get(ref);
    const revision = existing.exists() ? existing.data().revision : 0;
    if (revision !== expected)
      throw new Error("This post changed on another device. Your local copy is safe. Reopen it to review the newer version.");
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
}

export async function listSyncedPostProjects(): Promise<{ projects: PostProjectChoice[]; error: string | null }> {
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
  if (!owner) {
    const legacy = await listPostProjects();
    legacyChoices = legacy.projects.filter((choice) => choice.hasDraft);
    if (legacy.error) errors.push(legacy.error);
    for (const choice of legacyChoices) {
        const draft = await loadPostDraft(choice.sequenceId);
        if (draft.error) {
          errors.push(draft.error);
          continue;
        }
        const project = draft.project ?? (() => {
          const plan = loadPostPlan(choice.sequenceId);
          return plan ? migratePostPlan(plan, { now: Date.now() }) : null;
        })();
        if (!project) continue;
        if (auth.currentUser?.uid !== uid) throw new Error("The account changed while importing device posts.");
        const current = local.get(choice.sequenceId);
        if (current && current.updatedAt >= project.updatedAt) continue;
        const saved = savePostProject(project);
        if (saved.ok) local.set(choice.sequenceId, project);
        else errors.push(saved.error);
    }
    if (errors.length === 0) claimLegacyPosts(uid);
  }
  let cloud: PostProject[] = [];
  let cloudListed = false;
  try {
    cloud = await listAccountPostProjects(uid);
    cloudListed = true;
  } catch (cause) {
    errors.push(cause instanceof Error ? cause.message : "Cloud posts could not be listed.");
  }
  const cloudById = new Map(cloud.map((project) => [project.sequenceId, project]));
  if (cloudListed) {
    for (const project of local.values()) {
      const remote = cloudById.get(project.sequenceId);
      if (!remote) {
        try {
          const source = await resolvePostSequence(project.sequenceId);
          if (!source) throw new Error(`The source sequence for ${project.sequenceId} is unavailable. This post was kept on this device.`);
          revisions.set(revisionKey(uid, project.sequenceId), 0);
          await saveAccountPostProject(uid, project, source);
          cloudById.set(project.sequenceId, project);
        } catch (cause) {
          errors.push(cause instanceof Error ? cause.message : "A local post could not sync.");
        }
      } else if (project.updatedAt > remote.updatedAt) {
        errors.push(`A newer local copy of ${project.sequenceId} needs review before cloud sync.`);
      }
    }
  }
  const choices = new Map<string, PostProjectChoice>();
  for (const project of [...local.values(), ...cloudById.values()]) {
    const existing = choices.get(project.sequenceId);
    if (!existing || project.updatedAt > existing.updatedAt)
      choices.set(project.sequenceId, {
        sequenceId: project.sequenceId,
        title: project.sequenceId,
        word: "",
        updatedAt: project.updatedAt,
        hasDraft: true,
      });
  }
  return { projects: [...choices.values()].sort((a, b) => b.updatedAt - a.updatedAt), error: errors.join(" ") || null };
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
    const legacy = await loadPostDraft(sequenceId);
    const project = legacy.project ?? (() => {
      const plan = loadPostPlan(sequenceId);
      return plan ? migratePostPlan(plan, { now: Date.now() }) : null;
    })();
    if (project) {
      if (auth.currentUser?.uid !== uid) throw new Error("The account changed while opening this post.");
      const saved = savePostProject(project);
      if (!saved.ok) throw new Error(saved.error);
      local = project;
    }
  }
  try {
    const remote = await loadAccountPostProject(uid, sequenceId);
    if (local && remote && local.updatedAt > remote.updatedAt) {
      revisions.delete(revisionKey(uid, sequenceId));
      return { project: local, diskAvailable: false, error: "This device has a newer copy than the cloud. Download a backup before resolving the conflict." };
    }
    return { project: remote ?? local, diskAvailable: false, error: null };
  } catch (cause) {
    revisions.delete(revisionKey(uid, sequenceId));
    return { project: local, diskAvailable: false, error: cause instanceof Error ? cause.message : "Cloud post could not be loaded." };
  }
}

export async function resolveSyncedPostSequence(sequenceId: string): Promise<SequenceData | null> {
  const cached = await resolvePostSequence(sequenceId);
  if (cached) return cached;
  const uid = await currentPostAccount();
  if (!uid) return null;
  await loadAccountPostProject(uid, sequenceId);
  return resolvePostSequence(sequenceId);
}

export async function saveSyncedPostDraft(project: PostProject, sequence: SequenceData): Promise<void> {
  const uid = await currentPostAccount();
  if (!uid) throw new Error("Sign in again before syncing this post.");
  await saveAccountPostProject(uid, project, sequence);
}
