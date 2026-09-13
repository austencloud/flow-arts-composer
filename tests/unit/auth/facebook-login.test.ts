// Unit coverage for the Facebook login pipeline.
//
// These exercise the code WE own with `firebase/auth` fully mocked, so they run
// in plain node with no emulator and no browser popup. They assert branch
// selection, provider scopes, guard clauses, the collision hand-off, profile-
// picture skip logic, and the kill-switch flag. The real federated credential
// round-trip is covered separately in
// tests/integration/auth-upgrade/facebook-upgrade.e2e.test.ts (auth emulator),
// and the irreducibly-human popup/consent in docs/reference/facebook-login-e2e-checklist.md.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- firebase/auth mock ---------------------------------------------------
// Provider classes record their scopes so we can assert email + public_profile.
const h = vi.hoisted(() => {
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
  class FakeGoogleAuthProvider {
    static PROVIDER_ID = "google.com";
    providerId = "google.com";
    scopes: string[] = [];
    addScope(s: string) {
      this.scopes.push(s);
      return this;
    }
    static credentialFromError = vi.fn();
  }
  return {
    FakeFacebookAuthProvider,
    FakeGoogleAuthProvider,
    signInWithPopup: vi.fn(async () => ({})),
    linkWithPopup: vi.fn(async () => ({})),
    signInWithCredential: vi.fn(async () => ({})),
    updateProfile: vi.fn(async () => undefined),
  };
});

vi.mock("firebase/auth", () => ({
  FacebookAuthProvider: h.FakeFacebookAuthProvider,
  GoogleAuthProvider: h.FakeGoogleAuthProvider,
  EmailAuthProvider: class {
    static credential = vi.fn();
  },
  signInWithPopup: h.signInWithPopup,
  linkWithPopup: h.linkWithPopup,
  signInWithCredential: h.signInWithCredential,
  linkWithCredential: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailLink: vi.fn(),
  sendEmailVerification: vi.fn(),
  setPersistence: vi.fn(async () => undefined),
  unlink: vi.fn(),
  updateProfile: h.updateProfile,
  signOut: vi.fn(),
  browserLocalPersistence: {},
  indexedDBLocalPersistence: {},
}));

// The authenticator's static `auth` export + the lazy getAuthInstance both come
// from the HMR-heavy firebase module. Replace with a controllable fake.
const authRef = vi.hoisted(() => ({ current: { currentUser: null as any } }));
vi.mock("$lib/shared/auth/firebase", () => ({
  auth: authRef.current,
  getAuthInstance: async () => authRef.current,
  getStorageInstance: async () => ({}),
}));

// Don't drag the upgrade module's heavy deps (library repo, gamification) in.
const upgradeRef = vi.hoisted(() => ({
  upgradeAnonymousWithFacebook: vi.fn(),
}));
vi.mock("$lib/shared/auth/services/anonymous-upgrade", () => ({
  upgradeAnonymousWithFacebook: upgradeRef.upgradeAnonymousWithFacebook,
}));

const promptRef = vi.hoisted(() => ({ promptAnonymousImport: vi.fn() }));
vi.mock("$lib/shared/auth/state/anonymous-import-prompt.svelte", () => ({
  promptAnonymousImport: promptRef.promptAnonymousImport,
}));

vi.mock("$lib/shared/auth/services/instagram-auth", () => ({
  authenticateWithInstagram: vi.fn(),
  disconnectInstagramAccount: vi.fn(),
}));

// PROP_TYPE_DISPLAY_REGISTRY pulls a wide import graph; the profile-picture
// tests only need getProviderIds + updateFacebookProfilePictureIfNeeded, so stub
// the registry to keep this a true unit test.
vi.mock(
  "$lib/shared/pictograph/prop/domain/prop-type-display-registry",
  () => ({ PROP_TYPE_DISPLAY_REGISTRY: {} })
);

import { linkWithCredential } from "firebase/auth";
import {
  signInWithFacebook,
  linkFacebookAccount,
} from "$lib/shared/auth/services/authenticator";
import {
  getProviderIds,
  updateFacebookProfilePictureIfNeeded,
} from "$lib/shared/auth/services/profile-picture-manager";
import { FACEBOOK_LOGIN_ENABLED } from "$lib/shared/auth/services/auth-providers.config";
import {
  clearPendingLink,
  consumePendingLinkForUser,
  getPendingLinkEmail,
  hasPendingLink,
  stashPendingLink,
} from "$lib/shared/auth/services/pending-credential-link";

function fbProvider(providerId: string, uid = "p-uid", photoURL?: string) {
  return { providerId, uid, photoURL };
}

beforeEach(() => {
  vi.clearAllMocks();
  authRef.current.currentUser = null;
  clearPendingLink();
});

