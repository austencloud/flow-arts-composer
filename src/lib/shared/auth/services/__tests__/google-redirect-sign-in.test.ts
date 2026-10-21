import { beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  getRedirectResult: vi.fn(),
  linkWithRedirect: vi.fn(),
  signInWithRedirect: vi.fn(),
}));
const auth = vi.hoisted(() => ({
  currentUser: null as { uid: string; isAnonymous: boolean } | null,
}));
const platform = vi.hoisted(() => ({ value: "ios", authDomain: "" }));
const analytics = vi.hoisted(() => ({
  trackAuthProviderResult: vi.fn(),
  resumeAuthEncounter: vi.fn(),
}));
const upgrade = vi.hoisted(() => ({
  notifyUpgradeSignup: vi.fn(),
  signInAfterGoogleLinkCollision: vi.fn(),
}));
const promptAnonymousImport = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class {
    addScope() {}
  },
  ...firebase,
}));
vi.mock("#lib/shared/auth/firebase.js", () => ({
  getAuthInstance: async () => auth,
}));
vi.mock("#lib/shared/auth/auth-domain.js", () => ({
  resolveAuthDomain: () => platform.authDomain,
}));
vi.mock("#lib/shared/auth/get-in-app-browser-detector.js", () => ({
  getInAppBrowserDetector: () => ({ getPlatform: () => platform.value }),
}));
vi.mock("#lib/shared/analytics/auth-events.js", () => ({
  getAuthEncounterProperties: () => ({ surface: "sheet", origin: "save" }),
  ...analytics,
}));
vi.mock("#lib/shared/auth/services/auth-analytics-bridge.js", () => ({
  clearAuthSubmissionBridge: vi.fn(),
  getAuthSubmissionContext: () => ({}),
  restoreAuthSubmissionContext: vi.fn(),
}));
vi.mock("#lib/shared/auth/services/auth-error-messages.js", () => ({
  getAuthErrorCode: (error: { code?: string }) => error?.code,
  isExpectedAuthInterruption: () => false,
  mapAuthError: () => "Sign-in failed.",
}));
vi.mock("#lib/shared/auth/services/last-auth-method.svelte.js", () => ({
  recordLastAuthMethod: vi.fn(),
}));
vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  captureException: vi.fn(),
}));
vi.mock("../anonymous-upgrade", () => upgrade);
vi.mock("#lib/shared/auth/state/anonymous-import-prompt.svelte.js", () => ({
  promptAnonymousImport,
}));
vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({
  toast: { error: toastError },
}));

import {
  abandonPendingGoogleRedirect,
  completePendingGoogleRedirect,
  shouldUseGoogleRedirect,
  startGoogleRedirect,
} from "../google-redirect-sign-in";
import type { Auth } from "firebase/auth";

async function leaveForGoogle() {
  firebase.signInWithRedirect.mockReturnValue(new Promise(() => {}));
  firebase.linkWithRedirect.mockReturnValue(new Promise(() => {}));
  void startGoogleRedirect(auth as unknown as Auth);
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  auth.currentUser = null;
  platform.value = "ios";
  platform.authDomain = window.location.hostname;
});

describe("shouldUseGoogleRedirect", () => {
  it("redirects on iOS when the auth handler is first-party", () => {
    expect(shouldUseGoogleRedirect()).toBe(true);
  });

  it("keeps the popup where the handler lives on another host", () => {
    platform.authDomain = "the-kinetic-alphabet.firebaseapp.com";
    expect(shouldUseGoogleRedirect()).toBe(false);
  });

  it("keeps the popup off iOS", () => {
    platform.value = "android";
    expect(shouldUseGoogleRedirect()).toBe(false);
  });
});

describe("completePendingGoogleRedirect", () => {
  it("does nothing on a page load this tab did not start", async () => {
    await completePendingGoogleRedirect();
    expect(firebase.getRedirectResult).not.toHaveBeenCalled();
  });

  it("logs a completed sign-in and resumes the tracked flow", async () => {
    await leaveForGoogle();
    firebase.getRedirectResult.mockResolvedValue({ user: { uid: "u1" } });

    await completePendingGoogleRedirect();

    expect(analytics.resumeAuthEncounter).toHaveBeenCalledWith({
      surface: "sheet",
      origin: "save",
    });
    expect(analytics.trackAuthProviderResult).toHaveBeenCalledWith(
      "google",
      "completed"
    );
    expect(upgrade.notifyUpgradeSignup).not.toHaveBeenCalled();
  });

  it("reports a guest upgrade through the same signup path as the popup", async () => {
    auth.currentUser = { uid: "anon", isAnonymous: true };
    await leaveForGoogle();
    expect(firebase.linkWithRedirect).toHaveBeenCalled();
    const user = { uid: "anon" };
    firebase.getRedirectResult.mockResolvedValue({ user });

    await completePendingGoogleRedirect();

    expect(upgrade.notifyUpgradeSignup).toHaveBeenCalledWith(user);
  });

  it("logs a return with no result instead of staying silent", async () => {
    await leaveForGoogle();
    firebase.getRedirectResult.mockResolvedValue(null);

    await completePendingGoogleRedirect();

    expect(analytics.trackAuthProviderResult).toHaveBeenCalledWith(
      "google",
      "interrupted",
      "redirect_no_result"
    );
  });

  it("signs a guest into the Google account that already exists and offers their work", async () => {
    auth.currentUser = { uid: "anon", isAnonymous: true };
    await leaveForGoogle();
    const collision = { code: "auth/credential-already-in-use" };
    firebase.getRedirectResult.mockRejectedValue(collision);
    upgrade.signInAfterGoogleLinkCollision.mockResolvedValue({
      status: "collision-signed-in",
      importable: [{ id: "d1" }],
      destinationUid: "u2",
    });

    await completePendingGoogleRedirect();

    expect(upgrade.signInAfterGoogleLinkCollision).toHaveBeenCalledWith(
      auth,
      "anon",
      collision
    );
    expect(promptAnonymousImport).toHaveBeenCalledWith([{ id: "d1" }], "u2");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("shows and logs a failure", async () => {
    await leaveForGoogle();
    firebase.getRedirectResult.mockRejectedValue({
      code: "auth/network-request-failed",
    });

    await completePendingGoogleRedirect();

    expect(analytics.trackAuthProviderResult).toHaveBeenCalledWith(
      "google",
      "failed",
      "auth/network-request-failed"
    );
    expect(toastError).toHaveBeenCalledWith("Sign-in failed.");
  });

  it("reads the outcome once, so a reload does not log it again", async () => {
    await leaveForGoogle();
    firebase.getRedirectResult.mockResolvedValue({ user: { uid: "u1" } });

    await completePendingGoogleRedirect();
    await completePendingGoogleRedirect();

    expect(firebase.getRedirectResult).toHaveBeenCalledTimes(1);
  });
});

describe("abandonPendingGoogleRedirect", () => {
  it("logs a Back-button return and clears the crumb", async () => {
    await leaveForGoogle();

    abandonPendingGoogleRedirect();
    await completePendingGoogleRedirect();

    expect(analytics.trackAuthProviderResult).toHaveBeenCalledWith(
      "google",
      "interrupted",
      "redirect_back"
    );
    expect(firebase.getRedirectResult).not.toHaveBeenCalled();
  });
});
