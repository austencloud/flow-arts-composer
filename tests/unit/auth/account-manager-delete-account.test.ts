import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  deleteDoc: vi.fn(),
  deleteUser: vi.fn(),
  getFirestoreInstance: vi.fn(),
  reauthenticateWithGoogle: vi.fn(),
  setDoc: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  deleteUser: h.deleteUser,
  EmailAuthProvider: { credential: vi.fn() },
  reauthenticateWithCredential: vi.fn(),
  updatePassword: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  deleteDoc: h.deleteDoc,
  doc: vi.fn(),
  setDoc: h.setDoc,
}));

const authRef = vi.hoisted(() => ({ currentUser: null as any }));

vi.mock("$lib/shared/auth/firebase", () => ({
  auth: authRef,
  getFirestoreInstance: h.getFirestoreInstance,
  shutdownFirestoreForCacheClear: vi.fn(),
}));

vi.mock("$lib/shared/auth/utils/nuclear-cache-clear", () => ({
  nuclearCacheClear: vi.fn(),
}));

vi.mock("$lib/shared/auth/services/authenticator", () => ({
  reauthenticateWithFacebook: vi.fn(),
  reauthenticateWithGoogle: h.reauthenticateWithGoogle,
  reauthenticateWithInstagram: vi.fn(),
}));

vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: { signOut: h.signOut },
}));

import { AccountManager } from "$lib/shared/auth/services/account-manager";

beforeEach(() => {
  vi.clearAllMocks();
  authRef.currentUser = null;
});

describe("AccountManager.deleteAccount", () => {
  it("names the linked address when a different Google account reauthenticates", async () => {
    authRef.currentUser = {
      uid: "backup-user",
      email: "backup-user@example.com",
      providerData: [
        { providerId: "password", email: "backup-user@example.com" },
        { providerId: "google.com", email: "backup-user@example.com" },
      ],
      getIdTokenResult: vi.fn(async () => ({ claims: {} })),
    };
    h.reauthenticateWithGoogle.mockRejectedValueOnce(
      Object.assign(new Error("Firebase: Error (auth/user-mismatch)."), {
        code: "auth/user-mismatch",
      })
    );

    const deletion = new AccountManager({ trigger: vi.fn() }).deleteAccount({
      method: "google",
    });

    await expect(deletion).rejects.toThrow(
      "That Google account doesn't match this Flow Arts account. Sign in as backup-user@example.com."
    );
    expect(h.deleteUser).not.toHaveBeenCalled();
    expect(h.getFirestoreInstance).not.toHaveBeenCalled();
    expect(h.signOut).not.toHaveBeenCalled();
  });
});