describe("signInWithFacebook", () => {
  it("non-anonymous user → signInWithPopup with a Facebook provider carrying email + public_profile scopes", async () => {
    authRef.current.currentUser = { isAnonymous: false };

    await signInWithFacebook();

    expect(h.signInWithPopup).toHaveBeenCalledTimes(1);
    expect(upgradeRef.upgradeAnonymousWithFacebook).not.toHaveBeenCalled();

    const [, provider] = h.signInWithPopup.mock.calls[0];
    expect(provider).toBeInstanceOf(h.FakeFacebookAuthProvider);
    expect(provider.scopes).toEqual(["email", "public_profile"]);
  });

  it("no current user → still uses the popup path (treated as non-anonymous)", async () => {
    authRef.current.currentUser = null;
    await signInWithFacebook();
    expect(h.signInWithPopup).toHaveBeenCalledTimes(1);
    expect(upgradeRef.upgradeAnonymousWithFacebook).not.toHaveBeenCalled();
  });

  it("anonymous user → routes to upgradeAnonymousWithFacebook, no popup", async () => {
    authRef.current.currentUser = { isAnonymous: true };
    upgradeRef.upgradeAnonymousWithFacebook.mockResolvedValueOnce({
      status: "linked",
    });

    await signInWithFacebook();

    expect(upgradeRef.upgradeAnonymousWithFacebook).toHaveBeenCalledTimes(1);
    expect(h.signInWithPopup).not.toHaveBeenCalled();
    expect(promptRef.promptAnonymousImport).not.toHaveBeenCalled();
  });

  it("anonymous collision → prompts the anon-import dialog with the captured drafts", async () => {
    authRef.current.currentUser = { isAnonymous: true };
    const importable = [{ id: "d1" }, { id: "d2" }];
    upgradeRef.upgradeAnonymousWithFacebook.mockResolvedValueOnce({
      status: "collision-signed-in",
      importable,
      destinationUid: "collided-account",
    });

    await signInWithFacebook();

    // The offer carries the account the collision signed into, taken from that
    // auth result — not a later "who is signed in now?" lookup.
    expect(promptRef.promptAnonymousImport).toHaveBeenCalledWith(
      importable,
      "collided-account"
    );
  });

  it("anonymous collision with no importable → prompts with empty array (no throw)", async () => {
    authRef.current.currentUser = { isAnonymous: true };
    upgradeRef.upgradeAnonymousWithFacebook.mockResolvedValueOnce({
      status: "collision-signed-in",
      destinationUid: "collided-account",
    });

    await signInWithFacebook();

    expect(promptRef.promptAnonymousImport).toHaveBeenCalledWith(
      [],
      "collided-account"
    );
  });
});

describe("signInWithFacebook — account-exists collision (F2)", () => {
  it("stashes the pending Facebook credential and rethrows so the UI can guide", async () => {
    authRef.current.currentUser = { isAnonymous: false };
    const collision = {
      code: "auth/account-exists-with-different-credential",
      customData: { email: "taken@example.com" },
    };
    h.signInWithPopup.mockRejectedValueOnce(collision);
    h.FakeFacebookAuthProvider.credentialFromError.mockReturnValueOnce({
      providerId: "facebook.com",
    });

    await expect(signInWithFacebook()).rejects.toBe(collision);

    expect(hasPendingLink()).toBe(true);
    expect(getPendingLinkEmail()).toBe("taken@example.com");
  });

  it("does not stash on unrelated popup errors", async () => {
    authRef.current.currentUser = { isAnonymous: false };
    h.signInWithPopup.mockRejectedValueOnce({
      code: "auth/popup-closed-by-user",
    });

    await expect(signInWithFacebook()).rejects.toMatchObject({
      code: "auth/popup-closed-by-user",
    });
    expect(hasPendingLink()).toBe(false);
  });
});

describe("consumePendingLinkForUser (F2/F3 resolution)", () => {
  it("links the stashed credential when the signed-in email matches", async () => {
    stashPendingLink(
      { providerId: "facebook.com" } as any,
      "match@example.com"
    );
    const user = {
      email: "match@example.com",
      providerData: [fbProvider("google.com")],
    } as any;

    const linked = await consumePendingLinkForUser(user);

    expect(linked).toBe("facebook.com");
    expect(linkWithCredential).toHaveBeenCalledTimes(1);
    expect(hasPendingLink()).toBe(false); // cleared after success
  });

  it("keeps the stash and does NOT link when a different account signs in", async () => {
    stashPendingLink(
      { providerId: "facebook.com" } as any,
      "owner@example.com"
    );
    const user = {
      email: "someone-else@example.com",
      providerData: [fbProvider("google.com")],
    } as any;

    const linked = await consumePendingLinkForUser(user);

    expect(linked).toBeNull();
    expect(linkWithCredential).not.toHaveBeenCalled();
    expect(hasPendingLink()).toBe(true); // still waiting for the right account
  });

  it("no-ops (and clears) when the provider is already linked", async () => {
    stashPendingLink(
      { providerId: "facebook.com" } as any,
      "match@example.com"
    );
    const user = {
      email: "match@example.com",
      providerData: [fbProvider("facebook.com")],
    } as any;

    const linked = await consumePendingLinkForUser(user);

    expect(linked).toBeNull();
    expect(linkWithCredential).not.toHaveBeenCalled();
    expect(hasPendingLink()).toBe(false);
  });

  it("drops a stale credential when linking throws", async () => {
    stashPendingLink(
      { providerId: "facebook.com" } as any,
      "match@example.com"
    );
    vi.mocked(linkWithCredential).mockRejectedValueOnce({
      code: "auth/invalid-credential",
    });
    const user = {
      email: "match@example.com",
      providerData: [fbProvider("google.com")],
    } as any;

    const linked = await consumePendingLinkForUser(user);

    expect(linked).toBeNull();
    expect(hasPendingLink()).toBe(false); // dropped, won't retry forever
  });

  it("returns null when nothing is stashed", async () => {
    const user = { email: "x@example.com", providerData: [] } as any;
    expect(await consumePendingLinkForUser(user)).toBeNull();
  });
});

