import { describe, it, expect } from "vitest";
import {
  isModuleAccessible,
  isTabAccessible,
  getAccessibleTabs,
} from "#lib/shared/auth/domain/guest-access-config.js";

describe("isModuleAccessible", () => {
  it("allows create for guests", () => {
    expect(isModuleAccessible("create", "guest")).toBe(true);
  });

  it("allows browse for guests", () => {
    expect(isModuleAccessible("browse", "guest")).toBe(true);
  });

  it("allows public creator profiles for guests", () => {
    expect(isModuleAccessible("creators", "guest")).toBe(true);
  });

  it("opens learn to guests so a scanner can read the Guide", () => {
    expect(isModuleAccessible("learn", "guest")).toBe(true);
  });

  it("blocks social for guests", () => {
    expect(isModuleAccessible("social", "guest")).toBe(false);
  });

  it("allows all modules for authenticated users", () => {
    expect(isModuleAccessible("creators", "user")).toBe(true);
    expect(isModuleAccessible("learn", "user")).toBe(true);
    expect(isModuleAccessible("social", "user")).toBe(true);
    expect(isModuleAccessible("settings", "user")).toBe(true);
  });
});

describe("isTabAccessible", () => {
  it("allows construct tab in create for guests", () => {
    expect(isTabAccessible("create", "construct", "guest")).toBe(true);
  });

  it("allows the public Browse destinations for guests", () => {
    for (const section of ["sequences", "collections", "visuals"]) {
      expect(isTabAccessible("browse", section, "guest")).toBe(true);
    }
  });

  it("allows Your library so guests can reach on-device saved work", () => {
    for (const section of ["drafts", "saved", "your-visuals", "your-videos"]) {
      expect(isTabAccessible("browse", section, "guest")).toBe(true);
    }
  });

  it("does not invent sub-tabs for the Creators module", () => {
    expect(isTabAccessible("creators", "creators", "guest")).toBe(false);
  });

  it("allows only the written Guide in learn for guests", () => {
    expect(isTabAccessible("learn", "guide", "guest")).toBe(true);
    expect(isTabAccessible("learn", "concepts", "guest")).toBe(false);
    expect(isTabAccessible("learn", "play", "guest")).toBe(false);
  });

  it("allows the shape-engine tab in create for guests", () => {
    expect(isTabAccessible("create", "shape-engine", "guest")).toBe(true);
  });
});

describe("getAccessibleTabs", () => {
  it("returns allowed tabs for guests in create", () => {
    expect(getAccessibleTabs("create", "guest")).toEqual([
      "construct",
      "generate",
      "shape-engine",
    ]);
  });

  it("returns an empty tab list for the tabless Creators module", () => {
    expect(getAccessibleTabs("creators", "guest")).toEqual([]);
  });

  it("returns null for authenticated users (no filtering)", () => {
    expect(getAccessibleTabs("create", "user")).toBeNull();
  });
});
