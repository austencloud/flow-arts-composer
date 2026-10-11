import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  order: [] as string[],
  nuclearCacheClear: vi.fn(async () => {
    h.order.push("clear-storage");
  }),
  shutdownFirestoreForCacheClear: vi.fn(async () => {
    h.order.push("shutdown-firestore");
  }),
  signOut: vi.fn(async () => {
    h.order.push("sign-out");
  }),
}));

vi.mock("firebase/auth", () => ({
  deleteUser: vi.fn(),
  EmailAuthProvider: { credential: vi.fn() },
  reauthenticateWithCredential: vi.fn(),
  updatePassword: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  auth: { currentUser: null },
  getFirestoreInstance: vi.fn(),
  shutdownFirestoreForCacheClear: h.shutdownFirestoreForCacheClear,
}));

vi.mock("#lib/shared/auth/utils/nuclear-cache-clear.js", () => ({
  nuclearCacheClear: h.nuclearCacheClear,
}));

vi.mock("#lib/shared/auth/services/authenticator.js", () => ({
  reauthenticateWithFacebook: vi.fn(),
  reauthenticateWithGoogle: vi.fn(),
  reauthenticateWithInstagram: vi.fn(),
}));

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: { signOut: h.signOut },
}));

import { AccountManager } from "#lib/shared/auth/services/account-manager.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  h.order.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AccountManager.clearCache", () => {
  it("stops auth listeners and Firestore before deleting browser databases", async () => {
    const haptics = { trigger: vi.fn() };

    await new AccountManager(haptics).clearCache();

    expect(h.order).toEqual([
      "sign-out",
      "shutdown-firestore",
      "clear-storage",
    ]);
    expect(haptics.trigger).toHaveBeenCalledWith("selection");
    expect(vi.getTimerCount()).toBe(1);
  });

  it("continues repairing storage if Firebase sign-out itself is broken", async () => {
    h.signOut.mockRejectedValueOnce(new Error("auth storage unavailable"));

    await new AccountManager({ trigger: vi.fn() }).clearCache();

    expect(h.shutdownFirestoreForCacheClear).toHaveBeenCalledTimes(1);
    expect(h.nuclearCacheClear).toHaveBeenCalledTimes(1);
  });
});
