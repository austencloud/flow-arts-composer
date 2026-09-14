/**
 * step-map-draft.ts
 *
 * The step map editor's in-progress run, kept in localStorage so a hot module
 * reload, a stray navigation, or a closed panel never throws away the taps.
 * One entry per (sequence, video) key. Written on every change, read once when
 * the editor opens, dropped the moment a map is saved for real.
 */

export interface StepMapDraft {
  /** One timestamp per arrival, in tap order. */
  marks: number[];
  passes: number;
  mode: "mark" | "review";
  selectedMark: number;
  /** Where the playhead was, so the run resumes at that instant. */
  currentTime: number;
}

const PREFIX = "tka:step-map-draft:";

export function stepMapDraftStorageKey(key: string): string {
  return PREFIX + key;
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isDraft(value: unknown): value is StepMapDraft {
  if (!value || typeof value !== "object") return false;
  const d = value as Record<string, unknown>;
  return (
    Array.isArray(d.marks) &&
    d.marks.every(isFiniteNumber) &&
    isFiniteNumber(d.passes) &&
    (d.mode === "mark" || d.mode === "review") &&
    isFiniteNumber(d.selectedMark) &&
    isFiniteNumber(d.currentTime)
  );
}

export function loadStepMapDraft(key: string): StepMapDraft | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(stepMapDraftStorageKey(key));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * An untouched run has nothing worth keeping; storing it would only make the
 * next open think there was a draft to resume.
 */
export function saveStepMapDraft(key: string, draft: StepMapDraft): void {
  if (draft.marks.length === 0) {
    clearStepMapDraft(key);
    return;
  }
  const store = storage();
  if (!store) return;
  try {
    store.setItem(stepMapDraftStorageKey(key), JSON.stringify(draft));
  } catch {
    // Quota or privacy mode: the editor still works, it just won't survive a reload.
  }
}

export function clearStepMapDraft(key: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(stepMapDraftStorageKey(key));
  } catch {
    // Nothing to do; a stale draft is harmless.
  }
}
