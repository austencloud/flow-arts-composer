// Unit coverage for the Google One Tap / FedCM sign-in path
// (`signInWithGoogleCredential`, called by GoogleOneTap.svelte).
//
// SP2 anonymous-account preservation: a guest who taps One Tap after saving a
// sequence must LINK the credential onto their anonymous session (preserving
// the uid + the saved sequence), not do a plain sign-in that orphans it. These
// assert the branch selection with `firebase/auth` and the upgrade module fully
// mocked, so they run in plain jsdom with no emulator and no FedCM prompt.
// Mirrors tests/unit/auth/facebook-login.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- firebase/auth mock ---------------------------------------------------
// GoogleAuthProvider.credential(idToken) records the token so we can assert the
// exact credential flows through to the link/sign-in call.
const h = vi.hoisted(() => {
  class FakeGoogleAuthProvider {
    static PROVIDER_ID = "google.com";
    providerId = "google.com";
    scopes: string[] = [];
    addScope(s: string) {
      this.scopes.push(s);
      return this;
    }
    static credential = vi.fn((idToken: string) => ({
      providerId: "google.com",
      __idToken: idToken,
    }));
    static credentialFromError = vi.fn();
  }
  class FakeFacebookAuthProvider {
    static PROVIDER_ID = "facebook.com";
    providerId = "facebook.com";
    scopes: string[] = [];
    addScope(s: string) {
      this.scopes.push(s);
      return this;
    }
    static credentialFromError = vi.fn();
  }
  return {
    FakeGoogleAuthProvider,
    FakeFacebookAuthProvider,
    signInWithCredential: vi.fn(async () => ({})),
    signInWithPopup: vi.fn(async () => ({})),
    linkWithPopup: vi.fn(async () => ({})),
  };
});

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: h.FakeGoogleAuthProvider,
  FacebookAuthProvider: h.FakeFacebookAuthProvider,
  EmailAuthProvider: class {
    static credential = vi.fn();
  },
  browserLocalPersistence: {},
  indexedDBLocalPersistence: {},
  createUserWithEmailAndPassword: vi.fn(),
  linkWithCredential: vi.fn(),
  linkWithPopup: h.linkWithPopup,
  reauthenticateWithCredential: vi.fn(),
  reauthenticateWithPopup: vi.fn(),
  sendEmailVerification: vi.fn(),
  setPersistence: vi.fn(async () => undefined),
  signInWithCredential: h.signInWithCredential,
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: h.signInWithPopup,
  signOut: vi.fn(),
  unlink: vi.fn(),
  updateProfile: vi.fn(),
}));

// The authenticator's static `auth` export + the lazy getAuthInstance both come
// from the HMR-heavy firebase module. Replace with a controllable fake.
const authRef = vi.hoisted(() => ({ current: { currentUser: null as any } }));
vi.mock("$lib/shared/auth/firebase", () => ({
  auth: authRef.current,
  getAuthInstance: async () => authRef.current,
  getStorageInstance: async () => ({}),
}));

// Don't drag the upgrade module's heavy deps (library repo, gamification, Dexie)
// in — the routing under test only calls the exported functions.
const upgradeRef = vi.hoisted(() => ({
  upgradeAnonymousWithGoogleCredential: vi.fn(),
  upgradeAnonymousWithFacebook: vi.fn(),
  captureAnonymousDrafts: vi.fn(async () => []),
  notifyUpgradeSignup: vi.fn(),
}));
vi.mock("$lib/shared/auth/services/anonymous-upgrade", () => ({
  upgradeAnonymousWithGoogleCredential:
    upgradeRef.upgradeAnonymousWithGoogleCredential,
  upgradeAnonymousWithFacebook: upgradeRef.upgradeAnonymousWithFacebook,
  captureAnonymousDrafts: upgradeRef.captureAnonymousDrafts,
  notifyUpgradeSignup: upgradeRef.notifyUpgradeSignup,
}));

const promptRef = vi.hoisted(() => ({ promptAnonymousImport: vi.fn() }));
vi.mock("$lib/shared/auth/state/anonymous-import-prompt.svelte", () => ({
  promptAnonymousImport: promptRef.promptAnonymousImport,
}));

