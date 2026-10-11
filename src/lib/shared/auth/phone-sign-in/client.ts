/**
 * The browser side of phone sign-in, from @austencloud/phone-sign-in. The
 * computer starts and collects a request; the phone loads and decides it, and
 * can be trusted to approve by itself with a key that lives only in its own
 * IndexedDB.
 * Spec: docs/superpowers/specs/2026-10-10-shared-phone-sign-in-design.md
 */

import {
  createPhoneSignInClient,
  createTrustedPhoneKey,
} from "@austencloud/phone-sign-in/client";
import { APP_NAME, AUTO_PURPOSE, TRUSTED_PHONE_DB } from "./values";

export {
  formatCode,
  type ApprovalRequest,
  type AutoAnswer,
  type CollectAnswer,
  type NotMeAnswer,
  type StartedRequest,
} from "@austencloud/phone-sign-in";
export { trustedPhoneSupported } from "@austencloud/phone-sign-in/client";

/**
 * Sends the signed-in user's ID token when there is one. The computer's
 * calls run signed out, so unlike authedFetch this never throws for a
 * missing user. `forceRefresh` asks for a newly minted token, for the routes
 * that only accept one from the last few minutes.
 */
async function apiFetch(
  url: string,
  init: RequestInit = {},
  options: { forceRefresh?: boolean } = {}
): Promise<Response> {
  // Firebase loads when a call is made, so the computer's page stays light.
  const { auth } = await import("../firebase");
  const headers = new Headers(init.headers);
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken(options.forceRefresh ?? false);
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(url, { ...init, headers });
}

export const {
  startPhoneSignIn,
  collectPhoneSignIn,
  loadApprovalRequest,
  decideApprovalRequest,
  autoApproveRequest,
  trustThisPhone,
  stopTrustingPhone,
  reportNotMe,
} = createPhoneSignInClient({ appName: APP_NAME, apiFetch });

export const {
  loadTrustedKey,
  createTrustedKey,
  forgetTrustedKey,
  signAutoApproval,
} = createTrustedPhoneKey({ dbName: TRUSTED_PHONE_DB, purpose: AUTO_PURPOSE });
