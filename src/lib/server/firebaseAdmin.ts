import admin from "firebase-admin";
import { dev } from "$app/env";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

let initialized = false;

function loadServiceAccount(): unknown {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (fromEnv) {
    return JSON.parse(fromEnv);
  }

  // Filesystem fallback only in dev (edge runtime has no fs)
  if (dev) {
    const candidates = [
      "serviceAccountKey.json",
      resolve("../../serviceAccountKey.json"),
    ];
    const keyPath = candidates.find((p) => existsSync(p));
    if (keyPath) {
      try {
        return JSON.parse(readFileSync(keyPath, "utf8"));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to read ${keyPath}: ${message}`);
      }
    }
  }

  throw new Error(
    "Missing Firebase Admin credentials. " +
    (dev
      ? "Provide serviceAccountKey.json or set FIREBASE_SERVICE_ACCOUNT_JSON env var."
      : "Set FIREBASE_SERVICE_ACCOUNT_JSON via: wrangler pages secret put FIREBASE_SERVICE_ACCOUNT_JSON")
  );
}

export function getFirebaseAdminApp(): admin.app.App {
  if (initialized && admin.apps.length) {
    return admin.apps[0]!;
  }
  if (!admin.apps.length) {
    const serviceAccount = loadServiceAccount();
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    });
  }
  initialized = true;
  return admin.apps[0]!;
}

export function getAdminAuth(): admin.auth.Auth {
  return getFirebaseAdminApp().auth();
}

export function getAdminDb(): admin.firestore.Firestore {
  return getFirebaseAdminApp().firestore();
}
