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
