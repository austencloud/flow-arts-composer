import { beforeEach, describe, expect, it, vi } from "vitest";
import { FCMTokenManager } from "#lib/shared/push/services/fcm-token-manager.js";

describe("FCMTokenManager device registration state", () => {
  beforeEach(() => {
    localStorage.clear();
  });

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

  it("keeps a device that was turned off quiet while other users of it stay on", async () => {
    const manager = new FCMTokenManager();
    vi.spyOn(manager, "isSupported").mockResolvedValue(true);
    vi.spyOn(manager, "getPermissionState").mockResolvedValue("granted");
    const unregister = vi
      .spyOn(manager, "unregisterToken")
      .mockResolvedValue(undefined);

    await expect(manager.turnOffForCurrentDevice("user-1")).resolves.toBe(
      "off"
    );
    expect(unregister).toHaveBeenCalledWith("user-1");

    // The automatic registration on app start must not undo the choice.
    await expect(manager.registerToken("user-1")).resolves.toBeNull();
    await expect(manager.getRegistrationState("user-1")).resolves.toBe("off");
    expect(manager.isOffOnThisDevice("user-2")).toBe(false);
  });

  it("turning push back on clears this device's off choice", async () => {
    const manager = new FCMTokenManager();
    vi.spyOn(manager, "isSupported").mockResolvedValue(true);
    vi.spyOn(manager, "getPermissionState").mockResolvedValue("granted");
    vi.spyOn(manager, "unregisterToken").mockResolvedValue(undefined);
    await manager.turnOffForCurrentDevice("user-1");

    // Registration itself is stubbed; the real one needs a browser push stack.
    const register = vi
      .spyOn(manager, "registerToken")
      .mockResolvedValue("registered-token");

    await expect(manager.enableForCurrentDevice("user-1")).resolves.toBe(
      "ready"
    );
    expect(register).toHaveBeenCalledWith("user-1");
    expect(manager.isOffOnThisDevice("user-1")).toBe(false);
  });
});
