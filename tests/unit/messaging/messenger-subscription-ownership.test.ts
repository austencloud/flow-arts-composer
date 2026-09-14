/**
 * Subscription disposal and read-receipt ownership at the real messaging
 * boundary: the actual `messagingService`, with the Firestore SDK and the auth
 * handle mocked and their asynchrony deferred on purpose.
 *
 * Both defects were admitted in
 * `docs/reports/opus-batch-2026-09-12/inbox-concurrency.md` and are fixed here:
 * `subscribeToMessages` attached after its caller had disposed (leaking the
 * listener and still raising its toast), and `markAsRead` resolved the reader
 * from live auth *after* awaiting the Firestore handle.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type SnapshotHandler = (snapshot: unknown) => void;
type ErrorHandler = (error: unknown) => void;

interface AttachedListener {
  onNext: SnapshotHandler;
  onError: ErrorHandler;
  unsubscribe: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
  effectiveUserId: "user-a" as string | null,
  firestoreGate: null as Promise<void> | null,
  releaseFirestore: null as (() => void) | null,
  firestoreFails: false,
  listeners: [] as AttachedListener[],
  updateDoc: vi.fn(async () => undefined),
  getDocs: vi.fn(async () => ({ docs: [] })),
  batchCommit: vi.fn(async () => undefined),
  toastError: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => ({
    path: path.join("/"),
  })),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join("/") })),
  query: vi.fn((value: unknown) => value),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
  startAt: vi.fn(),
  getDoc: vi.fn(),
  getDocs: mocks.getDocs,
  updateDoc: mocks.updateDoc,
  onSnapshot: vi.fn(
    (
      _q: unknown,
      _options: unknown,
      onNext: SnapshotHandler,
      onError: ErrorHandler
    ) => {
      const unsubscribe = vi.fn();
      mocks.listeners.push({ onNext, onError, unsubscribe });
      return unsubscribe;
    }
  ),
  runTransaction: vi.fn(),
  writeBatch: vi.fn(() => ({ update: vi.fn(), commit: mocks.batchCommit })),
  serverTimestamp: vi.fn(() => "server-timestamp"),
  Timestamp: { fromDate: vi.fn(), now: vi.fn() },
}));

vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: async () => {
    if (mocks.firestoreGate) await mocks.firestoreGate;
    if (mocks.firestoreFails) throw new Error("Firestore unavailable");
    return { name: "firestore" };
  },
  getFunctionsInstance: async () => ({ name: "functions" }),
}));

vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn(() => vi.fn()) }));

vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: { initialized: true, loading: false },
  getEffectiveUserId: () => mocks.effectiveUserId,
}));

vi.mock("$lib/shared/debug/state/user-preview-state.svelte", () => ({
  userPreviewState: { isActive: false, data: {} },
  isPreviewReadOnly: () => false,
}));

vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: mocks.toastError,
  },
}));

import { messagingService } from "$lib/shared/messaging/services/messenger";
import { onSnapshot } from "firebase/firestore";

/** Hold `getFirestoreInstance` open so disposal can land mid-attach. */
function holdFirestore(): void {
  mocks.firestoreGate = new Promise<void>((resolve) => {
    mocks.releaseFirestore = resolve;
  });
}

async function releaseFirestore(): Promise<void> {
  mocks.releaseFirestore?.();
  mocks.releaseFirestore = null;
  mocks.firestoreGate = null;
  // Two turns: the awaited handle, then the body that attaches.
  await Promise.resolve();
  await Promise.resolve();
}

describe("messenger subscription disposal", () => {
  beforeEach(() => {
    messagingService.cleanup();
    mocks.listeners.length = 0;
    mocks.firestoreGate = null;
    mocks.releaseFirestore = null;
    mocks.firestoreFails = false;
    mocks.effectiveUserId = "user-a";
    mocks.updateDoc.mockClear();
    mocks.getDocs.mockClear();
    mocks.toastError.mockClear();
    vi.mocked(onSnapshot).mockClear();
  });

  it("never attaches a listener its caller already disposed", async () => {
    holdFirestore();
    const dispose = messagingService.subscribeToMessages(
      "conversation-1",
      vi.fn()
    );

    dispose();
    await releaseFirestore();

    expect(onSnapshot).not.toHaveBeenCalled();
    expect(mocks.listeners).toEqual([]);
  });

  it("stops delivering snapshots and errors after disposal", async () => {
    const callback = vi.fn();
    holdFirestore();
    const dispose = messagingService.subscribeToMessages(
      "conversation-1",
      callback
    );
    await releaseFirestore();

    const listener = mocks.listeners[0];
    expect(listener).toBeDefined();

    dispose();
    expect(listener?.unsubscribe).toHaveBeenCalledTimes(1);

    // A snapshot or error already queued behind the disposal must not reach a
    // caller that has moved on.
    listener?.onNext({ docs: [] });
    listener?.onError(new Error("network"));

    expect(callback).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("does not report a connection failure to a disposed caller", async () => {
    mocks.firestoreFails = true;
    holdFirestore();
    const dispose = messagingService.subscribeToMessages(
      "conversation-1",
      vi.fn()
    );

    dispose();
    await releaseFirestore();

    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("keeps the live listener when a stale disposer for the same conversation runs", async () => {
    const first = messagingService.subscribeToMessages(
      "conversation-1",
      vi.fn()
    );
    await Promise.resolve();
    await Promise.resolve();
    messagingService.subscribeToMessages("conversation-1", vi.fn());
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.listeners).toHaveLength(2);
    const [older, newer] = mocks.listeners;
    expect(older?.unsubscribe).toHaveBeenCalledTimes(1);

    // The map is keyed by conversation, so a stale disposer resolving by key
    // could tear down the listener that replaced it.
    first();
    expect(newer?.unsubscribe).not.toHaveBeenCalled();
  });
});

describe("messenger read receipts", () => {
  beforeEach(() => {
    messagingService.cleanup();
    mocks.listeners.length = 0;
    mocks.firestoreGate = null;
    mocks.releaseFirestore = null;
    mocks.firestoreFails = false;
    mocks.effectiveUserId = "user-a";
    mocks.updateDoc.mockClear();
    mocks.getDocs.mockClear();
    mocks.toastError.mockClear();
  });

  it("files the receipt for the account that opened the thread", async () => {
    holdFirestore();
    const marking = messagingService.markAsRead("conversation-1");

    // The account changes while the Firestore handle is still resolving.
    mocks.effectiveUserId = "user-b";
    await releaseFirestore();
    await marking;

    expect(mocks.updateDoc).toHaveBeenCalledWith(expect.anything(), {
      "unreadCount.user-a": 0,
    });
  });
});
