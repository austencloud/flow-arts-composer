import { isPermissionDeniedError } from "../utils/is-permission-denied-error";

/**
 * Create users/{uid}, and accept a denial that only means the create already
 * landed.
 *
 * The Firestore SDK resends a write whose acknowledgement it never got. On a
 * phone whose connection drops for a moment, the first send commits, the ack is
 * lost, and the resend reaches a document that now exists. Firestore judges it
 * as an update, and the update rule refuses createdAt and the starting
 * counters, so the visitor sees "Missing or insufficient permissions" for a
 * profile that saved fine (a visitor report, 2026-11-10: the document's
 * createTime was 15 seconds before the denial, and it was never updated).
 *
 * After a denial, a read from the server settles it: the document exists, so
 * the create did its job. Anything else is a real refusal and is rethrown.
 */
export async function createProfileOnce(
  create: () => Promise<void>,
  existsOnServer: () => Promise<boolean>
): Promise<"created" | "already-landed"> {
  try {
    await create();
    return "created";
  } catch (error) {
    if (!isPermissionDeniedError(error)) throw error;
    let landed = false;
    try {
      landed = await existsOnServer();
    } catch {
      // The check failed too; report the original denial, not the check.
    }
    if (landed) return "already-landed";
    throw error;
  }
}
