import { describe, expect, it } from "vitest";
import {
  getAccessibleTabs,
  isModuleAccessible,
  isTabAccessible,
} from "../guest-access-config";

describe("guest Settings access", () => {
  it("allows the language tab before sign-in", () => {
    expect(isModuleAccessible("settings", "guest")).toBe(true);
    expect(isTabAccessible("settings", "language", "guest")).toBe(true);
    expect(getAccessibleTabs("settings", "guest")).toEqual(["language"]);
  });

  it.each([
    "profile",
    "props",
    "theme",
    "preferences",
    "notifications",
    "keyboard",
    "release-notes",
  ])("keeps %s protected for guests", (tab) => {
    expect(isTabAccessible("settings", tab, "guest")).toBe(false);
  });

  it("allows account holders to open their Settings tabs", () => {
    expect(isTabAccessible("settings", "profile", "user")).toBe(true);
    expect(isTabAccessible("settings", "language", "user")).toBe(true);
  });
});
