/**
 * Sorts a failed email-link send into the short code the UI, console and
 * analytics share. The callable's own code (`functions/internal`, ...) and the
 * reason the function attaches in its error details travel with it, so a
 * failure in production names its cause instead of logging `[object Object]`.
 */
export type EmailLinkFailureCode =
  | "invalid_email"
  | "service_not_configured"
  | "provider_unavailable"
  | "request_failed"
  | "network_failed";

export interface EmailLinkSendFailure {
  failureCode: EmailLinkFailureCode;
  /** The callable error code, e.g. `functions/failed-precondition`, or "". */
  errorCode: string;
  /** The function's reason, e.g. `provider/ip-not-authorised`, or null. */
  reason: string | null;
}

export function classifyEmailLinkSendFailure(
  err: unknown
): EmailLinkSendFailure {
  const details = (err ?? {}) as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };
  const errorCode = typeof details.code === "string" ? details.code : "";
  const message = typeof details.message === "string" ? details.message : "";
  const rawReason = (details.details as { reason?: unknown } | undefined)
    ?.reason;
  const reason =
    typeof rawReason === "string" && /^[a-z0-9_/-]{1,60}$/i.test(rawReason)
      ? rawReason
      : null;

  let failureCode: EmailLinkFailureCode;
  if (
    errorCode.includes("invalid-argument") ||
    message.includes("Invalid email")
  ) {
    failureCode = "invalid_email";
  } else if (errorCode.includes("failed-precondition")) {
    failureCode = "service_not_configured";
  } else if (errorCode.includes("unavailable")) {
    failureCode = "provider_unavailable";
  } else {
    failureCode = errorCode ? "request_failed" : "network_failed";
  }

  return { failureCode, errorCode, reason };
}

/** One readable console line; analytics consoles stringify objects badly. */
export function describeEmailLinkSendFailure(
  failure: EmailLinkSendFailure
): string {
  const parts = [failure.failureCode, failure.errorCode || "no-code"];
  if (failure.reason) parts.push(failure.reason);
  return `[email-link] Send failed: ${parts.join(" ")}`;
}
