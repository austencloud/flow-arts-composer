/**
 * App-root notification listener — unbounded attach.
 *
 * Executable evidence for the Firestore cost audit
 * (docs/reports/opus-batch-2026-09-12/firestore-cost.md, finding H5).
 *
 * READ-ONLY AUDIT ARTEFACT. Assertions pin what production does TODAY.
 *
 * InboxSubscriptionProvider.svelte is mounted at the app root for every
 * signed-in user, and calls:
 *
 *   notificationService.subscribeToNotifications(userId, cb, 0)
 *                                                            ^^^
 *   // "No limit - load all notifications for Inbox"   (:94)
 *
 * Notifier.subscribeToNotifications treats `maxCount <= 0` as "omit the
 * limit() clause" (notifier.ts:365-372). The result is a listener over a
 * monotonically growing per-user subcollection — nothing in notifier.ts
 * prunes it on a schedule or a cap — attached on every page load whether or
 * not the user ever opens the Inbox, and re-delivering the whole result set
 * as it grows.
 *
 * The cost is the user's lifetime notification count, per boot, per device.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  /** Clause lists passed to query(), newest last. */
  queries: [] as unknown[][],
  attachedTo: [] as string[],
  unsubscribes: 0,
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  })),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  })),
  getDocs: vi.fn(async () => ({ docs: [], forEach: () => {}, empty: true })),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => "SERVER_TIME"),
  limit: vi.fn((n: number) => ({ kind: "limit", n })),
  orderBy: vi.fn((field: string, dir: string) => ({
    kind: "orderBy",
    field,
    dir,
  })),
  where: vi.fn((field: unknown, op: string, value: unknown) => ({
    kind: "where",
    field,
    op,
    value,
  })),
  query: vi.fn((ref: { path: string }, ...clauses: unknown[]) => {
    mocks.queries.push(clauses);
    return { ref, clauses };
  }),
  onSnapshot: vi.fn((q: { ref: { path: string } }) => {
    mocks.attachedTo.push(q.ref.path);
    return () => {
      mocks.unsubscribes++;
    };
  }),
}));

vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn(async () => ({})),
}));
// Partial: the schema modules pull `firestoreDate` from here at import time.
vi.mock("$lib/shared/firestore", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  firestoreList: vi.fn(async () => []),
  firestoreDelete: vi.fn(),
}));
vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() },
  showToast: vi.fn(),
}));

import { notificationService } from "$lib/shared/feedback/services/notifier";

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  mocks.queries.length = 0;
  mocks.attachedTo.length = 0;
  mocks.unsubscribes = 0;
});

describe("H5 — the app-root inbox notification listener", () => {
  it("attaches with no limit() when called the way InboxSubscriptionProvider calls it", async () => {
    // Exactly the production call: InboxSubscriptionProvider.svelte:89-95.
    notificationService.subscribeToNotifications("uid-1", () => {}, 0);
    await flush();

    expect(mocks.attachedTo).toEqual(["users/uid-1/notifications"]);

    const clauses = mocks.queries.at(-1)!;
    // DEFECT PINNED (H5): ordering only. Nothing caps the result set, so the
    // attach reads the user's entire notification history and the listener
    // keeps redelivering it as it grows.
    expect(clauses).toEqual([
      { kind: "orderBy", field: "createdAt", dir: "desc" },
    ]);
    expect(clauses.some((c) => (c as { kind?: string }).kind === "limit")).toBe(
      false
    );
  });

  it("does apply a bound at its default, so only the app-root caller is unbounded", async () => {
    // The default (maxCount = 20) is the safe shape. The Inbox provider opts
    // out of it deliberately; the fix is a page-size + cursor there, not a
    // change to this default.
    notificationService.subscribeToNotifications("uid-2", () => {});
    await flush();

    const clauses = mocks.queries.at(-1)!;
    expect(clauses).toContainEqual({ kind: "limit", n: 20 });
  });

  it("keeps only one listener alive across resubscribes (no listener pile-up)", async () => {
    // Notifier holds a single module-level `unsubscribe`, so a re-subscribe
    // tears the previous one down. This is the correct half of the design and
    // is pinned so a future refactor cannot silently regress it into a leak.
    //
    // `notificationService` is a module singleton shared across this file, so
    // normalize first: one subscribe, then reset the counters, so what is
    // measured is exactly one resubscribe cycle.
    notificationService.subscribeToNotifications("uid-3", () => {}, 0);
    await flush();
    mocks.attachedTo.length = 0;
    mocks.unsubscribes = 0;

    notificationService.subscribeToNotifications("uid-3", () => {}, 0);
    await flush();

    expect(mocks.attachedTo).toHaveLength(1);
    expect(mocks.unsubscribes).toBe(1); // the prior listener, torn down
  });
});
