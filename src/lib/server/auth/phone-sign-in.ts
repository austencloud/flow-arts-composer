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
  createServerKeys,
  createServiceAccountSigner,
  createTrustedPhones,
  killSwitchOn,
  type PhoneSignInHandlers,
  type PhoneSignInServerConfig,
  type RouteContext,
  type VerifiedUser,
} from "@austencloud/phone-sign-in/server";
import { requireAdmin } from "#lib/server/auth/requireAdmin.js";
import { mayRingPhone } from "#lib/server/auth/phone-sign-in-local.js";
import {
  FCM_SCOPE,
  SIGN_IN_PUSH_COLLECTION,
  createSignInPush,
} from "#lib/server/auth/phone-sign-in-push.js";
import { createPhoneSignInStore } from "#lib/server/auth/phone-sign-in-store.js";
import { requestCf, workerEnv } from "#lib/server/cloudflare/worker-env.js";
import {
  getFirestoreRest,
  readFirestoreString,
} from "#lib/server/firestore/firestore-rest.js";
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
const firestore = () => getFirestoreRest(platformCredential());
const store = createPhoneSignInStore(firestore);
const serverSecret = () =>
  new TextEncoder().encode(serviceAccount().private_key);

// requireAdmin re-reads the account live: it exists, is not disabled, was not
// revoked since this sign-in, and holds the admin claim. The package adds its
// own rule on top: a Google sign-in, with a token minted within the last five
// minutes.
export async function verifyPhoneUser(request: Request): Promise<VerifiedUser> {
  const user = await requireAdmin({ request });
  return {
    uid: user.uid,
    email: user.email ?? null,
    signInProvider: user.signInProvider ?? null,
    issuedAt: user.issuedAt,
  };
}

const config: PhoneSignInServerConfig = {
  appName: APP_NAME,
  liveOrigin: LIVE_ORIGIN,
  salt: KEY_SALT,
  autoPurpose: AUTO_PURPOSE,
  store,
  serverSecret,
  signJwt: createServiceAccountSigner(() => {
    const account = serviceAccount();
    return {
      clientEmail: account.client_email,
      privateKey: account.private_key,
    };
  }),
  verifyUser: verifyPhoneUser,
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
};

const tokenPath = (uid: string, docId: string) =>
  `users/${uid}/fcmTokens/${docId}`;

export const signInPush = createSignInPush({
  store,
  listTargets: async () => {
    const page = await firestore().listDocuments(SIGN_IN_PUSH_COLLECTION, {
      pageSize: 20,
    });
    return page.documents.flatMap((document) => {
      const uid = document.name.split("/").pop();
      const tokenDocId = readFirestoreString(document, "tokenDocId");
      const keyTag = readFirestoreString(document, "keyTag");
      if (!uid || !tokenDocId || !keyTag) return [];
      const label = readFirestoreString(document, "label") ?? "";
      return [{ uid, tokenDocId, keyTag, label }];
    });
  },
  tokens: {
    get: async (uid, docId) => {
      const document = await firestore().getDocument(tokenPath(uid, docId));
      const token = document && readFirestoreString(document, "token");
      if (!document || !token) return null;
      return {
        token,
        transport: readFirestoreString(document, "transport") ?? null,
      };
    },
    delete: async (uid, docId) => {
      const rest = firestore();
      await rest.commit([{ delete: rest.documentName(tokenPath(uid, docId)) }]);
    },
  },
  // This limiter is an in-memory map, so its counts reset when the server
  // restarts. The caps only ever apply to a local copy, one person's dev server.
  rateLimit: ({ route, limit, windowMs }) =>
    checkRateLimit(`${route}:global`, { maxRequests: limit, windowMs }).allowed,
  projectId: () => authorizer().projectId,
  fcmFetch: (url, init) => authorizer().authorizedFetch(url, init, FCM_SCOPE),
});

const quietServer = createPhoneSignInServer(config);
const ringingServer = createPhoneSignInServer({
  ...config,
  notifyPhones: signInPush.notify,
});

export const phoneSignIn: PhoneSignInHandlers = {
  ...quietServer,
  // Only a request started at a local copy may ring the phone. Everywhere else
  // the same request is created and the caller is told `notified: false`.
  create: (request, context) => {
    const local = mayRingPhone({
      dev,
      url: context.url ?? new URL(request.url),
      headers: request.headers,
    });
    return (local ? ringingServer : quietServer).create(request, context);
  },
};

/** The trusted phones on their own, keyed like the server's, for the push target route. */
export const trustedPhones = createTrustedPhones({
  store,
  keys: createServerKeys({ secret: serverSecret, salt: KEY_SALT }),
  autoPurpose: AUTO_PURPOSE,
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
