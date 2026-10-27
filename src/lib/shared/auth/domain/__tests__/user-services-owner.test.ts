import { describe, expect, it } from "vitest";
import { userServicesToRelease } from "../user-services-owner";

describe("userServicesToRelease", () => {
  it("releases a guest's listeners when it is signed into an existing account", () => {
    // anonymous-upgrade's collision path: signInWithCredential replaces the
    // guest uid without authState.signOut() ever running (2026-10-24).
    expect(userServicesToRelease("guest-uid", "existing-uid")).toBe(
      "guest-uid"
    );
  });

  it("releases an account's listeners when it signs out elsewhere", () => {
    expect(userServicesToRelease("account-uid", null)).toBe("account-uid");
  });

  it("keeps the listeners when Auth re-reports the same account", () => {
    // HMR re-fires and in-place guest upgrades keep the uid.
    expect(userServicesToRelease("account-uid", "account-uid")).toBeNull();
  });

  it("has nothing to release before any services started", () => {
    expect(userServicesToRelease(null, "account-uid")).toBeNull();
    expect(userServicesToRelease(null, null)).toBeNull();
  });
});
