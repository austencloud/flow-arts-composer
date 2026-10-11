/**
 * Error Telemetry Reporter
 *
 * Silently logs non-blocking errors to the Firestore `errorTelemetry` collection.
 * The collection is write-only from the client (rules deny reads), so dedup can't
 * query for an existing doc — instead the doc ID is deterministic: the same error
 * on the same UTC day always writes to the same document. Recurrences increment
 * the count via updateDoc; the first occurrence falls through to setDoc.
 */

import {
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import {
  getFirestoreInstance,
  getAuthInstance,
} from "#lib/shared/auth/firebase.js";
import { captureExceptionWhenReady } from "#lib/shared/analytics/services/posthog.js";
import type { ShowErrorOptions } from "#lib/shared/error/domain/error-models.js";
import { toFirestorePathShape } from "#lib/shared/error/domain/firestore-path-shape.js";

const COLLECTION = "errorTelemetry";

// FNV-1a 32-bit — keeps arbitrary error messages (slashes and all) out of the doc ID.
function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// An update against a missing doc surfaces as "permission-denied", not
// "not-found", when security rules are in play: the rules can't evaluate
// resource.data, and Firestore masks the error to avoid leaking whether the
// doc exists. Our update payload never touches a rules-restricted field, so
// either code can only mean "no doc yet — create it".
function isMissingDocError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "not-found" || code === "permission-denied";
}

export async function reportErrorTelemetry(
  options: ShowErrorOptions,
  { skipPostHog = false }: { skipPostHog?: boolean } = {}
): Promise<void> {
  // Mirror into PostHog error tracking so handled errors land in the same
  // per-user timeline (session replay, rage clicks) as uncaught ones.
  // Callers reporting errors PostHog already auto-captures (unhandled
  // rejections, window errors) pass skipPostHog to avoid double $exception.
  if (!skipPostHog) {
    const pathShape = toFirestorePathShape(
      options.context?.additionalData?.path
    );
    captureExceptionWhenReady(options.error ?? new Error(options.message), {
      telemetry_module: options.context?.module ?? "unknown",
      telemetry_action: options.context?.action ?? "unknown",
      telemetry_schema_version: 2,
      ...(pathShape ? { telemetry_path_shape: pathShape } : {}),
      severity: options.severity ?? "error",
    });
  }

  try {
    const db = await getFirestoreInstance();
    const userId = await getAuthInstance()
      .then((auth) => auth.currentUser?.uid ?? null)
      .catch(() => null);

    const message = options.message;
    const module = options.context?.module ?? "unknown";
    const action = options.context?.action ?? "unknown";
    const key = `${message}::${module}::${action}`;

    const utcDay = new Date().toISOString().slice(0, 10);
    const docRef = doc(db, COLLECTION, `${utcDay}_${fnv1aHash(key)}`);

    const lastStack = options.error?.stack ?? null;
    const lastAdditionalData =
      (options.context?.additionalData as object | undefined) ?? null;

    try {
      // updateDoc requires the doc to exist — that's the dedup check.
      await updateDoc(docRef, {
        count: increment(1),
        lastSeen: serverTimestamp(),
        lastStack,
        lastAdditionalData,
        lastUserId: userId,
      });
    } catch (err) {
      if (!isMissingDocError(err)) throw err;

      await setDoc(docRef, {
        key,
        message,
        technicalDetails: options.technicalDetails ?? null,
        module,
        action,
        severity: options.severity ?? "error",
        count: 1,
        firstSeen: serverTimestamp(),
        lastSeen: serverTimestamp(),
        lastStack,
        lastAdditionalData,
        firstUserId: userId,
        lastUserId: userId,
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
        resolved: false,
      });
    }
  } catch (err) {
    console.warn("[ErrorTelemetryReporter] Failed to report telemetry:", err);
  }
}
