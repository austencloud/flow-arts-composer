/**
 * Guide sequence overrides - Firestore-backed edit layer for the Level 1 guide
 * (Guide Companion v2, P1). Lets an admin replace a broken guide strip's steps
 * from any device; the edit persists for every reader after refresh. Never
 * hand-authors reversal dots (bakeReversals still derives those at the page
 * seam) - this module only owns the step DATA.
 *
 * Firestore shape:
 *   guideOverrides/{stripKey}            { steps, word?, updatedAt, updatedBy }
 *   guideOverrides/{stripKey}/revisions/{autoId}
 *                                        { steps: StepData[] | null, word, savedAt }
 *   (steps: null on a revision = the "authored" pseudo-revision - canonical
 *   code literal, popped back to by revertOverride when it's the last one.)
 *
 * Rules: public read (the guide is public), admin-only write - see
 * firestore.rules `guideOverrides/{stripKey}`.
 *
 * Module-level singleton (this codebase's state-factory convention): one
 * reactive cache shared by every guide page + the companion, loaded once per
 * reader/print/book mount via loadOverrides().
 */
import { loadedAuthState } from "#lib/shared/auth/state/loaded-auth-state.svelte.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

// Every Level 1 chapter imports this module, so it loads Firebase on first
// use instead of with the page, which keeps Firebase off the chapters' first
// download. The import() calls name the Firebase modules themselves: the
// build's small-chunk merge (vite.config.ts) can fold a small wrapper module
// back into the page.
async function loadFirestore() {
  const { getFirestoreInstance } = await import("#lib/shared/auth/firebase.js");
  return getFirestoreInstance();
}

async function loadEffectiveUserId(): Promise<string> {
  const { getEffectiveUserId } = await import(
    "#lib/shared/auth/state/auth-state.svelte.js"
  );
  return getEffectiveUserId() ?? "unknown";
}

const OVERRIDES_COLLECTION = "guideOverrides";
const REVISIONS_SUBCOLLECTION = "revisions";
const REVISION_CAP = 20;

class GuideOverridesState {
  /** stripKey -> resolved StepData[] (the FULL strip: start box + numbered steps). */
  map = $state<Map<string, StepData[]>>(new Map());
  /** stripKey -> saved word, when the override carries one. */
  words = $state<Map<string, string>>(new Map());
  /** stripKey -> whether a revert target exists (lazily refreshed per companion open). */
  revisionAvailability = $state<Map<string, boolean>>(new Map());
  loaded = $state(false);
  loading = $state(false);
}

const state = new GuideOverridesState();

/** Strip a StepData[] down to plain JSON - Firestore rejects class instances /
 *  functions / undefined; round-tripping through JSON also proves the shape is
 *  serializable (the same guarantee the unit test asserts). */
function serializeSteps(steps: StepData[]): unknown[] {
  return JSON.parse(JSON.stringify(steps));
}

function deserializeSteps(raw: unknown): StepData[] {
  if (!Array.isArray(raw)) return [];
  return raw as StepData[];
}

/** Admin gate for every mutating call - the same flag as SequenceViewerShell's
 *  `authState.isAdmin` check, read without importing auth-state. The companion
 *  that offers these edits loads auth-state itself, so the flag is live by the
 *  time an admin presses Replace, Revert or Reset. */
export function canEditGuide(): boolean {
  return loadedAuthState.isAdmin;
}

// ── Reads (reactive; safe to call from $derived in any page) ────────────────

export function overrideStepsFor(key: string): StepData[] | null {
  return state.map.get(key) ?? null;
}

export function overrideWordFor(key: string): string | undefined {
  return state.words.get(key);
}

export function hasOverride(key: string): boolean {
  return state.map.has(key);
}

export function overridesLoaded(): boolean {
  return state.loaded;
}

export function hasRevisionsCached(key: string): boolean {
  return state.revisionAvailability.get(key) ?? false;
}


/** One collection read; safe to call from multiple hosts (reader/print/book) -
 *  re-entrant while a load is already in flight. */
export async function loadOverrides(): Promise<Map<string, StepData[]>> {
  if (state.loading) return state.map;
  state.loading = true;
  try {
    const { collection, getDocs } = await import("firebase/firestore");
    const db = await loadFirestore();
    const snap = await getDocs(collection(db, OVERRIDES_COLLECTION));
    const nextMap = new Map<string, StepData[]>();
    const nextWords = new Map<string, string>();
    snap.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      const steps = deserializeSteps(data.steps);
      if (steps.length > 0) nextMap.set(d.id, steps);
      if (typeof data.word === "string" && data.word.length > 0) {
        nextWords.set(d.id, data.word);
      }
    });
    state.map = nextMap;
    state.words = nextWords;
    return nextMap;
  } catch (err) {
    console.error("[guide-overrides] Failed to load overrides:", err);
    return state.map;
  } finally {
    state.loaded = true;
    state.loading = false;
  }
}


/** Snapshot the doc's CURRENT state (before it's overwritten) into revisions.
 *  When no override doc exists yet, snapshots the "authored" pseudo-revision
 *  (steps: null) so a first-time Replace can still be reverted back to canonical. */
