/**
 * Notification subscription lifetime.
 *
 * The inbox mounts exactly one notification listener per signed-in user and
 * tears it down from an effect cleanup. Both halves of that contract run
 * against an async registration (`getFirestoreInstance()` is awaited before
 * `onSnapshot` exists), so the disposer the caller holds can fire while the
 * listener it is supposed to end has not been created yet.
 *
 * The invariants asserted here:
 *   1. A disposer called before registration completes cancels the pending
 *      registration — no listener is ever attached.
 *   2. A disposer ends its own subscription and nothing else.
 *   3. A torn-down subscription delivers nothing: no notifications into a
 *      consumer that is gone, and no error toast for a listener nobody owns.
 *   4. `cleanup()` ends every live subscription.
 *
 * Breaking any of them leaks another account's notifications into the inbox
 * badge, which is silent: the list simply shows the wrong user's items.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type SnapshotListener = {
  next: (snapshot: { docs: Array<{ id: string; data: () => unknown }> }) => void;
  error: (error: unknown) => void;
  detached: boolean;
};

const h = vi.hoisted(() => {
  const listeners: SnapshotListener[] = [];
  const pendingFirestore: Array<() => void> = [];
  const gate = { blockFirestore: false };

  return {
    listeners,
    pendingFirestore,
    gate,
    getFirestoreInstance: vi.fn(async () => {
      if (gate.blockFirestore) {
        await new Promise<void>((resolve) => pendingFirestore.push(resolve));
      }
      return { name: "firestore" };
    }),
    onSnapshot: vi.fn(
      (
        _query: unknown,
        next: SnapshotListener["next"],
        error: SnapshotListener["error"]
      ) => {
        const listener: SnapshotListener = { next, error, detached: false };
        listeners.push(listener);
        return () => {
          listener.detached = true;
        };
      }
    ),
    collection: vi.fn((_firestore: unknown, ...segments: string[]) =>
      segments.join("/")
    ),
    query: vi.fn((path: string) => path),
    orderBy: vi.fn(() => "orderBy"),
    limit: vi.fn(() => "limit"),
    toastError: vi.fn(),
    isPermissionDeniedError: vi.fn(() => false),
  };
});

vi.mock("firebase/firestore", () => ({
  collection: h.collection,
  query: h.query,
  orderBy: h.orderBy,
  limit: h.limit,
  onSnapshot: h.onSnapshot,
  getDocs: vi.fn(),
  doc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: h.getFirestoreInstance,
}));

// Partial: the schemas this module pulls in also import `firestoreDate` from
// here, so only the two call paths the notifier uses are replaced.
vi.mock("$lib/shared/firestore", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  firestoreList: vi.fn(),
  firestoreDelete: vi.fn(),
}));

vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toast: { error: h.toastError, info: vi.fn(), success: vi.fn() },
}));

vi.mock("$lib/shared/auth/utils/is-permission-denied-error", () => ({
  isPermissionDeniedError: h.isPermissionDeniedError,
}));

const { Notifier } = await import("$lib/shared/feedback/services/notifier");

function snapshotOf(ids: string[]) {
  return {
    docs: ids.map((id) => ({
      id,
      data: () => ({
        userId: "someone",
        type: "system-announcement",
        message: `message ${id}`,
        read: false,
        title: "Announcement",
      }),
    })),
  };
}

function liveListeners(): SnapshotListener[] {
  return h.listeners.filter((listener) => !listener.detached);
}

/** Let every already-queued microtask (the async registration) run. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function releaseFirestore(): void {
  h.gate.blockFirestore = false;
  for (const resolve of h.pendingFirestore.splice(0)) resolve();
}

describe("Notifier.subscribeToNotifications lifetime", () => {
  beforeEach(() => {
    h.listeners.length = 0;
    h.pendingFirestore.length = 0;
    h.gate.blockFirestore = false;
    h.onSnapshot.mockClear();
    h.toastError.mockClear();
    h.isPermissionDeniedError.mockClear();
  });

  it("attaches no listener when disposed before registration completes", async () => {
    const notifier = new Notifier();
    const received = vi.fn();

    h.gate.blockFirestore = true;
    const dispose = notifier.subscribeToNotifications("user-a", received, 0);

    // The consumer unmounted (sign-out, user switch) while Firestore was
    // still being resolved.
    dispose();

    releaseFirestore();
    await settle();

    expect(liveListeners()).toHaveLength(0);

    // Even if a listener was created and then detached, it must not deliver.
    for (const listener of h.listeners) listener.next(snapshotOf(["n1"]));
    expect(received).not.toHaveBeenCalled();
  });

  it("keeps other subscriptions alive when one is disposed", async () => {
    const notifier = new Notifier();
    const receivedA = vi.fn();
    const receivedB = vi.fn();

    const disposeA = notifier.subscribeToNotifications("user-a", receivedA, 0);
    await settle();
    const listenerA = h.listeners.at(-1)!;

    const disposeB = notifier.subscribeToNotifications("user-b", receivedB, 0);
    await settle();
    const listenerB = h.listeners.at(-1)!;
    expect(listenerB).not.toBe(listenerA);

    disposeA();

    expect(listenerB.detached).toBe(false);
    listenerB.next(snapshotOf(["n1"]));
    expect(receivedB).toHaveBeenCalledTimes(1);

    disposeB();
    expect(liveListeners()).toHaveLength(0);
  });

  it("delivers nothing after its disposer runs", async () => {
    const notifier = new Notifier();
    const received = vi.fn();

    const dispose = notifier.subscribeToNotifications("user-a", received, 0);
    await settle();
    const listener = h.listeners.at(-1)!;

    dispose();

    // A snapshot or error already queued when the listener was detached must
    // not reach a consumer that is gone.
    listener.next(snapshotOf(["n1"]));
    listener.error(new Error("unavailable"));

    expect(received).not.toHaveBeenCalled();
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it("ends every live subscription on cleanup()", async () => {
    const notifier = new Notifier();

    notifier.subscribeToNotifications("user-a", vi.fn(), 0);
    await settle();
    notifier.subscribeToNotifications("user-b", vi.fn(), 0);
    await settle();
    expect(liveListeners()).toHaveLength(2);

    notifier.cleanup();

    expect(liveListeners()).toHaveLength(0);
  });

  it("still delivers snapshots for a live subscription", async () => {
    const notifier = new Notifier();
    const received = vi.fn();

    notifier.subscribeToNotifications("user-a", received, 0);
    await settle();

    h.listeners.at(-1)!.next(snapshotOf(["n1", "n2"]));

    expect(received).toHaveBeenCalledTimes(1);
    expect(received.mock.calls[0]![0].map((n: { id: string }) => n.id)).toEqual([
      "n1",
      "n2",
    ]);
  });
});
