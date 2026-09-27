import {
  PostProjectSchema,
  createEmptyPostProject,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import { normalizeProject } from "$lib/shared/media-composition/domain/post-project-normalize";
import { migratePostPlan } from "$lib/shared/media-composition/domain/post-project-migration";
import { loadPostPlan } from "$lib/shared/media-composition/services/post-plan-store";

/**
 * Saves a sequence's v2 project on this device, beside its v1 plan (kept
 * around only so a project that predates the timeline editor still opens).
 * Nothing here writes to Firestore.
 */

const PREFIX = "tka:post-studio:project:v2:";

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadPostProject(sequenceId: string): PostProject | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(`${PREFIX}${sequenceId}`);
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

export function savePostProject(project: PostProject): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(`${PREFIX}${project.sequenceId}`, JSON.stringify(project));
  } catch {
    // Quota or private browsing: the project still drives this session.
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
