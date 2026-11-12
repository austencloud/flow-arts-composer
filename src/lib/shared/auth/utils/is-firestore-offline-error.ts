/**
 * Detects a Firestore read or write that failed only because the device has
 * no connection to the backend: "Failed to get document because the client is
 * offline." carries code "unavailable".
 *
 * That is the network, not a defect. A phone that drops signal while a
 * background sync runs (seen 2026-11-09 on /about from an Instagram visit)
 * should not file an exception; the sync runs again on the next sign-in.
 */
export function isFirestoreOfflineError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (code === "unavailable" || code === "firestore/unavailable") return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.includes("client is offline");
}
