import { describe, expect, it } from "vitest";
import {
  normalizeNavigationTarget,
  normalizeSectionId,
} from "./module-definitions";
import { SETTINGS_TABS } from "./tab-definitions";
import { isTabAccessible } from "$lib/shared/auth/domain/guest-access-config";

describe("settings language navigation migration", () => {
  it("lands old bookmarks and saved sections on Preferences", () => {
    expect(normalizeSectionId("settings", "language")).toBe("preferences");
    expect(normalizeNavigationTarget("settings", "language")).toEqual({
      moduleId: "settings",
      sectionId: "preferences",
    });
    expect(isTabAccessible("settings", "preferences", "guest")).toBe(true);
  });

  it("exposes Preferences without a standalone Language destination", () => {
    expect(SETTINGS_TABS.some((tab) => tab.id === "preferences")).toBe(true);
    expect(SETTINGS_TABS.some((tab) => tab.id === "language")).toBe(false);
  });
});
