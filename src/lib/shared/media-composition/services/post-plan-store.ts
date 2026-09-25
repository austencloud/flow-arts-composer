import {
  PostPlanSchema,
  createDefaultPostPlan,
  type PostPlan,
} from "$lib/shared/media-composition/domain/post-plan";

/**
 * Saves a sequence's post plan on this device, beside its takes' timing.
 * Nothing here writes to Firestore.
 */

const PREFIX = "tka:post-studio:plan:v1:";

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadPostPlan(sequenceId: string): PostPlan | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(`${PREFIX}${sequenceId}`);
    if (!raw) return null;
    const parsed = PostPlanSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.sequenceId === sequenceId
      ? parsed.data
      : null;
  } catch {
    return null;
  }
}

export function savePostPlan(plan: PostPlan): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(`${PREFIX}${plan.sequenceId}`, JSON.stringify(plan));
  } catch {
    // Quota or private browsing: the plan still drives this session.
  }
}

/** The saved plan, else the template. */
export function openPostPlan(sequenceId: string, now: number): PostPlan {
  return loadPostPlan(sequenceId) ?? createDefaultPostPlan({ sequenceId, now });
}
