/**
 * Magic-link (email-link) sign-in completion.
 *
 * Two phases, deliberately split so the single-use oobCode is never consumed
 * without a human in the loop:
 *
 *  - Detection (`isEmailLinkPending`, `getSavedEmailForSignIn`) is read-only
 *    and safe to call anywhere, including at app boot. It never talks to
 *    Firebase Auth beyond the local `isSignInWithEmailLink` URL check.
 *  - Completion (`completeEmailLinkSignIn`) consumes the oobCode via
 *    Firebase Auth. It must only run after the user explicitly confirms
 *    (EmailLinkConfirmModal's "Finish signing in" button) — never
 *    automatically on page load. Auto-completing on load let a corporate
 *    link-prescanner burn the single-use code before the human ever clicked,
 *    silently breaking sign-in.
 *
 * Handles the anonymous-upgrade path (link the email credential onto the
 * surviving anon user, preserving uid + data) and the email-already-in-use
 * collision path (sign into the existing account, offer to import anon drafts).
 * New links also carry a 30-minute opaque state so another device can resolve
 * the original email without putting it in the URL or asking for it again.
 */

import {
  isSignInWithEmailLink,
  parseActionCodeURL,
  signInWithEmailLink,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { writeUrl } from "$lib/shared/navigation/services/url-state";
import {
  auth,
  configureAuthPersistence,
  getFunctionsInstance,
} from "../firebase";

export interface EmailLinkCompletionResult {
  /** A magic link was present and sign-in completed. */
  completed: boolean;
  /** Set when completion was attempted but failed (or email was required). */
  errorCode?: string;
  errorMessage?: string;
}

interface EmailIdentity {
  email?: string | null;
  providerData?: Array<{ email?: string | null }>;
}

const EMAIL_FOR_SIGN_IN_KEY = "emailForSignIn";
const MAGIC_LINK_STATE_PARAM = "magicLinkState";

export function userOwnsSignInEmail(
  user: EmailIdentity,
  email: string
): boolean {
  const normalized = email.trim().toLowerCase();
  return (
    user.email?.trim().toLowerCase() === normalized ||
    user.providerData?.some(
      (provider) => provider.email?.trim().toLowerCase() === normalized
    ) === true
  );
}

interface ResolveMagicLinkEmailResponse {
  success: true;
  email: string;
}

function getMagicLinkState(link: string): string | null {
  const continueUrl = parseActionCodeURL(link)?.continueUrl;

  try {
    return new URL(continueUrl || link).searchParams.get(
      MAGIC_LINK_STATE_PARAM
    );
  } catch {
    return null;
  }
}

async function resolveEmailForLink(
  link: string,
  savedEmail: string | null
): Promise<string | null> {
  const state = getMagicLinkState(link);
  if (!state) return savedEmail;

  // State resolution is an ENHANCEMENT (it lets a second browser finish without
  // re-typing the address), never a dependency. On the same browser localStorage
  // already holds the address, so a resolver outage must not take sign-in down
  // with it.
  //
  // The 2026-07-28 outage was the mirror image of that: this whole state feature
  // shipped client-side on 2026-07-22 but its function was never deployed, so
  // links carried no state at all and fell through to a localStorage lookup that
  // is empty whenever the link is opened somewhere other than where it was
  // requested — a mail app's in-app webview, which is the common case. Users got
  // "Request a new sign-in link", requested another, and hit the same wall.
  //
  // Falling back is safe: signInWithEmailLink still verifies the address against
  // the oobCode server-side, so a wrong local email is rejected by Firebase
  // rather than opening someone else's account.
  let resolutionError: unknown = null;
  try {
    const functions = await getFunctionsInstance();
    const resolveEmail = httpsCallable<
      { action: "resolve-email"; state: string },
      ResolveMagicLinkEmailResponse
    >(functions, "sendMagicLink");
    const result = await resolveEmail({ action: "resolve-email", state });

    if (
      result.data?.success === true &&
      typeof result.data.email === "string" &&
      result.data.email
    ) {
      return result.data.email;
    }
  } catch (error) {
    resolutionError = error;
    console.warn(
      "[email-link] State resolution failed; falling back to the address saved on this device.",
      error
    );
  }

  // Same device: we already know the address, and Firebase remains the authority
  // on whether the oobCode is still live — an expired code still surfaces as
  // auth/expired-action-code from signInWithEmailLink. Trying is strictly better
  // than refusing.
  if (savedEmail) return savedEmail;

  // No local address to fall back to. Rethrow the original failure so the
  // caller keeps its precise mapping (an expired opaque state must still read
  // as expired, not as a generic invalid link).
  if (resolutionError) throw resolutionError;

  const invalidResponse = new Error(
    "The sign-in link did not resolve to an email address."
  ) as Error & { code: string };
  invalidResponse.code = "auth/invalid-action-code";
  throw invalidResponse;
}

/**
 * Resolve the account named by the current link without consuming its
 * single-use Firebase code. The confirm modal uses this to show exactly which
 * account will be opened before the user commits to sign-in.
 */
export async function getPendingEmailLinkRecipient(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const link = window.location.href;
  if (!isSignInWithEmailLink(auth, link)) return null;

  return resolveEmailForLink(
    link,
    window.localStorage.getItem(EMAIL_FOR_SIGN_IN_KEY)
  );
}

/**
 * Whether the current URL carries an unconsumed Firebase email-sign-in link.
 * Read-only — never touches the oobCode. Safe to call at any point (app
 * boot, route change) to decide whether to show the confirm interstitial.
 */
export function isEmailLinkPending(): boolean {
  if (typeof window === "undefined") return false;
  return isSignInWithEmailLink(auth, window.location.href);
}

/**
 * The email saved on this device when the link was requested, or null if the
 * link was opened on a different device (or a different browser/profile).
 * Read-only.
 */
export function getSavedEmailForSignIn(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(EMAIL_FOR_SIGN_IN_KEY);
}

/**
 * Complete a pending email-link sign-in from the current URL. This is the
 * code-consuming call — only invoke it after explicit user confirmation
 * (EmailLinkConfirmModal), never automatically.
 *
 * Returns `{ completed: false }` with no error when there's nothing to do.
 * New links resolve their original email from short-lived opaque state, so the
 * same completion path works across devices without another email field.
 */
export async function completeEmailLinkSignIn(): Promise<EmailLinkCompletionResult> {
  if (typeof window === "undefined") return { completed: false };

  const link = window.location.href;
  if (!isSignInWithEmailLink(auth, link)) {
    return { completed: false };
  }

  try {
    // New links bind the email to a server-held opaque state for 30 minutes.
    // This replaces the wrong-device email field without exposing an address
    // in browser history, referrer headers, analytics, or the link itself.
    const savedEmail = await getPendingEmailLinkRecipient();
    if (!savedEmail) {
      return {
        completed: false,
        errorCode: "auth/missing-email",
        errorMessage: "Request a new sign-in link to continue.",
      };
    }

    // Persistence must be configured before sign-in so the session survives reload.
    await configureAuthPersistence(auth);

    // Re-register method=magic_link on THIS tab before the credential is
    // exchanged. The tab that requested the link registered it in
    // sessionStorage, which doesn't follow the user into whatever tab their
    // mail client opened — so without this, every magic-link signup would lose
    // the method enrichment on user_signed_up. Must run before the exchange:
    // onAuthStateChanged fires within milliseconds of it resolving.
    const { restorePendingAuthMethod } =
      await import("./auth-analytics-bridge");
    restorePendingAuthMethod();

    // If an anonymous session survived the email round-trip, LINK the email
    // credential onto the anon user in place (preserving its uid + data)
    // instead of minting a fresh account.
    if (auth.currentUser?.isAnonymous) {
      const { EmailAuthProvider, linkWithCredential } =
        await import("firebase/auth");
      const anonUid = auth.currentUser.uid;
      const credential = EmailAuthProvider.credentialWithLink(savedEmail, link);
      try {
        const result = await linkWithCredential(auth.currentUser, credential);
        // Guest just upgraded to a full account — fire the admin signup
        // notification (createOrUpdateUserDocument skips it for anon users,
        // and the linked uid's doc already exists so it won't re-fire there).
        const { notifyUpgradeSignup } =
          await import("$lib/shared/auth/services/anonymous-upgrade");
        await notifyUpgradeSignup(result.user);
      } catch (linkErr) {
        const code = (linkErr as { code?: string })?.code;
        if (
          code === "auth/credential-already-in-use" ||
          code === "auth/email-already-in-use"
        ) {
          // Email already belongs to a permanent account: sign into it and
          // offer to import the anon's drafts.
          const { upgradeMagicLinkCollision } =
            await import("$lib/shared/auth/services/anonymous-upgrade");
          const { promptAnonymousImport } =
            await import("$lib/shared/auth/state/anonymous-import-prompt.svelte");
          const { drafts, destinationUid } = await upgradeMagicLinkCollision(
            anonUid,
            savedEmail,
            link
          );
          promptAnonymousImport(drafts, destinationUid);
        } else {
          throw linkErr;
        }
      }
    } else if (
      auth.currentUser &&
      !userOwnsSignInEmail(auth.currentUser, savedEmail)
    ) {
      // A permanent session plus a magic link proves control of both
      // identities. Link the new email credential onto the surviving uid.
      // Plain signInWithEmailLink would replace the current account and is the
      // exact path that split John Cloud's Google and Live.com identities.
      const { EmailAuthProvider, linkWithCredential } =
        await import("firebase/auth");
      const credential = EmailAuthProvider.credentialWithLink(savedEmail, link);
      await linkWithCredential(auth.currentUser, credential);
    } else {
      // Signed out, or the recipient already belongs to this user's primary or
      // provider-specific email. Firebase returns the same uid in the latter
      // case, so the normal sign-in path is safe.
      await signInWithEmailLink(auth, savedEmail, link);
    }

    window.localStorage.removeItem(EMAIL_FOR_SIGN_IN_KEY);

    // Both branches above (anon link + plain sign-in) converge here, so this is
    // the single point that covers every magic-link completion.
    const { recordLastAuthMethod } = await import("./last-auth-method.svelte");
    recordLastAuthMethod("magic-link");
    const { trackAuthProviderResult } =
      await import("$lib/shared/analytics/auth-events");
    trackAuthProviderResult("magic_link", "completed");

    // A magic link already proved ownership of the email address. Do not put a
    // password or profile form between that proof and the workspace. Persist
    // the skip so the same account is not interrupted on another device.
    const signedInUserId = auth.currentUser?.uid;
    if (signedInUserId) {
      try {
        const { firstRunState } =
          await import("$lib/shared/onboarding/state/first-run-state.svelte");
        firstRunState.markSkipped(signedInUserId);
      } catch (error) {
        console.warn("[email-link] Could not persist setup skip:", error);
      }
    }

    // Strip the consumed Firebase link params from the URL so a reload doesn't
    // replay an already-used link (which throws auth/invalid-action-code) and
    // the address bar reads clean. Stays on the same route.
    try {
      const url = new URL(link);
      [
        "apiKey",
        "oobCode",
        "mode",
        "lang",
        "continueUrl",
        MAGIC_LINK_STATE_PARAM,
      ].forEach((p) => url.searchParams.delete(p));
      writeUrl(url.pathname + url.search + url.hash);
    } catch {
      // URL cleanup is cosmetic — never block sign-in on it.
    }

    return { completed: true };
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    const { trackAuthProviderResult } =
      await import("$lib/shared/analytics/auth-events");
    trackAuthProviderResult("magic_link", "failed", e.code ?? "unknown");
    if (
      e?.code === "functions/failed-precondition" ||
      e?.code === "functions/not-found" ||
      e?.code === "functions/invalid-argument"
    ) {
      return {
        completed: false,
        errorCode: "auth/expired-action-code",
        errorMessage: "This sign-in link is invalid or expired.",
      };
    }
    if (e?.code?.startsWith("functions/")) {
      return {
        completed: false,
        errorCode: "auth/link-resolution-failed",
        errorMessage:
          "Couldn't verify this sign-in link. Check your connection and try again.",
      };
    }
    return {
      completed: false,
      errorCode: e?.code,
      errorMessage: e?.message,
    };
  }
}
