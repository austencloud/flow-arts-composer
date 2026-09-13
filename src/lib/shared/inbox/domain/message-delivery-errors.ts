const RETRYABLE_CODES = new Set([
  "functions/cancelled",
  "functions/deadline-exceeded",
  "functions/internal",
  "functions/resource-exhausted",
  "functions/unavailable",
  "functions/unknown",
  "storage/canceled",
  "storage/retry-limit-exceeded",
  "storage/server-file-wrong-size",
  "storage/unknown",
]);

const USER_MESSAGES: Record<string, string> = {
  "functions/already-exists": "That message ID is already in use.",
  "functions/failed-precondition":
    "The message it replied to is no longer available.",
  "functions/invalid-argument": "This message could not be sent as written.",
  "functions/not-found": "This conversation is no longer available.",
  "functions/permission-denied":
    "You no longer have permission to send to this conversation.",
  "functions/unauthenticated": "Sign in again to send this message.",
  "storage/unauthenticated": "Sign in again to send this image.",
  "storage/unauthorized": "This image could not be uploaded.",
};

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/** A delivery abandoned because its account changed. Never a user-facing error. */
export const DELIVERY_CANCELLED_CODE = "inbox/delivery-cancelled";

/**
 * The messenger's own refusal, raised when the signed-in account changed
 * between capturing the sender and dispatching. Recognized here rather than
 * imported, so the messaging layer keeps no dependency on the inbox.
 */
const SENDER_CHANGED_CODE = "messaging/sender-changed";

export function createDeliveryCancelledError(reason: string): Error {
  return Object.assign(new Error(reason), { code: DELIVERY_CANCELLED_CODE });
}

/**
 * True for a delivery that stopped before the network, because the account it
 * belonged to is no longer the one signed in. It is not a failure: the message
 * was never attempted and its durable row goes back to the queue untouched.
 */
export function isMessageDeliveryCancelled(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === DELIVERY_CANCELLED_CODE || code === SENDER_CHANGED_CODE;
}

export interface MessageDeliveryFailure {
  retryable: boolean;
  message: string;
  technicalDetails: string;
}

export function describeMessageDeliveryFailure(
  error: unknown,
  online: boolean
): MessageDeliveryFailure {
  const code = getErrorCode(error);
  const technicalDetails =
    error instanceof Error ? error.message : String(error ?? "Unknown error");

  if (!online) {
    return {
      retryable: true,
      message: "Waiting for a connection",
      technicalDetails,
    };
  }

  if (code && RETRYABLE_CODES.has(code)) {
    return {
      retryable: true,
      message: "Delivery was interrupted. Retrying…",
      technicalDetails,
    };
  }

  return {
    retryable: false,
    message: (code && USER_MESSAGES[code]) || "Message could not be sent.",
    technicalDetails,
  };
}
