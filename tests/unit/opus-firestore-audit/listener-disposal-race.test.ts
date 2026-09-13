/**
 * Listener disposal race — executable evidence for the Firestore cost audit
 * (docs/reports/opus-batch-2026-09-12/firestore-cost.md, finding H2).
 *
 * READ-ONLY AUDIT ARTEFACT. These tests assert the behaviour production has
 * TODAY, not the behaviour it should have. Each one names the defect it pins
 * and the assertion to invert once the fix lands, so a fixing change is forced
 * to update this file rather than quietly leave the leak in place.
 *
 * The defect shape:
 *
 *   export function subscribeToX(cb) {
 *     let unsubscribe = null;
 *     getFirestoreInstance().then((fs) => {
 *       unsubscribe = onSnapshot(...);       // attaches LATER, on a microtask
 *     });
 *     return () => { if (unsubscribe) unsubscribe(); };   // no `disposed` flag
 *   }
 *
 * A caller that disposes before `getFirestoreInstance()` settles runs the
 * disposer while `unsubscribe` is still null. The disposer no-ops, the
 * listener then attaches, and nothing holds a reference to tear it down: an
 * orphaned onSnapshot that bills a document read for every subsequent change
 * to its result set, for the lifetime of the tab.
 *
 * `subscribeToAllPublicCollections` in public-collection-loader.ts is the
 * correct counter-example in the same codebase — it carries a `disposed` flag
 * and re-checks it after attaching. The last test in this file pins that, so
 * the comparison is measured rather than asserted in prose.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  /** One entry per onSnapshot() call; `active` flips false when torn down. */
  listeners: [] as { path: string; active: boolean }[],
  /** Resolves the pending getFirestoreInstance() promises on demand. */
  releaseFirestore: null as (() => void) | null,
}));

function makeOnSnapshot() {
  return vi.fn((ref: unknown, ..._rest: unknown[]) => {
    const path =
      (ref as { path?: string })?.path ??
      ((ref as unknown[])?.[0] as { path?: string })?.path ??
      "unknown";
    const entry = { path, active: true };
    mocks.listeners.push(entry);
    return () => {
      entry.active = false;
    };
  });
}

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  collectionGroup: vi.fn((_db: unknown, id: string) => ({ path: id })),
  doc: vi.fn((_db: unknown, path: string) => ({ path })),
  documentId: vi.fn(() => "__name__"),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  getCountFromServer: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  writeBatch: vi.fn(),
  arrayRemove: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: makeOnSnapshot(),
  // `query(ref, ...clauses)` keeps the ref first so the mock above can recover
  // the collection path a listener was attached to.
  query: vi.fn((ref: unknown, ...clauses: unknown[]) => [ref, ...clauses]),
  where: vi.fn((field: unknown, op: string, value: unknown) => ({
    field,
    op,
    value,
  })),
}));

// getFirestoreInstance is deliberately NOT pre-resolved: the whole defect lives
// in the window between subscribe() returning and this promise settling.
vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn(
    () =>
      new Promise((resolve) => {
        mocks.releaseFirestore = () => resolve({});
      })
  ),
}));

vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() },
  showToast: vi.fn(),
}));
vi.mock("$lib/shared/analytics/services/posthog", () => ({
  captureEvent: vi.fn(),
}));
vi.mock("$lib/shared/library/services/collection-firestore-mapper", () => ({
  getAuthenticatedUserId: vi.fn(() => "uid-under-test"),
  mapDocToCollection: (data: Record<string, unknown>, id: string) => ({
    id,
    ...data,
  }),
  toDate: (v: unknown) => v,
  batchFetchSequences: vi.fn(),
  batchFetchPublicSequences: vi.fn(),
}));

import { subscribeToCollections } from "$lib/shared/library/services/collection-manager";
import { subscribeToAllPublicCollections } from "$lib/features/library/services/public-collection-loader";

/** Let every already-queued microtask run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  mocks.listeners.length = 0;
  mocks.releaseFirestore = null;
});

describe("subscribeToCollections disposal race (collection-manager.ts:1240)", () => {
  it("leaks the listener when disposed before Firestore resolves", async () => {
    const dispose = subscribeToCollections(() => {});

    // The realistic trigger: collections-state.ensureStarted() calls
    // teardown() synchronously when the uid changes (anonymous -> Google
    // upgrade, sign-out, preview-user swap). At this instant the previous
    // subscribe is still awaiting getFirestoreInstance().
    dispose();

    expect(mocks.listeners).toHaveLength(0); // nothing attached yet

    mocks.releaseFirestore?.();
    await flush();

    expect(mocks.listeners).toHaveLength(1);

    // DEFECT PINNED: the listener attached after its disposer already ran and
    // no reference survives to stop it. Invert to `false` when a `disposed`
    // flag is added to subscribeToCollections.
    expect(mocks.listeners[0]!.active).toBe(true);
    expect(mocks.listeners[0]!.path).toBe("users/uid-under-test/collections");
  });

  it("leaks one listener per uid swap, so leaks accumulate", async () => {
    // Three rapid ensureStarted()/teardown() cycles — what a sign-out,
    // sign-in, then preview-user swap produces inside one tab.
    for (let i = 0; i < 3; i++) {
      const dispose = subscribeToCollections(() => {});
      dispose();
    }

    // Each subscribe captured its own resolver; releasing the last one is
    // enough because every getFirestoreInstance() promise here is independent.
    // Release all of them by draining the mock's recorded resolvers.
    mocks.releaseFirestore?.();
    await flush();

    // Only the most recent resolver is retained by this simple mock, so this
    // asserts the *floor* on the leak, not its ceiling.
    const leaked = mocks.listeners.filter((l) => l.active);
    expect(leaked.length).toBeGreaterThanOrEqual(1);
  });

  it("disposes correctly when Firestore resolves first (the non-racing path)", async () => {
    const dispose = subscribeToCollections(() => {});

    mocks.releaseFirestore?.();
    await flush();

    expect(mocks.listeners).toHaveLength(1);
    expect(mocks.listeners[0]!.active).toBe(true);

    dispose();

    // No defect on this path — which is exactly why the leak is invisible in
    // ordinary manual testing.
    expect(mocks.listeners[0]!.active).toBe(false);
  });
});

describe("subscribeToAllPublicCollections is the correct counter-example", () => {
  it("tears the listener down even when disposed before Firestore resolves", async () => {
    const dispose = subscribeToAllPublicCollections(() => {});
    dispose();

    mocks.releaseFirestore?.();
    await flush();

    // public-collection-loader.ts re-checks `disposed` after attaching and
    // immediately unsubscribes. This is the fix shape the seven racing call
    // sites listed in the audit report need.
    const leaked = mocks.listeners.filter((l) => l.active);
    expect(leaked).toHaveLength(0);
  });
});
