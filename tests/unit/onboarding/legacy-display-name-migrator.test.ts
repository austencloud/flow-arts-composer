import { describe, expect, it, vi } from "vitest";
import { migrateLegacyDisplayNameFromSettings } from "#lib/shared/onboarding/services/legacy-display-name-migrator.js";

describe("legacy display-name migration", () => {
  it("copies a remote legacy name into an empty Firebase Auth profile", async () => {
    const updateDisplayName = vi.fn().mockResolvedValue(undefined);

    await expect(
      migrateLegacyDisplayNameFromSettings({
        expectedUserId: "user-1",
        legacyUserName: "  Andrew  ",
        getIdentity: () => ({
          userId: "user-1",
          isFullAccount: true,
          displayName: null,
        }),
        updateDisplayName,
      })
    ).resolves.toBe("migrated");

    expect(updateDisplayName).toHaveBeenCalledOnce();
    expect(updateDisplayName).toHaveBeenCalledWith("Andrew");
  });

  it("never overwrites a canonical display name", async () => {
    const updateDisplayName = vi.fn().mockResolvedValue(undefined);

    await expect(
      migrateLegacyDisplayNameFromSettings({
        expectedUserId: "user-1",
        legacyUserName: "Legacy name",
        getIdentity: () => ({
          userId: "user-1",
          isFullAccount: true,
          displayName: "Canonical name",
        }),
        updateDisplayName,
      })
    ).resolves.toBe("canonical-name-present");

    expect(updateDisplayName).not.toHaveBeenCalled();
  });

  it("does nothing when the account-scoped legacy field is blank", async () => {
    const updateDisplayName = vi.fn().mockResolvedValue(undefined);

    await expect(
      migrateLegacyDisplayNameFromSettings({
        expectedUserId: "user-1",
        legacyUserName: "   ",
        getIdentity: () => ({
          userId: "user-1",
          isFullAccount: true,
          displayName: null,
        }),
        updateDisplayName,
      })
    ).resolves.toBe("legacy-name-missing");

    expect(updateDisplayName).not.toHaveBeenCalled();
  });

  it("does not migrate after the signed-in identity changes", async () => {
    const updateDisplayName = vi.fn().mockResolvedValue(undefined);

    await expect(
      migrateLegacyDisplayNameFromSettings({
        expectedUserId: "user-1",
        legacyUserName: "Andrew",
        getIdentity: () => ({
          userId: "user-2",
          isFullAccount: true,
          displayName: null,
        }),
        updateDisplayName,
      })
    ).resolves.toBe("identity-changed");

    expect(updateDisplayName).not.toHaveBeenCalled();
  });
});