vi.mock("$lib/shared/auth/services/instagram-auth", () => ({
  authenticateWithInstagram: vi.fn(),
  disconnectInstagramAccount: vi.fn(),
}));

import { signInWithGoogleCredential } from "$lib/shared/auth/services/authenticator";

beforeEach(() => {
  vi.clearAllMocks();
  authRef.current.currentUser = null;
});

describe("signInWithGoogleCredential (One Tap / FedCM)", () => {
  it("builds the Google credential from the ID token", async () => {
    authRef.current.currentUser = { isAnonymous: false };

    await signInWithGoogleCredential("id-token-123");

    expect(h.FakeGoogleAuthProvider.credential).toHaveBeenCalledWith(
      "id-token-123"
    );
  });

  it("non-anonymous user → plain signInWithCredential, no upgrade, no prompt", async () => {
    authRef.current.currentUser = { isAnonymous: false };

    await signInWithGoogleCredential("id-token-123");

    expect(h.signInWithCredential).toHaveBeenCalledTimes(1);
    const [, credential] = h.signInWithCredential.mock.calls[0];
    expect(credential).toMatchObject({ __idToken: "id-token-123" });
    expect(
      upgradeRef.upgradeAnonymousWithGoogleCredential
    ).not.toHaveBeenCalled();
    expect(promptRef.promptAnonymousImport).not.toHaveBeenCalled();
  });

  it("no current user → still uses the plain sign-in path (treated as non-anonymous)", async () => {
    authRef.current.currentUser = null;

    await signInWithGoogleCredential("id-token-123");

    expect(h.signInWithCredential).toHaveBeenCalledTimes(1);
    expect(
      upgradeRef.upgradeAnonymousWithGoogleCredential
    ).not.toHaveBeenCalled();
  });

  it("anonymous user → links the credential via upgradeAnonymousWithGoogleCredential, no plain sign-in", async () => {
    const anon = { isAnonymous: true, uid: "anon-1" };
    authRef.current.currentUser = anon;
    upgradeRef.upgradeAnonymousWithGoogleCredential.mockResolvedValueOnce({
      status: "linked",
    });

    await signInWithGoogleCredential("id-token-123");

    expect(
      upgradeRef.upgradeAnonymousWithGoogleCredential
    ).toHaveBeenCalledTimes(1);
    const [passedAnon, credential] =
      upgradeRef.upgradeAnonymousWithGoogleCredential.mock.calls[0];
    expect(passedAnon).toBe(anon);
    expect(credential).toMatchObject({ __idToken: "id-token-123" });
    // Plain sign-in must NOT run — that's the path that would orphan the guest.
    expect(h.signInWithCredential).not.toHaveBeenCalled();
    expect(promptRef.promptAnonymousImport).not.toHaveBeenCalled();
  });

  it("anonymous collision → prompts the anon-import dialog with the captured drafts", async () => {
    authRef.current.currentUser = { isAnonymous: true, uid: "anon-1" };
    const importable = [{ id: "d1" }, { id: "d2" }];
    upgradeRef.upgradeAnonymousWithGoogleCredential.mockResolvedValueOnce({
      status: "collision-signed-in",
      importable,
      destinationUid: "collided-account",
    });

    await signInWithGoogleCredential("id-token-123");

    // The offer carries the account the collision signed into, taken from that
    // auth result — not a later "who is signed in now?" lookup.
    expect(promptRef.promptAnonymousImport).toHaveBeenCalledWith(
      importable,
      "collided-account"
    );
    expect(h.signInWithCredential).not.toHaveBeenCalled();
  });

  it("anonymous collision with no importable → prompts with empty array (no throw)", async () => {
    authRef.current.currentUser = { isAnonymous: true, uid: "anon-1" };
    upgradeRef.upgradeAnonymousWithGoogleCredential.mockResolvedValueOnce({
      status: "collision-signed-in",
      destinationUid: "collided-account",
    });

    await signInWithGoogleCredential("id-token-123");

    expect(promptRef.promptAnonymousImport).toHaveBeenCalledWith(
      [],
      "collided-account"
    );
  });
});
