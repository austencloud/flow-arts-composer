import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const googleProviders: FakeGoogleAuthProvider[] = [];

  class FakeGoogleAuthProvider {
    static PROVIDER_ID = "google.com";
    static credential = vi.fn();
    static credentialFromError = vi.fn();
    scopes: string[] = [];
    customParameters: Record<string, string> = {};

    constructor() {
      googleProviders.push(this);
    }

    addScope(scope: string) {
      this.scopes.push(scope);
      return this;
    }

    setCustomParameters(parameters: Record<string, string>) {
      this.customParameters = parameters;
      return this;
    }
  }

  class FakeFacebookAuthProvider {
    static credentialFromError = vi.fn();

    addScope() {
      return this;
    }
  }

  return {
    FakeFacebookAuthProvider,
    FakeGoogleAuthProvider,
    googleProviders,
    reauthenticateWithPopup: vi.fn(async () => undefined),
  };
});

vi.mock("firebase/auth", () => ({
  EmailAuthProvider: { credential: vi.fn() },
  FacebookAuthProvider: h.FakeFacebookAuthProvider,
  GoogleAuthProvider: h.FakeGoogleAuthProvider,
  createUserWithEmailAndPassword: vi.fn(),
  linkWithCredential: vi.fn(),
  linkWithPopup: vi.fn(),
  reauthenticateWithCredential: vi.fn(),
  reauthenticateWithPopup: h.reauthenticateWithPopup,
  sendEmailVerification: vi.fn(),
  signInWithCredential: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  unlink: vi.fn(),
  updateProfile: vi.fn(),
}));

const authRef = vi.hoisted(() => ({ currentUser: null as any }));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  auth: authRef,
  configureAuthPersistence: vi.fn(),
  getAuthInstance: async () => authRef,
}));

vi.mock("#lib/shared/desktop/is-desktop.js", () => ({
  isDesktop: () => false,
}));
vi.mock("#lib/shared/platform/services/platform-detector.js", () => ({
  isNative: () => false,
}));
vi.mock("#lib/shared/auth/services/anonymous-upgrade.js", () => ({
  captureAnonymousDrafts: vi.fn(),
  notifyUpgradeSignup: vi.fn(),
  upgradeAnonymousWithFacebook: vi.fn(),
  upgradeAnonymousWithGoogleCredential: vi.fn(),
}));
vi.mock("#lib/shared/auth/state/anonymous-import-prompt.svelte.js", () => ({
  promptAnonymousImport: vi.fn(),
}));
vi.mock("#lib/shared/auth/services/pending-credential-link.js", () => ({
  clearPendingLink: vi.fn(),
  stashPendingLink: vi.fn(),
}));
vi.mock("#lib/shared/auth/services/last-auth-method.svelte.js", () => ({
  recordLastAuthMethod: vi.fn(),
}));
vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  captureWhenReady: vi.fn(),
}));
vi.mock("#lib/shared/auth/services/instagram-auth.js", () => ({
  authenticateWithInstagram: vi.fn(),
  disconnectInstagramAccount: vi.fn(),
}));

import { reauthenticateWithGoogle } from "#lib/shared/auth/services/authenticator.js";

beforeEach(() => {
  vi.clearAllMocks();
  h.googleProviders.length = 0;
  authRef.currentUser = null;
});

describe("reauthenticateWithGoogle", () => {
  it("hints the linked Google email so the popup targets the right account", async () => {
    const user = {
      email: "firebase@example.com",
      providerData: [
        { providerId: "password", email: "firebase@example.com" },
        { providerId: "google.com", email: "linked-google@example.com" },
      ],
    };
    authRef.currentUser = user;

    await reauthenticateWithGoogle();

    const provider = h.googleProviders[0];
    expect(provider.customParameters).toEqual({
      login_hint: "linked-google@example.com",
    });
    expect(provider.scopes).toEqual(["email", "profile"]);
    expect(h.reauthenticateWithPopup).toHaveBeenCalledWith(user, provider);
  });

  it("falls back to the Firebase user email when provider data omits it", async () => {
    authRef.currentUser = {
      email: "linked-google@example.com",
      providerData: [{ providerId: "google.com", email: null }],
    };

    await reauthenticateWithGoogle();

    expect(h.googleProviders[0].customParameters).toEqual({
      login_hint: "linked-google@example.com",
    });
  });
});
