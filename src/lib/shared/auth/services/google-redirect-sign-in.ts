//
// Google sign-in by full-page redirect on iPhone and iPad.
//
// Every iOS browser is WebKit, and there the Google popup opens as a new tab
// that never hands its result back. PostHog shows it: from 2026-09-04 every
// iPhone Google attempt (Mobile Safari and Chrome iOS, all on the Safari 26-era
// "iOS 18.7" user agent) logged auth_modal_submitted and then no
// auth_provider_result at all. The replay of the 2026-10-21 attempt has the
// page going hidden 65 ms after the tap (the popup tab opened fine) and coming
// back 16 s later to a button still reading "Signing in...". Firebase's popup
// promise only settles when the handler reports back or the popup window reads
// as closed, and a tab the visitor walks away from is neither.
//
// A redirect keeps the whole round trip in one tab, so nothing has to cross
// back to an opener. It needs the auth handler to be first-party (Firebase's
// redirect best practices, option 3), which resolveAuthDomain() provides on
// tkaflowarts.com through the /__/auth proxy. Hosts without that proxy
// (localhost, *.pages.dev previews) would leave the result in third-party
// storage the page can't read, so they keep the popup.
import {
  GoogleAuthProvider,
  getRedirectResult,
  linkWithRedirect,
  signInWithRedirect,
  type Auth,
} from "firebase/auth";
import { getAuthInstance } from "#lib/shared/auth/firebase.js";
import { resolveAuthDomain } from "#lib/shared/auth/auth-domain.js";
import { getInAppBrowserDetector } from "#lib/shared/auth/get-in-app-browser-detector.js";
import {
  getAuthEncounterProperties,
  resumeAuthEncounter,
  trackAuthProviderResult,
} from "#lib/shared/analytics/auth-events.js";
import {
  clearAuthSubmissionBridge,
  getAuthSubmissionContext,
  restoreAuthSubmissionContext,
} from "#lib/shared/auth/services/auth-analytics-bridge.js";
import {
  getAuthErrorCode,
  isExpectedAuthInterruption,
  mapAuthError,
} from "#lib/shared/auth/services/auth-error-messages.js";
import { recordLastAuthMethod } from "#lib/shared/auth/services/last-auth-method.svelte.js";
import { captureException } from "#lib/shared/analytics/services/posthog.js";

const PENDING_KEY = "tka:auth:google-redirect";
// A return this late is a stale crumb (a tab restored days later), not the
// sign-in the visitor is waiting on.
const PENDING_TTL_MS = 15 * 60_000;

interface PendingGoogleRedirect {
  startedAt: number;
  /** True when the redirect links Google onto an anonymous guest. */
  upgrade: boolean;
  encounter: Record<string, string>;
  context: Record<string, string>;
}

export function shouldUseGoogleRedirect(): boolean {
  if (typeof window === "undefined") return false;
  if (getInAppBrowserDetector().getPlatform() !== "ios") return false;
  return resolveAuthDomain() === window.location.hostname;
}

function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");
  return provider;
}

function writePending(pending: PendingGoogleRedirect): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // Blocked storage only costs the outcome event; the sign-in still lands.
  }
}

function takePending(): PendingGoogleRedirect | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_KEY);
    const pending = JSON.parse(raw) as PendingGoogleRedirect;
    return Date.now() - pending.startedAt < PENDING_TTL_MS ? pending : null;
  } catch {
    return null;
  }
}

/**
 * Leave for Google. A current anonymous guest is linked in place, so its uid and
 * saved work survive; anyone else signs in. The returned promise never settles
 * on success because the page is navigating away.
 */
export async function startGoogleRedirect(auth: Auth): Promise<never> {
  const anon = auth.currentUser?.isAnonymous ? auth.currentUser : null;
  writePending({
    startedAt: Date.now(),
    upgrade: anon !== null,
    encounter: getAuthEncounterProperties(),
    context: getAuthSubmissionContext(),
  });
  try {
    return anon
      ? await linkWithRedirect(anon, googleProvider())
      : await signInWithRedirect(auth, googleProvider());
  } catch (error) {
    takePending();
    throw error;
  }
}

/**
 * The visitor came back from Google's page with the browser's Back button and
 * Safari restored this page from its back/forward cache, so nothing reloaded
 * and auth never saw a result. Log it and let the caller reset its button. The
 * sign-in surface is still open, so its tracked flow stays armed.
 */
export function abandonPendingGoogleRedirect(): void {
  if (!takePending()) return;
  trackAuthProviderResult("google", "interrupted", "redirect_back");
}

/**
 * Finish a redirect this tab started, once auth has initialized. Firebase has
 * already applied the result during initialization; this reads the outcome so
 * the guest upgrade, collision import and analytics run as they do after a
 * popup. Never throws: a failure becomes a toast and a logged outcome.
 */
export async function completePendingGoogleRedirect(): Promise<void> {
  if (typeof window === "undefined") return;
  const pending = takePending();
  if (!pending) return;

  resumeAuthEncounter(pending.encounter);
  restoreAuthSubmissionContext(pending.context);
  const auth = await getAuthInstance();
  const { notifyUpgradeSignup, signInAfterGoogleLinkCollision } =
    await import("./anonymous-upgrade");

  try {
    const result = await getRedirectResult(auth);
    if (!result) {
      // Backed out of Google's page, or Safari dropped the handler's state.
      trackAuthProviderResult("google", "interrupted", "redirect_no_result");
      return;
    }
    if (pending.upgrade) await notifyUpgradeSignup(result.user);
    recordLastAuthMethod("google");
    trackAuthProviderResult("google", "completed");
  } catch (error) {
    const anon = auth.currentUser?.isAnonymous ? auth.currentUser : null;
    if (pending.upgrade && anon) {
      const collision = await signInAfterGoogleLinkCollision(
        auth,
        anon.uid,
        error
      ).catch(() => null);
      if (collision) {
        const { promptAnonymousImport } =
          await import("#lib/shared/auth/state/anonymous-import-prompt.svelte.js");
        promptAnonymousImport(
          collision.importable ?? [],
          collision.destinationUid
        );
        trackAuthProviderResult("google", "completed");
        return;
      }
    }

    const errorCode = getAuthErrorCode(error) ?? "unknown";
    if (isExpectedAuthInterruption(error)) {
      trackAuthProviderResult("google", "interrupted", errorCode);
    } else {
      trackAuthProviderResult("google", "failed", errorCode);
      captureException(error, {
        auth_error_code: errorCode,
        provider: "google",
        surface: "google_redirect_return",
      });
    }
    const message = mapAuthError(error);
    if (message) {
      const { toast } =
        await import("#lib/shared/toast/state/toast-state.svelte.js");
      toast.error(message);
    }
  } finally {
    clearAuthSubmissionBridge();
  }
}
