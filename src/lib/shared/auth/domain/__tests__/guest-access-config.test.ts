import { describe, expect, it } from "vitest";
import {
  CREATE_TABS,
  SETTINGS_TABS,
} from "#lib/shared/navigation/config/tab-definitions.js";
import {
  getAccessibleTabs,
  guestSettingsEntryTab,
  isModuleAccessible,
  isTabAccessible,
} from "../guest-access-config";

describe("guest Settings access", () => {
  it("allows device settings and sign-in before sign-in", () => {
    expect(isModuleAccessible("settings", "guest")).toBe(true);
    expect(isTabAccessible("settings", "preferences", "guest")).toBe(true);
    expect(isTabAccessible("settings", "language", "guest")).toBe(false);
    expect(getAccessibleTabs("settings", "guest")).toEqual([
      "profile",
      "preferences",
      "display",
      "theme",
      "props",
      "keyboard",
      "release-notes",
    ]);
  });

  it.each([
    "profile",
    "props",
    "theme",
    "preferences",
    "display",
    "keyboard",
    "release-notes",
  ])("opens %s for guests", (tab) => {
    expect(isTabAccessible("settings", tab, "guest")).toBe(true);
  });

  it("keeps account notifications protected for guests", () => {
    expect(isTabAccessible("settings", "notifications", "guest")).toBe(false);
  });

  it("allows account holders to open their Settings tabs", () => {
    expect(isTabAccessible("settings", "profile", "user")).toBe(true);
    expect(isTabAccessible("settings", "preferences", "user")).toBe(true);
  });
});

describe("guest Create access", () => {
  // Opening a method is never a toll. Limits live at the action (save past
  // the cap, publish, export), so every creation method opens for a guest,
  // including any method added later.
  it.each(
    CREATE_TABS.filter((tab) => tab.metadata?.isCreationMethod === true).map(
      (tab) => tab.id
    )
  )("opens %s before sign-in", (tab) => {
    expect(isTabAccessible("create", tab, "guest")).toBe(true);
  });
});

describe("guestSettingsEntryTab", () => {
  const order = SETTINGS_TABS.map((tab) => tab.id);

  it("never lands a guest on Profile", () => {
    expect(guestSettingsEntryTab(order, null)).not.toBe("profile");
    expect(guestSettingsEntryTab(order, "profile")).not.toBe("profile");
    expect(guestSettingsEntryTab(order, "profile")).toBe(
      order.find((tab) => tab !== "profile")
    );
  });

  it("returns a guest to the last tab they used", () => {
    expect(guestSettingsEntryTab(order, "props")).toBe("props");
  });

  it("skips a remembered tab a guest cannot use", () => {
    expect(guestSettingsEntryTab(order, "notifications")).not.toBe(
      "notifications"
    );
  });
});
