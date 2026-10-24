import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  native: false,
  inApp: false,
  authDomain: "localhost",
}));
const startGoogleRedirect = vi.hoisted(() => vi.fn());

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => env.native },
}));
vi.mock("#lib/shared/auth/auth-domain.js", () => ({
  resolveAuthDomain: () => env.authDomain,
}));
vi.mock("#lib/shared/auth/get-in-app-browser-detector.js", () => ({
  getInAppBrowserDetector: () => ({ isInAppBrowser: () => env.inApp }),
}));
vi.mock("#lib/shared/auth/services/google-redirect-sign-in.js", () => ({
  startGoogleRedirect,
}));
vi.mock("$app/navigation", () => ({
  replaceState: (url: URL) => history.replaceState(null, "", url),
}));
vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  captureException: vi.fn(),
}));

import {
  resumeGoogleHandoff,
  withGoogleHandoff,
} from "../google-browser-handoff";
import type { Auth } from "firebase/auth";

function authWith(user: { isAnonymous: boolean } | null): Auth {
  return { currentUser: user } as unknown as Auth;
}

describe("google browser hand-off", () => {
  beforeEach(() => {
    env.native = false;
    env.inApp = false;
    env.authDomain = window.location.hostname;
    startGoogleRedirect.mockReset();
    history.replaceState(
      null,
      "",
      "/create?tab=construct&signin=google#beat-2"
    );
  });

  it("adds the flag without losing the page's own query or hash", () => {
    expect(
      withGoogleHandoff("https://tkaflowarts.com/create?tab=x#beat-2")
    ).toBe("https://tkaflowarts.com/create?tab=x&signin=google#beat-2");
  });

  it("strips the flag and goes to Google on the first-party host", async () => {
    const show = vi.fn();
    const auth = authWith(null);
    await resumeGoogleHandoff(auth, show);
    expect(startGoogleRedirect).toHaveBeenCalledWith(auth);
    expect(show).not.toHaveBeenCalled();
    // Stripped first, so a reload or a shared link never restarts the trip.
    expect(window.location.search).toBe("?tab=construct");
    expect(window.location.hash).toBe("#beat-2");
  });

  it("opens the sign-in sheet where the redirect handler isn't first-party", async () => {
    env.authDomain = "tka-app.firebaseapp.com";
    const show = vi.fn();
    await resumeGoogleHandoff(authWith(null), show);
    expect(show).toHaveBeenCalledOnce();
    expect(startGoogleRedirect).not.toHaveBeenCalled();
  });

  it("never bounces a webview back to Google", async () => {
    env.inApp = true;
    const show = vi.fn();
    await resumeGoogleHandoff(authWith(null), show);
    expect(startGoogleRedirect).not.toHaveBeenCalled();
    expect(show).not.toHaveBeenCalled();
  });

  it("leaves a signed-in account alone but still links a guest", async () => {
    await resumeGoogleHandoff(authWith({ isAnonymous: false }), vi.fn());
    expect(startGoogleRedirect).not.toHaveBeenCalled();

    history.replaceState(null, "", "/?signin=google");
    await resumeGoogleHandoff(authWith({ isAnonymous: true }), vi.fn());
    expect(startGoogleRedirect).toHaveBeenCalledOnce();
  });

  it("does nothing without the flag", async () => {
    history.replaceState(null, "", "/create");
    const show = vi.fn();
    await resumeGoogleHandoff(authWith(null), show);
    expect(startGoogleRedirect).not.toHaveBeenCalled();
    expect(show).not.toHaveBeenCalled();
  });
});
