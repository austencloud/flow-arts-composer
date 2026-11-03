import { describe, expect, it } from "vitest";
import {
  MODULE_DEFINITIONS,
  normalizeNavigationTarget,
  normalizeSectionId,
  sectionScreenAlias,
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

// Theme folded into Display (2026-11-02). Old links, the setup checklist and
// a saved last tab must still reach the theme chooser, not a dead tab.
describe("settings theme folds into Display", () => {
  it("opens Display with its Theme screen from the old address", () => {
    expect(SETTINGS_TABS.some((tab) => tab.id === "theme")).toBe(false);
    expect(normalizeNavigationTarget("settings", "theme")).toEqual({
      moduleId: "settings",
      sectionId: "display",
    });
    expect(sectionScreenAlias("settings", "theme")).toBe("theme");
    expect(sectionScreenAlias("settings", "display")).toBeUndefined();
    expect(isTabAccessible("settings", "display", "guest")).toBe(true);
  });
});

const faName = (icon: string | undefined) =>
  icon?.match(/\bfa-[a-z0-9-]+/)?.[0];

describe("module icons", () => {
  // Austen's report (2026-09-04): the module and its own gallery shared one
  // icon, so the sidebar header and the in-module home looked like one place.
  it("never repeats the Browse module icon on its home or a destination", () => {
    const browse = MODULE_DEFINITIONS.find((module) => module.id === "browse");
    const own = faName(browse?.icon);
    const inner = [
      ["home", browse?.home?.icon],
      ...(browse?.sections ?? []).map((section) => [section.id, section.icon]),
    ];
    expect(own).toBeDefined();
    expect(inner.filter(([, icon]) => faName(icon) === own)).toEqual([]);
  });

  it("gives Browse binoculars while its home keeps the compass", () => {
    const browse = MODULE_DEFINITIONS.find((module) => module.id === "browse");
    expect(faName(browse?.icon)).toBe("fa-binoculars");
    expect(faName(browse?.home?.icon)).toBe("fa-compass");
  });
});
