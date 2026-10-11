import { describe, expect, it } from "vitest";
import {
  normalizeNavigationTarget,
  normalizeSectionId,
} from "./module-definitions";
import { SETTINGS_TABS } from "./tab-definitions";
import { isTabAccessible } from "#lib/shared/auth/domain/guest-access-config.js";

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

  it("keeps Keyboard and Release Notes links routable without sidebar destinations", () => {
    for (const sectionId of ["keyboard", "release-notes"]) {
      expect(normalizeNavigationTarget("settings", sectionId)).toEqual({
        moduleId: "settings",
        sectionId,
      });
      expect(
        SETTINGS_TABS.find((tab) => tab.id === sectionId)?.navigationHidden
      ).toBe(true);
    }
  });
});
