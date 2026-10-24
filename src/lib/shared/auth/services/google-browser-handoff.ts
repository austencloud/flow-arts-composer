//
// Google sign-in for visitors who arrive inside an in-app browser.
//
// Instagram, Messenger and TikTok open links in their own webview, and Google
// refuses OAuth there (403 disallowed_useragent). The way out is the real
// browser, so the Google button in a webview fires the platform escape (an
// Android intent or iOS's x-safari-https scheme) at this same page with
// ?signin=google added. The browser that opens reads the flag once auth is
// ready and goes straight to Google's account picker by redirect, so the
// visitor taps Google once and comes back signed in, instead of tapping a
// dead button, reading a warning, and finding a second button.
//
// A redirect, not a popup: the browser opened the page without a user gesture,
// so a popup would be blocked. The redirect needs the first-party /__/auth
// handler (see google-redirect-sign-in.ts), which only production has. Other
// hosts open the sign-in sheet so the visitor's next tap is the Google button.
import { Capacitor } from "@capacitor/core";
import type { Auth } from "firebase/auth";
import { replaceState } from "$app/navigation";
import { resolveAuthDomain } from "#lib/shared/auth/auth-domain.js";
import { getInAppBrowserDetector } from "#lib/shared/auth/get-in-app-browser-detector.js";
import { startGoogleRedirect } from "#lib/shared/auth/services/google-redirect-sign-in.js";
import { captureException } from "#lib/shared/analytics/services/posthog.js";

const HANDOFF_PARAM = "signin";
const HANDOFF_VALUE = "google";

/** The page URL a webview hands to the browser when Google is tapped. */
export function withGoogleHandoff(href: string): string {
  try {
    const u = new URL(href);
    u.searchParams.set(HANDOFF_PARAM, HANDOFF_VALUE);
    return u.href;
  } catch {
    return href;
  }
}

/**
 * Read and remove the flag. Removing it first means a reload, a shared link or
 * a Back press never starts a second trip to Google.
 */
function takeGoogleHandoff(): boolean {
  const url = new URL(window.location.href);
  if (url.searchParams.get(HANDOFF_PARAM) !== HANDOFF_VALUE) return false;
  url.searchParams.delete(HANDOFF_PARAM);
  try {
    replaceState(url, {});
  } catch {
    // SvelteKit's router isn't up yet on a cold load; the raw call is safe
    // then because there is no router state to fight.
    history.replaceState(history.state, "", url);
  }
  return true;
}

/**
 * Finish a hand-off from a webview. Inert without the flag. Never runs inside a
 * webview or the native app: the first would bounce off Google again, and the
 * second signs in through its own plugin.
 */
export async function resumeGoogleHandoff(
  auth: Auth,
  showSignIn: () => void
): Promise<void> {
  if (typeof window === "undefined" || !takeGoogleHandoff()) return;
  if (Capacitor.isNativePlatform()) return;
  if (getInAppBrowserDetector().isInAppBrowser()) return;
  // Already signed in to a real account in this browser: nothing to do.
  if (auth.currentUser && !auth.currentUser.isAnonymous) return;

  if (resolveAuthDomain() !== window.location.hostname) {
    showSignIn();
    return;
  }
  try {
    await startGoogleRedirect(auth);
  } catch (error) {
    captureException(error, { surface: "google_browser_handoff" });
    showSignIn();
  }
}
