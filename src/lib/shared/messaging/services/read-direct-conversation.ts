import { isPermissionDeniedError } from "#lib/shared/auth/utils/is-permission-denied-error.js";

/**
 * Read a direct conversation by its id, treating a refusal as "no
 * conversation yet".
 *
 * A direct conversation's id joins both participants' uids, so the signed-in
 * user is a participant of any document stored there. The read rule checks
 * `request.auth.uid in resource.data.participants`; a missing document has no
 * data, so Firestore answers a first-time lookup with permission-denied rather
 * than an empty snapshot. That was every first feedback submission: its
 * message to the admin looked up a conversation that did not exist yet and
 * logged "Missing or insufficient permissions." twice (2026-11-04).
 *
 * Returns null when the read was refused (callers still check exists()); any other
 * error is rethrown.
 */
export async function readDirectConversation<T>(
  read: () => Promise<T>
): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (isPermissionDeniedError(error)) return null;
    throw error;
  }
}