async function snapshotRevision(key: string): Promise<void> {
  const { addDoc, collection, doc, getDoc, serverTimestamp } = await import(
    "firebase/firestore"
  );
  const db = await loadFirestore();
  const docRef = doc(db, OVERRIDES_COLLECTION, key);
  const existing = await getDoc(docRef);
  const revisionsRef = collection(db, OVERRIDES_COLLECTION, key, REVISIONS_SUBCOLLECTION);

  const existingData = existing.exists() ? (existing.data() as Record<string, unknown>) : null;
  const revision: Record<string, unknown> = {
    steps: existingData?.steps ?? null,
    word: existingData?.word ?? null,
    savedAt: serverTimestamp(),
  };
  await addDoc(revisionsRef, revision);
  await pruneRevisions(key);
}

/** Cap ~20 revisions per strip - client-side prune, oldest first. */
async function pruneRevisions(key: string): Promise<void> {
  const { collection, deleteDoc, getDocs, orderBy, query } = await import(
    "firebase/firestore"
  );
  const db = await loadFirestore();
  const revisionsRef = collection(db, OVERRIDES_COLLECTION, key, REVISIONS_SUBCOLLECTION);
  const snap = await getDocs(query(revisionsRef, orderBy("savedAt", "asc")));
  const excess = snap.docs.length - REVISION_CAP;
  if (excess <= 0) return;
  for (let i = 0; i < excess; i++) {
    const d = snap.docs[i];
    if (d) await deleteDoc(d.ref);
  }
}

/** Refreshes (async) whether a revert target exists for `key`; cache it so the
 *  companion's Revert button can read it synchronously via hasRevisionsCached. */
export async function refreshRevisionAvailability(key: string): Promise<boolean> {
  const {
    collection,
    getDocs,
    limit: fsLimit,
    query,
  } = await import("firebase/firestore");
  const db = await loadFirestore();
  const revisionsRef = collection(db, OVERRIDES_COLLECTION, key, REVISIONS_SUBCOLLECTION);
  const snap = await getDocs(query(revisionsRef, fsLimit(1)));
  const has = !snap.empty;
  state.revisionAvailability = new Map(state.revisionAvailability).set(key, has);
  return has;
}

// ── Mutations (admin-only) ───────────────────────────────────────────────

export async function saveOverride(key: string, steps: StepData[], word?: string): Promise<void> {
  if (!canEditGuide()) throw new Error("Not authorized to edit the guide.");
  await snapshotRevision(key);

  const { doc, serverTimestamp, setDoc } = await import("firebase/firestore");
  const db = await loadFirestore();
  const docRef = doc(db, OVERRIDES_COLLECTION, key);
  const payload: Record<string, unknown> = {
    steps: serializeSteps(steps),
    updatedAt: serverTimestamp(),
    updatedBy: await loadEffectiveUserId(),
  };
  if (word !== undefined) payload.word = word;
  await setDoc(docRef, payload);

  state.map = new Map(state.map).set(key, steps);
  if (word !== undefined) state.words = new Map(state.words).set(key, word);
  state.revisionAvailability = new Map(state.revisionAvailability).set(key, true);
}

/** Pops the latest revision back into the doc. Returns false when there is
 *  nothing to revert to. A revision with `steps: null` (the "authored"
 *  pseudo-revision) reverts to canonical by DELETING the override doc. */
export async function revertOverride(key: string): Promise<boolean> {
  if (!canEditGuide()) throw new Error("Not authorized to edit the guide.");

  const {
    collection,
    deleteDoc,
    doc,
    getDocs,
    limit: fsLimit,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
  } = await import("firebase/firestore");
  const db = await loadFirestore();
  const revisionsRef = collection(db, OVERRIDES_COLLECTION, key, REVISIONS_SUBCOLLECTION);
  const snap = await getDocs(query(revisionsRef, orderBy("savedAt", "desc"), fsLimit(1)));
  if (snap.empty) return false;

  const latest = snap.docs[0];
  if (!latest) return false;
  const data = latest.data() as Record<string, unknown>;
  const docRef = doc(db, OVERRIDES_COLLECTION, key);

  if (data.steps == null) {
    await deleteDoc(docRef);
    const nextMap = new Map(state.map);
    nextMap.delete(key);
    state.map = nextMap;
    const nextWords = new Map(state.words);
    nextWords.delete(key);
    state.words = nextWords;
  } else {
    const steps = deserializeSteps(data.steps);
    const payload: Record<string, unknown> = {
      steps: data.steps,
      updatedAt: serverTimestamp(),
      updatedBy: await loadEffectiveUserId(),
    };
    if (typeof data.word === "string") payload.word = data.word;
    await setDoc(docRef, payload);
    state.map = new Map(state.map).set(key, steps);
    if (typeof data.word === "string") state.words = new Map(state.words).set(key, data.word);
  }

  await deleteDoc(latest.ref);
  const remaining = await refreshRevisionAvailability(key);
  state.revisionAvailability = new Map(state.revisionAvailability).set(key, remaining);
  return true;
}

/** Deletes the override doc outright - canonical authored steps show again.
 *  Revision history is left intact (Reset is not itself undo-able, but nothing
 *  is destroyed by it). */
export async function resetOverride(key: string): Promise<void> {
  if (!canEditGuide()) throw new Error("Not authorized to edit the guide.");
  const { deleteDoc, doc } = await import("firebase/firestore");
  const db = await loadFirestore();
  await deleteDoc(doc(db, OVERRIDES_COLLECTION, key));
  const nextMap = new Map(state.map);
  nextMap.delete(key);
  state.map = nextMap;
  const nextWords = new Map(state.words);
  nextWords.delete(key);
  state.words = nextWords;
}
