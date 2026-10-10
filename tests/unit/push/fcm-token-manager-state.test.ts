import { describe, expect, it, vi } from "vitest";
import { FCMTokenManager } from "#lib/shared/push/services/fcm-token-manager.js";

describe("FCMTokenManager device registration state", () => {
  it("reports unsupported before asking for notification permission", async () => {
    const manager = new FCMTokenManager();
    vi.spyOn(manager, "isSupported").mockResolvedValue(false);
    const permission = vi.spyOn(manager, "getPermissionState");

    await expect(manager.getRegistrationState("user-1")).resolves.toBe(
      "unsupported"
    );
    expect(permission).not.toHaveBeenCalled();
  });

  it("reports setup required when permission has not been granted", async () => {
    const manager = new FCMTokenManager();
    vi.spyOn(manager, "isSupported").mockResolvedValue(true);
    vi.spyOn(manager, "getPermissionState").mockResolvedValue("default");

    await expect(manager.getRegistrationState("user-1")).resolves.toBe(
      "setup-required"
    );
  });

  it("reports ready only after token registration succeeds", async () => {
    const manager = new FCMTokenManager();
    vi.spyOn(manager, "isSupported").mockResolvedValue(true);
    vi.spyOn(manager, "getPermissionState").mockResolvedValue("granted");
    vi.spyOn(manager, "registerToken").mockResolvedValue("registered-token");

    await expect(manager.getRegistrationState("user-1")).resolves.toBe("ready");
  });

  it("keeps failed token registration visible instead of claiming success", async () => {
    const manager = new FCMTokenManager();
    vi.spyOn(manager, "isSupported").mockResolvedValue(true);
    vi.spyOn(manager, "getPermissionState").mockResolvedValue("granted");
    vi.spyOn(manager, "registerToken").mockResolvedValue(null);

    await expect(manager.getRegistrationState("user-1")).resolves.toBe(
      "failed"
    );
  });
});