describe("linkFacebookAccount", () => {
  it("throws when no user is signed in", async () => {
    authRef.current.currentUser = null;
    await expect(linkFacebookAccount()).rejects.toThrow(
      "No user is currently signed in"
    );
    expect(h.linkWithPopup).not.toHaveBeenCalled();
  });

  it("throws when Facebook is already linked", async () => {
    authRef.current.currentUser = {
      providerData: [fbProvider("facebook.com")],
    };
    await expect(linkFacebookAccount()).rejects.toThrow("already linked");
    expect(h.linkWithPopup).not.toHaveBeenCalled();
  });

  it("links via popup with the correct scopes when not yet linked", async () => {
    authRef.current.currentUser = {
      providerData: [fbProvider("google.com")],
    };

    await linkFacebookAccount();

    expect(h.linkWithPopup).toHaveBeenCalledTimes(1);
    const [, provider] = h.linkWithPopup.mock.calls[0];
    expect(provider).toBeInstanceOf(h.FakeFacebookAuthProvider);
    expect(provider.scopes).toEqual(["email", "public_profile"]);
  });
});

describe("getProviderIds (Facebook)", () => {
  it("extracts facebookId", () => {
    const user = {
      providerData: [fbProvider("facebook.com", "fb-123")],
    } as any;
    expect(getProviderIds(user)).toEqual({ facebookId: "fb-123" });
  });

  it("extracts both google and facebook ids", () => {
    const user = {
      providerData: [
        fbProvider("google.com", "g-1"),
        fbProvider("facebook.com", "fb-1"),
      ],
    } as any;
    expect(getProviderIds(user)).toEqual({
      googleId: "g-1",
      facebookId: "fb-1",
    });
  });

  it("returns empty object when no oauth providers", () => {
    const user = { providerData: [fbProvider("password", "")] } as any;
    expect(getProviderIds(user)).toEqual({});
  });
});

describe("updateFacebookProfilePictureIfNeeded", () => {
  it("does nothing when there is no facebook provider", async () => {
    const user = {
      providerData: [fbProvider("google.com")],
      photoURL: null,
    } as any;
    await updateFacebookProfilePictureIfNeeded(user);
    expect(h.updateProfile).not.toHaveBeenCalled();
  });

  it("skips when the photo is a custom firebase-storage avatar", async () => {
    const user = {
      providerData: [fbProvider("facebook.com", "fb-1")],
      photoURL: "https://firebasestorage.googleapis.com/x.png",
    } as any;
    await updateFacebookProfilePictureIfNeeded(user);
    expect(h.updateProfile).not.toHaveBeenCalled();
  });

  it("skips when a Google account is also linked (Google photo preferred)", async () => {
    const user = {
      providerData: [
        fbProvider("facebook.com", "fb-1"),
        fbProvider("google.com", "g-1"),
      ],
      photoURL: null,
    } as any;
    await updateFacebookProfilePictureIfNeeded(user);
    expect(h.updateProfile).not.toHaveBeenCalled();
  });

  it("skips when the photo is already a graph.facebook.com url", async () => {
    const user = {
      providerData: [fbProvider("facebook.com", "fb-1")],
      photoURL: "https://graph.facebook.com/fb-1/picture?type=large",
    } as any;
    await updateFacebookProfilePictureIfNeeded(user);
    expect(h.updateProfile).not.toHaveBeenCalled();
  });

  it("sets the high-res graph url when a fresh facebook user has no usable photo", async () => {
    const user = {
      providerData: [fbProvider("facebook.com", "fb-99")],
      photoURL: null,
    } as any;
    await updateFacebookProfilePictureIfNeeded(user);
    expect(h.updateProfile).toHaveBeenCalledTimes(1);
    const [, profile] = h.updateProfile.mock.calls[0];
    expect(profile.photoURL).toBe(
      "https://graph.facebook.com/fb-99/picture?type=large"
    );
  });
});

describe("kill switch", () => {
  it("keeps Facebook entry points off until a non-role account passes production", () => {
    // Meta currently accepts consent and then rejects people without an app
    // role. Keep this assertion paired with the reviewed kill switch so a
    // provider-only test cannot accidentally expose the broken public path.
    expect(FACEBOOK_LOGIN_ENABLED).toBe(false);
  });
});
