/**
 * Auth Submission -> PostHog Bridge
 *
 * `user_signed_up` (the funnel's terminal event) fires from
 * auth-state.svelte.ts, deep inside Firebase's onAuthStateChanged listener.
 * That file only ever sees "a user object appeared" - it has no idea which
 * button the visitor just pressed - and it belongs to a different workstream,
 * so threading `method`/`auth_mode` into its existing capture call isn't an
 * option here.
 *
 * PostHog's `register_for_session` solves this without threading a prop
 * through four component layers: it attaches the given properties to every
 * event this browser fires for the rest of the current session. Call it the
 * moment a credential is submitted (the same instant `trackAuthModalSubmitted`
 * fires) and the very next capture() call - `user_signed_up`, fired from the
 * auth-state-change handler this submission triggers - picks up `method` and
 * `auth_mode` automatically. Session-scoped (not the indefinite `register`) so
 * a submission that somehow never gets cleared expires with the tab instead of
 * tagging next month's events too.
 *
 * TIMING IS LOAD-BEARING. onAuthStateChanged fires within milliseconds of the
 * credential call resolving, so `recordAuthSubmission` must run IMMEDIATELY
 * after that call - before any profile update, verification email, or UX-pacing
 * delay. EmailPasswordAuth's signup branch originally called it after a 1200ms
 * success-message pause, which meant `user_signed_up` had already shipped
 * unenriched and the late registration then rode along on unrelated events for
 * the rest of the session. Both halves of that bug were the same ordering
 * mistake.
 *
 * `clearAuthSubmissionBridge` still runs the moment the modal's outcome is
 * settled (success or abandonment - see SiteHeader.svelte and
 * AuthModal.svelte), so a stale method/auth_mode never rides along later.
 *
 * Spec: docs/architecture/landing-analytics-taxonomy.md §4
 */

import { browser } from "$app/env";
import { getPostHogInstance } from "#lib/shared/analytics/services/posthog.js";
import {
  trackAuthModalSubmitted,
  getAuthEncounterProperties,
  isAuthFunnelArmed,
  disarmAuthFunnel,
  type AuthMethod,
  type AuthMode,
} from "#lib/shared/analytics/auth-events.js";

/**
 * Magic link is the one method whose submission and completion happen in
 * different browsing contexts. `register_for_session` is backed by
 * sessionStorage (posthog-js's own docs), which is per-tab: the visitor
 * requests the link in tab A, then clicks it from their mail client, which
 * opens tab B with a fresh sessionStorage. Tab B completes the sign-in and
 * fires `user_signed_up` having never seen the registration.
 *
 * So magic_link additionally leaves a localStorage crumb, which survives the
 * tab change, alongside the `emailForSignIn` value the completion path already
 * reads for exactly the same reason. The completion path picks it up and
 * registers there. A different DEVICE still can't be enriched - nothing
 * client-side can bridge that - and that is a documented limit, not a bug.
 */
const PENDING_METHOD_KEY = "tka:auth:pending-method";
let submissionContext: Record<string, string> = {};

/**
 * Fires `auth_modal_submitted` and registers the bridge properties in one
 * call, so every submission call site (SocialAuthCompact, AuthModal's
 * Google-One-Tap/Facebook handlers, EmailLinkAuth, EmailPasswordAuth) only
 * needs this one import instead of remembering to pair the two.
 *
 * Silent when no tracked sign-in flow is open. The forms this is called from
 * are shared with three untracked hosts (see auth-events.ts) - those must not
 * register session properties any more than they emit funnel events.
 */
export function recordAuthSubmission(
  method: AuthMethod,
  authMode?: AuthMode
): void {
  if (!isAuthFunnelArmed()) return;

  trackAuthModalSubmitted(method, authMode);

  const properties = {
    ...getAuthEncounterProperties(),
    method,
    ...(authMode ? { auth_mode: authMode } : {}),
  };
  submissionContext = properties;

  if (method === "magic_link" && browser) {
    // Survives the hop to whichever tab the mailed link opens in.
    try {
      localStorage.setItem(PENDING_METHOD_KEY, JSON.stringify(properties));
    } catch {
      // Private mode / blocked storage: the same-tab registration below still
      // covers the case where they complete in this very tab.
    }
  }

  try {
    getPostHogInstance()?.register_for_session(properties);
  } catch (error) {
    console.warn("[auth-analytics] register_for_session failed", error);
  }
}

/** Stable surface/mode/origin properties for signup and lifecycle events. */
export function getAuthSubmissionContext(): Record<string, string> {
  return { ...submissionContext, ...getAuthEncounterProperties() };
}

/**
 * Called by the magic-link completion path, which runs in a different tab from
 * the one that requested the link. Re-registers what `recordAuthSubmission`
 * stashed so `user_signed_up` lands enriched there too.
 *
 * Must run BEFORE the credential is exchanged, so the registration is in place
 * by the time onAuthStateChanged fires.
 */
export function restorePendingAuthMethod(): void {
  if (!browser) return;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PENDING_METHOD_KEY);
    if (raw) localStorage.removeItem(PENDING_METHOD_KEY);
  } catch {
    return;
  }
  if (!raw) return;

  try {
    const properties = JSON.parse(raw) as Record<string, string>;
    submissionContext = properties;
    getPostHogInstance()?.register_for_session(properties);
  } catch (error) {
    console.warn(
      "[auth-analytics] could not restore pending auth method",
      error
    );
  }
}

/**
 * Drops the bridge properties and ends the tracked flow. Call on modal close,
 * whether the close is a completed sign-in or a genuine abandonment.
 *
 * Deliberately does NOT clear the magic-link crumb: that sign-in completes in
 * a different tab long after this modal is gone, and the crumb is consumed (and
 * removed) by `restorePendingAuthMethod` there.
 */
export function clearAuthSubmissionBridge(): void {
  submissionContext = {};
  disarmAuthFunnel();
  const instance = getPostHogInstance();
  if (!instance) return;
  try {
    instance.unregister_for_session("method");
    instance.unregister_for_session("auth_mode");
  } catch (error) {
    console.warn("[auth-analytics] unregister_for_session failed", error);
  }
}
