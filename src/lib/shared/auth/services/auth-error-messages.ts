//
// Single source of truth for turning a Firebase Auth error code into a
// user-facing message. Extracted from SocialAuthCompact so AccountPopover's
// sidebar sign-in and any other Google sign-in surface show the same wording
// instead of re-deriving the mapping inline.
//
// `null` means "don't toast" — the user cancelled/dismissed the flow
// themselves, which is not an error worth surfacing.
import { t } from "#lib/shared/i18n/i18n.svelte.js";

export function getAuthErrorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null | undefined)?.code;
}

/**
 * Provider flows can be blocked, dismissed, denied by the user, or superseded
 * without indicating an application failure. Callers may still show recovery
 * copy, but these outcomes should be measured as interaction events rather
 * than exceptions.
 */
export function isExpectedAuthInterruption(error: unknown): boolean {
  const errorCode = getAuthErrorCode(error);
  return (
    errorCode === "auth/popup-blocked" ||
    errorCode === "auth/popup-closed-by-user" ||
    errorCode === "auth/cancelled-popup-request" ||
    errorCode === "auth/user-cancelled"
  );
}

/**
 * Map a Firebase Auth error (or error code) to a user-facing message.
 * Returns null when the "error" is really a user-initiated cancellation.
 */
export function mapAuthError(error: unknown): string | null {
  const errorCode = getAuthErrorCode(error);

  switch (errorCode) {
    case "auth/popup-blocked":
      return t("auth_facebook_popup_blocked");
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "auth/user-cancelled":
      // Silent: the user dismissed/denied the flow, or another popup replaced it.
      return null;
    case "auth/account-exists-with-different-credential":
      return t("auth_error_different_signin_method");
    case "auth/unauthorized-domain":
      return t("auth_error_unauthorized_domain");
    case "auth/network-request-failed":
      return t("auth_error_network");
    default:
      return t("auth_error_signin_failed");
  }
}
