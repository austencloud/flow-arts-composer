/**
 * Flow Arts Composer's wiring of @austencloud/phone-sign-in: scan a QR with a
 * signed-in admin phone to sign a computer in. The routes under
 * /api/phone-sign-in each hand their request to one of these handlers.
 *
 * Approval tags and network hashes are keyed from the service account private
 * key, so a local copy and the live site agree only when they hold the same
 * key. Spec: docs/superpowers/specs/2026-10-10-shared-phone-sign-in-design.md
 */

import { dev } from "$app/env";
import {
  ACCOUNTS_UPDATE_SCOPE,
  clientAddress,
  createPhoneSignInServer,
  createServiceAccountSigner,
  killSwitchOn,
  type RouteContext,
} from "@austencloud/phone-sign-in/server";
import { requireAdmin } from "#lib/server/auth/requireAdmin.js";
import { createPhoneSignInStore } from "#lib/server/auth/phone-sign-in-store.js";
import { requestCf, workerEnv } from "#lib/server/cloudflare/worker-env.js";
import { getFirestoreRest } from "#lib/server/firestore/firestore-rest.js";
import {
  getServiceAccountAuthorizer,
  loadServiceAccountSource,
  parseServiceAccount,
} from "#lib/server/google/service-account-authorizer.js";
import { checkRateLimit } from "#lib/server/security/rate-limiter.js";
import {
  APP_NAME,
  AUTO_PURPOSE,
  KEY_SALT,
  LIVE_ORIGIN,
} from "#lib/shared/auth/phone-sign-in/values.js";

function platformCredential(): string | undefined {
  return workerEnv()?.FIREBASE_SERVICE_ACCOUNT_JSON;
}

function serviceAccount() {
  return parseServiceAccount(loadServiceAccountSource(platformCredential()));
}

const authorizer = () => getServiceAccountAuthorizer(platformCredential());

export const phoneSignIn = createPhoneSignInServer({
  appName: APP_NAME,
  liveOrigin: LIVE_ORIGIN,
  salt: KEY_SALT,
  autoPurpose: AUTO_PURPOSE,
  store: createPhoneSignInStore(() => getFirestoreRest(platformCredential())),
  serverSecret: () => new TextEncoder().encode(serviceAccount().private_key),
  signJwt: createServiceAccountSigner(() => {
    const account = serviceAccount();
    return {
      clientEmail: account.client_email,
      privateKey: account.private_key,
    };
  }),
  // requireAdmin re-reads the account live: it exists, is not disabled, was
  // not revoked since this sign-in, and holds the admin claim. The package
  // adds its own rule on top: a Google sign-in, with a token minted within
  // the last five minutes.
  verifyUser: async (request) => {
    const user = await requireAdmin({ request });
    return {
      uid: user.uid,
      email: user.email ?? null,
      signInProvider: user.signInProvider ?? null,
      issuedAt: user.issuedAt,
    };
  },
  rateLimit: async ({ route, ip, limit, windowMs }) =>
    checkRateLimit(`${route}:ip:${ip}`, { maxRequests: limit, windowMs })
      .allowed,
  projectId: () => authorizer().projectId,
  emulator: () => false,
  accessToken: () => authorizer().getAccessToken(ACCOUNTS_UPDATE_SCOPE),
  forgetAccessToken: (token) =>
    authorizer().forgetAccessToken(ACCOUNTS_UPDATE_SCOPE, token),
  disabled: () => killSwitchOn(workerEnv()?.PHONE_SIGN_IN_DISABLED),
  dev,
});

/** What a route hands the package from its request event. */
export function routeContext(event: {
  params: { id?: string };
  request: Request;
  url: URL;
  getClientAddress: () => string;
}): RouteContext {
  return {
    id: event.params.id,
    clientAddress: clientAddress(event.getClientAddress),
    cf: requestCf(event.request),
    url: event.url,
  };
}
