/**
 * Flow Arts Composer's fixed values for @austencloud/phone-sign-in, read by
 * the server routes and by the phone's browser.
 *
 * The salt and purpose are what a trusted phone's key and the server's tags
 * are made with, and the database name is where the phone keeps its key, so a
 * change to any of them makes every trusted phone ask again.
 * Spec: docs/superpowers/specs/2026-10-10-shared-phone-sign-in-design.md
 */

export const APP_NAME = "Flow Arts Composer";
/** The QR always opens the live site, which approves requests from any copy of the app. */
export const LIVE_ORIGIN = "https://tkaflowarts.com";
export const KEY_SALT = "flow-arts-phone-sign-in";
export const AUTO_PURPOSE = "flow-arts-phone-sign-in-auto";
export const TRUSTED_PHONE_DB = "flow-arts-trusted-phone";

/** Marks an FCM data message as a phone sign-in, for the worker. */
export const SIGN_IN_PUSH_TYPE = "phone-sign-in";

/** The notification tag for one request, so each request keeps its own notification. */
export function signInTag(id: string): string {
  return `phone-sign-in-${id}`;
}

/** The approve page with automatic approval held back. */
export function reviewPath(id: string): string {
  return `/sign-in/${id}?review=1`;
}

/**
 * What a trusted phone signs, with AUTO_PURPOSE, to have sign-in notifications
 * sent to one of its FCM tokens. A request id is 20 letters and digits, so this
 * can never pass for one and never approves a sign-in.
 */
export function pushTargetMessage(tokenDocId: string): string {
  return `push-target ${tokenDocId}`;
}
