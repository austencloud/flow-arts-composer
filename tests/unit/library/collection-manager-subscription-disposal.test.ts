import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A collection subscription disposed before Firestore finishes initializing.
 *
 * Both subscribe helpers attach their `onSnapshot` a microtask after returning,
 * so a caller that disposes in between runs the disposer while there is still
 * nothing to dispose. Without a `disposed` flag the listener then attaches with
 * no reference left to tear it down: an orphan that keeps billing reads and,
 * after a uid swap, keeps listening on the previous user's path.
 *
 * `collections-state.ensureStarted()` disposes synchronously when the uid
 * changes, which is exactly this window — the anonymous->Google upgrade the
 * subscription's own permission-denied handler already documents.
 */

const mocks = vi.hoisted(() => ({
  /** One entry per onSnapshot call; `active` flips false when torn down. */
  listeners: [] as { path: string; active: boolean }[],
  /** Settles every pending getFirestoreInstance promise on demand. */
  pendingFirestore: [] as (() => void)[],
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  doc: vi.fn((_db: unknown, path: string) => ({ path })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  writeBatch: vi.fn(),
  arrayRemove: vi.fn(),
  orderBy: vi.fn(),
  where: vi.fn(),
  documentId: vi.fn(),
  // Keep the ref first so the listener records which path it attached to.
  query: vi.fn((ref: unknown, ...clauses: unknown[]) => [ref, ...clauses]),
  onSnapshot: vi.fn((ref: unknown) => {
    const path =
      (ref as { path?: string })?.path ??
      ((ref as unknown[])?.[0] as { path?: string })?.path ??
      "unknown";
    const entry = { path, active: true };
    mocks.listeners.push(entry);
    return () => {
      entry.active = false;
    };
  }),
}));

// Deliberately unsettled: the defect lives between subscribe() returning and
// this promise resolving.
vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn(
    () =>
      new Promise((resolve) => {
        mocks.pendingFirestore.push(() => resolve({}));
      })
  ),
}));
vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toast: { error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  showToast: vi.fn(),
}));
vi.mock("$lib/shared/analytics/services/posthog", () => ({
  captureEvent: vi.fn(),
}));
vi.mock("$lib/shared/library/services/collection-firestore-mapper", () => ({
  getAuthenticatedUserId: vi.fn(() => "anon-uid"),
  mapDocToCollection: (data: Record<string, unknown>, id: string) => ({
    id,
    ...data,
  }),
  batchFetchSequences: vi.fn(),
  batchFetchPublicSequences: vi.fn(),
  filterExistingSequenceIds: vi.fn(),
  CollectionError: class extends Error {},
}));

import {
  subscribeToCollection,
  subscribeToCollections,
} from "$lib/shared/library/services/collection-manager";

/** Let every already-queued microtask run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Settle every getFirestoreInstance promise handed out so far. */
function releaseFirestore(): void {
  for (const resolve of mocks.pendingFirestore.splice(0)) resolve();
}

describe("collection subscription disposal", () => {
  beforeEach(() => {
    mocks.listeners.length = 0;
    mocks.pendingFirestore.length = 0;
  });

  it("leaves no live collections listener when disposed before Firestore initializes", async () => {
    const callback = vi.fn();
    const dispose = subscribeToCollections(callback);

    // The uid swap tears the subscription down before Firestore is ready.
    dispose();
    releaseFirestore();
    await flush();

    expect(mocks.listeners.filter((l) => l.active)).toHaveLength(0);
    expect(callback).not.toHaveBeenCalled();
  });

  it("leaves no live single-collection listener when disposed before Firestore initializes", async () => {
    const dispose = subscribeToCollection("collection-1", vi.fn());

    dispose();
    releaseFirestore();
    await flush();

    expect(mocks.listeners.filter((l) => l.active)).toHaveLength(0);
  });

  it("still attaches and tears down normally when disposal comes after initialization", async () => {
    const dispose = subscribeToCollections(vi.fn());

    releaseFirestore();
    await flush();
    expect(mocks.listeners.filter((l) => l.active)).toHaveLength(1);
    expect(mocks.listeners[0]?.path).toBe("users/anon-uid/collections");

    dispose();
    expect(mocks.listeners.filter((l) => l.active)).toHaveLength(0);
  });

  it("does not leave the previous user's listener attached across a uid swap", async () => {
    const disposeAnon = subscribeToCollections(vi.fn());
    disposeAnon();

    const disposeUpgraded = subscribeToCollections(vi.fn());
    releaseFirestore();
    await flush();

    expect(mocks.listeners.filter((l) => l.active)).toHaveLength(1);

    disposeUpgraded();
    expect(mocks.listeners.filter((l) => l.active)).toHaveLength(0);
  });
});
