import { describe, expect, it } from "vitest";
import {
  isExpectedAuthInterruption,
  mapAuthError,
} from "#lib/shared/auth/services/auth-error-messages.js";

describe("auth provider interruption classification", () => {
  it.each([
    "auth/popup-blocked",
    "auth/popup-closed-by-user",
    "auth/cancelled-popup-request",
    "auth/user-cancelled",
  ])("treats %s as an expected provider outcome", (code) => {
    expect(isExpectedAuthInterruption({ code })).toBe(true);
  });

  it("keeps network and credential failures actionable", () => {
    expect(
      isExpectedAuthInterruption({ code: "auth/network-request-failed" })
    ).toBe(false);
    expect(
      isExpectedAuthInterruption({
        code: "auth/account-exists-with-different-credential",
      })
    ).toBe(false);
  });

  it("shows recovery copy for a blocked popup", () => {
    expect(mapAuthError({ code: "auth/popup-blocked" })).toBe(
      "Popup was blocked. Please allow popups for this site."
    );
  });

  it("stays silent when the user dismisses, denies, or supersedes a provider flow", () => {
    expect(mapAuthError({ code: "auth/popup-closed-by-user" })).toBeNull();
    expect(mapAuthError({ code: "auth/cancelled-popup-request" })).toBeNull();
    expect(mapAuthError({ code: "auth/user-cancelled" })).toBeNull();
  });
});
