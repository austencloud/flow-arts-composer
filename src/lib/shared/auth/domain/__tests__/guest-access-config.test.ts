import { describe, expect, it } from "vitest";
import {
  getAccessibleTabs,
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
  it.each(["construct", "generate", "shape-engine"])(
    "opens %s before sign-in",
    (tab) => {
      expect(isTabAccessible("create", tab, "guest")).toBe(true);
    }
  );

  // Account-only methods still appear on the front door, marked with a
  // Free account label that opens sign-up.
  it.each(["assemble", "fuse", "tunnel"])(
    "keeps %s for account holders",
    (tab) => {
      expect(isTabAccessible("create", tab, "guest")).toBe(false);
      expect(isTabAccessible("create", tab, "user")).toBe(true);
    }
  );
});
