import { describe, expect, it } from "vitest";
import {
  classifyEmailLinkSendFailure,
  describeEmailLinkSendFailure,
} from "../email-link-send-failure";

function callableError(code: string, message: string, details?: unknown) {
  return Object.assign(new Error(message), { code, details });
}

describe("classifyEmailLinkSendFailure", () => {
  it("carries the function's reason when Brevo blocks the server address", () => {
    const failure = classifyEmailLinkSendFailure(
      callableError(
        "functions/failed-precondition",
        "Email service not configured",
        { reason: "provider/ip-not-authorised" }
      )
    );

    expect(failure).toEqual({
      failureCode: "service_not_configured",
      errorCode: "functions/failed-precondition",
      reason: "provider/ip-not-authorised",
    });
    // The console line is a plain string, never an object that a remote
    // console flattens to "[object Object]".
    expect(describeEmailLinkSendFailure(failure)).toBe(
      "[email-link] Send failed: service_not_configured functions/failed-precondition provider/ip-not-authorised"
    );
  });

  it("keeps the callable code for an internal error with no reason", () => {
    const failure = classifyEmailLinkSendFailure(
      callableError("functions/internal", "Failed to send email")
    );

    expect(failure).toEqual({
      failureCode: "request_failed",
      errorCode: "functions/internal",
      reason: null,
    });
    expect(describeEmailLinkSendFailure(failure)).toBe(
      "[email-link] Send failed: request_failed functions/internal"
    );
  });

  it("treats a codeless throw as a network failure", () => {
    expect(classifyEmailLinkSendFailure(new TypeError("Failed to fetch"))).toEqual({
      failureCode: "network_failed",
      errorCode: "",
      reason: null,
    });
  });

  it("drops a reason that is not a short code", () => {
    const failure = classifyEmailLinkSendFailure(
      callableError("functions/internal", "x", { reason: "person@example.com said no" })
    );
    expect(failure.reason).toBeNull();
  });
});
