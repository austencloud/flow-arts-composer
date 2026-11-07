/**
 * The entry point of static/phone-sign-in-worker.js, built by
 * scripts/build-phone-sign-in-worker.mjs. The classic service workers load that
 * script and find this object on `self`. Nothing here reads the session or the
 * key until a sign-in notification is tapped.
 */

import {
  createNotificationApprover,
  createPhoneSignInClient,
  createTrustedPhoneKey,
} from "@austencloud/phone-sign-in/client";
import { readSavedFirebaseUsers } from "../services/saved-firebase-user";
import { createSignInWorker, type SignInWorkerScope } from "./sign-in-worker";
import { APP_NAME, AUTO_PURPOSE, TRUSTED_PHONE_DB } from "./values";
import { createWorkerSession } from "./worker-session";

const scope = self as unknown as SignInWorkerScope & {
  phoneSignInWorker?: ReturnType<typeof createSignInWorker>;
};

const session = createWorkerSession({ readUsers: readSavedFirebaseUsers });
const client = createPhoneSignInClient({
  appName: APP_NAME,
  apiFetch: session.apiFetch,
});
const keys = createTrustedPhoneKey({
  dbName: TRUSTED_PHONE_DB,
  purpose: AUTO_PURPOSE,
});

scope.phoneSignInWorker = createSignInWorker(scope, {
  approver: createNotificationApprover({
    client,
    keys,
    currentUid: session.uid,
  }),
  // Reporting ends this phone's trust, so its key goes first: even if the report
  // fails, this phone stops approving by itself.
  reportNotMe: async (id) => {
    await keys.forgetTrustedKey().catch(() => {});
    return client.reportNotMe(id);
  },
});
