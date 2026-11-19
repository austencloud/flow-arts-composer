/**
 * Tells a Google-side suspension of the Firebase project apart from ordinary
 * failures, from the errors the web SDKs actually raise.
 *
 * Captured on the dev server on 2026-11-18, while Google had suspended the
 * project (every Firestore and Auth request answered HTTP 403):
 *
 * - Auth (anonymous sign-in, any identitytoolkit call) rejects with
 *   code "auth/permission-denied:-consumer-'projects/664225703033'-has-been-suspended."
 *   The REST body under it is 403 PERMISSION_DENIED with reason
 *   CONSUMER_SUSPENDED. The code names the suspension, so it is enough alone.
 * - Firestore never shows the 403. Its stream swallows it and reads fail as
 *   code "unavailable", "Failed to get document because the client is
 *   offline.", exactly like a phone with no signal; getDocs quietly answers
 *   from cache. So a Firestore failure is only a reason to ask Google once,
 *   with one unauthenticated REST read, whether the project is suspended.
 *
 * An ordinary rules denial ("permission-denied", "Missing or insufficient
 * permissions.") and a real offline device are not outages.
 */

export type ServiceFailureKind =
  /** The error itself says the project is suspended. */
  | "suspended"
  /** Firestore could not be reached while the device says it is online. */
  | "unreachable"
  | "none";

const SUSPENDED_PATTERN = /has[\s-]been[\s-]suspended|consumer_suspended/i;

function readString(value: unknown, key: string): string {
  if (!value || typeof value !== "object") return "";
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : "";
}

function isUnreachableShape(error: unknown): boolean {
  const code = readString(error, "code");
  if (code === "unavailable" || code === "firestore/unavailable") return true;
  return readString(error, "message").includes("client is offline");
}

/**
 * Classify one failed Firebase call. `deviceOnline` is navigator.onLine: when
 * the device itself is offline, an unreachable backend is just the network.
 */
export function classifyServiceFailure(
  error: unknown,
  deviceOnline: boolean
): ServiceFailureKind {
  const text = `${readString(error, "code")} ${readString(error, "message")}`;
  if (SUSPENDED_PATTERN.test(text)) return "suspended";
  if (deviceOnline && isUnreachableShape(error)) return "unreachable";
  return "none";
}

/**
 * The confirming read: a document that does not exist, so a healthy project
 * answers 404 (or 403 from the rules) and costs one read. Only a suspended
 * project answers 403 with CONSUMER_SUSPENDED.
 */
export function outageProbeUrl(projectId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/(default)/documents/publicSequences/outage-probe`;
}

export function isSuspendedProbeResponse(
  status: number,
  body: string
): boolean {
  return status === 403 && SUSPENDED_PATTERN.test(body);
}
