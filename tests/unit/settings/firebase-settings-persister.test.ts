/**
 * The persister's async boundaries.
 *
 * Both defects here are invisible to a synchronous test double: the snapshot
 * listener is created AFTER an awaited doc-ref resolution, and the activeProp
 * mirror runs AFTER the awaited settings write. Each is a window in which the
 * caller can unsubscribe, or the signed-in account can change.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const firestoreDoc = vi.hoisted(() => vi.fn((_db: unknown, path: string) => ({
  path,
})));
const onSnapshot = vi.hoisted(() => vi.fn(() => vi.fn()));
const setDoc = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("firebase/firestore", () => ({
  doc: firestoreDoc,
  getDoc: vi.fn(),
  setDoc,
  onSnapshot,
  serverTimestamp: () => "server-time",
}));

const auth = vi.hoisted(() => ({
  currentUser: null as { uid: string; isAnonymous: boolean } | null,
}));
const firestoreReady = vi.hoisted(() => ({
  resolve: null as ((value: unknown) => void) | null,
  deferred: false,
}));

vi.mock("$lib/shared/auth/firebase", () => ({
  auth,
  getFirestoreInstance: vi.fn(() => {
    if (!firestoreReady.deferred) return Promise.resolve({});
    return new Promise((resolve) => {
      firestoreReady.resolve = resolve;
    });
  }),
}));

vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toast: { error: vi.fn() },
}));
vi.mock("$lib/shared/auth/utils/is-permission-denied-error", () => ({
  isPermissionDeniedError: () => false,
}));
vi.mock("$lib/shared/offline/state/sync-status-state.svelte", () => ({
  trackWrite: (write: () => Promise<unknown>) => write(),
}));

import { FirebaseSettingsPersister } from "$lib/shared/settings/services/firebase-settings-persister";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe("FirebaseSettingsPersister async boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.currentUser = { uid: "user-a", isAnonymous: false };
    firestoreReady.deferred = false;
    firestoreReady.resolve = null;
    onSnapshot.mockImplementation(() => vi.fn());
    setDoc.mockImplementation(async () => {});
  });

  it("does not open a snapshot listener when unsubscribed before the doc ref resolves", async () => {
    firestoreReady.deferred = true;
    const persister = new FirebaseSettingsPersister();

    const unsubscribe = persister.onSettingsChange(() => {});
    // Caller tears down while getSettingsDocRef() is still pending.
    unsubscribe();

    firestoreReady.resolve?.({});
    await flushMicrotasks();

    // A listener created now belongs to nobody: the handle was already used.
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it("stops delivering snapshots after unsubscribe", async () => {
    let deliver: ((snapshot: unknown) => void) | null = null;
    onSnapshot.mockImplementation((...args: unknown[]) => {
      deliver = args[1] as (snapshot: unknown) => void;
      return vi.fn();
    });

    const persister = new FirebaseSettingsPersister();
    const callback = vi.fn();
    const unsubscribe = persister.onSettingsChange(callback);
    await flushMicrotasks();

    unsubscribe();
    deliver?.({ exists: () => true, data: () => ({ reducedMotion: true }) });

    expect(callback).not.toHaveBeenCalled();
  });

  it("gives each subscription its own handle", async () => {
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    onSnapshot
      .mockImplementationOnce(() => firstListener)
      .mockImplementationOnce(() => secondListener);

    const persister = new FirebaseSettingsPersister();
    const unsubscribeFirst = persister.onSettingsChange(() => {});
    await flushMicrotasks();

    const unsubscribeSecond = persister.onSettingsChange(() => {});
    await flushMicrotasks();

    // Opening the second closed the first.
    expect(firstListener).toHaveBeenCalledTimes(1);

    // The stale handle must not reach through and close the live listener.
    unsubscribeFirst();
    expect(secondListener).not.toHaveBeenCalled();

    unsubscribeSecond();
    expect(secondListener).toHaveBeenCalledTimes(1);
  });

  it("does not mirror activeProp onto an account that signed in mid-write", async () => {
    const persister = new FirebaseSettingsPersister();

    // The settings write completes, and the account changes while it is open.
    setDoc.mockImplementationOnce(async () => {
      auth.currentUser = { uid: "user-b", isAnonymous: false };
    });

    await persister.saveSettings({ leftPropType: PropType.FAN } as never);

    const mirrored = setDoc.mock.calls
      .map(([ref]) => (ref as { path?: string })?.path)
      .filter((path) => path === "users/user-a" || path === "users/user-b");

    expect(mirrored).not.toContain("users/user-b");
  });

  it("writes settings and the activeProp mirror to the same account", async () => {
    const persister = new FirebaseSettingsPersister();

    await persister.saveSettings({ leftPropType: PropType.FAN } as never);

    const paths = setDoc.mock.calls.map(
      ([ref]) => (ref as { path?: string })?.path
    );
    expect(paths).toContain("users/user-a/settings/preferences");
    expect(paths).toContain("users/user-a");
  });

  it("mirrors again for a different account with the same prop", async () => {
    const persister = new FirebaseSettingsPersister();

    await persister.saveSettings({ leftPropType: PropType.FAN } as never);
    auth.currentUser = { uid: "user-b", isAnonymous: false };
    await persister.saveSettings({ leftPropType: PropType.FAN } as never);

    const paths = setDoc.mock.calls.map(
      ([ref]) => (ref as { path?: string })?.path
    );
    // An unscoped "last mirrored prop" cache would skip user-b entirely.
    expect(paths).toContain("users/user-b");
  });
});
