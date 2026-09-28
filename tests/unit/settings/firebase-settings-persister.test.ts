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
const getDoc = vi.hoisted(() => vi.fn());

vi.mock("firebase/firestore", () => ({
  doc: firestoreDoc,
  getDoc,
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

vi.mock("$lib/shared/auth/loaded-auth", () => ({ loadedAuth: auth }));
vi.mock("$lib/shared/auth/firebase", () => ({
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

// The persister loads Firestore with import(), which takes longer than a few
// microtasks under Vitest. Wait for those loads, then for the awaits chained
// after them. A fixed tick count let one test's unfinished save land in the
// next test.
async function settleAsyncWork(): Promise<void> {
  await vi.dynamicImportSettled();
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

    // Let the doc-ref lookup reach the Firestore instance before it resolves.
    await settleAsyncWork();
    expect(firestoreReady.resolve).not.toBeNull();
    firestoreReady.resolve?.({});
    await settleAsyncWork();

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
    await settleAsyncWork();

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
    await settleAsyncWork();

    const unsubscribeSecond = persister.onSettingsChange(() => {});
    await settleAsyncWork();

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
    // The mirror runs after the save settles.
    await settleAsyncWork();

    const mirrored = setDoc.mock.calls
      .map(([ref]) => (ref as { path?: string })?.path)
      .filter((path) => path === "users/user-a" || path === "users/user-b");

    expect(mirrored).not.toContain("users/user-b");
  });

  it("writes settings and the activeProp mirror to the same account", async () => {
    const persister = new FirebaseSettingsPersister();

    await persister.saveSettings({ leftPropType: PropType.FAN } as never);
    await settleAsyncWork();

    const paths = setDoc.mock.calls.map(
      ([ref]) => (ref as { path?: string })?.path
    );
    expect(paths).toContain("users/user-a/settings/preferences");
    expect(paths).toContain("users/user-a");
  });

  it("mirrors again for a different account with the same prop", async () => {
    const persister = new FirebaseSettingsPersister();

    await persister.saveSettings({ leftPropType: PropType.FAN } as never);
    await settleAsyncWork();
    auth.currentUser = { uid: "user-b", isAnonymous: false };
    await persister.saveSettings({ leftPropType: PropType.FAN } as never);
    await settleAsyncWork();

    const paths = setDoc.mock.calls.map(
      ([ref]) => (ref as { path?: string })?.path
    );
    // An unscoped "last mirrored prop" cache would skip user-b entirely.
    expect(paths).toContain("users/user-b");
  });

  it("mirrors a prop again after another tab moved the account off it", async () => {
    let deliver: ((snapshot: unknown) => void) | null = null;
    onSnapshot.mockImplementation((...args: unknown[]) => {
      deliver = args[1] as (snapshot: unknown) => void;
      return vi.fn();
    });
    const persister = new FirebaseSettingsPersister();
    persister.onSettingsChange(() => {});
    await settleAsyncWork();

    await persister.saveSettings({ leftPropType: PropType.FAN } as never);
    await settleAsyncWork();
    // Another tab picked club, which also moved the public mirror to club.
    deliver?.({
      exists: () => true,
      data: () => ({ leftPropType: PropType.CLUB }),
    });
    await persister.saveSettings({ leftPropType: PropType.FAN } as never);
    await settleAsyncWork();

    const mirrored = setDoc.mock.calls
      .filter(([ref]) => (ref as { path?: string })?.path === "users/user-a")
      .map(([, data]) => (data as { activeProp: string }).activeProp);
    expect(mirrored).toEqual([PropType.FAN, PropType.FAN]);
  });

  it("settles a settings save without waiting for the activeProp mirror", async () => {
    let releaseMirror!: () => void;
    const mirrorOpen = new Promise<void>((resolve) => {
      releaseMirror = resolve;
    });
    setDoc.mockImplementation(async (...args: unknown[]) => {
      if ((args[0] as { path?: string })?.path === "users/user-a") {
        await mirrorOpen;
      }
    });
    const persister = new FirebaseSettingsPersister();

    let saved = false;
    const saving = persister
      .saveSettings({ leftPropType: PropType.FAN } as never)
      .then(() => {
        saved = true;
      });

    // The badge mirror is still open. The caller holds its write slot until
    // this save settles, so waiting on the mirror stretches that window.
    await vi.waitFor(() => {
      const paths = setDoc.mock.calls.map(
        ([ref]) => (ref as { path?: string })?.path
      );
      expect(paths).toContain("users/user-a");
    });
    await vi.waitFor(() => expect(saved).toBe(true));

    releaseMirror();
    await saving;
  });

  it("tells a failed read apart from a missing document", async () => {
    const persister = new FirebaseSettingsPersister();

    getDoc.mockResolvedValueOnce({ exists: () => false });
    await expect(persister.loadSettings()).resolves.toBeNull();

    // Offline with nothing cached, getDoc rejects. Reading that as "no
    // document" made the caller upload this device's copy over the account's.
    getDoc.mockRejectedValueOnce(new Error("client is offline"));
    await expect(persister.loadSettings()).rejects.toThrow("client is offline");
  });
});
