import { describe, it, expect } from "vitest";
import {
  isModuleAccessible,
  isTabAccessible,
  getAccessibleTabs,
} from "$lib/shared/auth/domain/guest-access-config";

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

  it("blocks learn for guests", () => {
    expect(isModuleAccessible("learn", "guest")).toBe(false);
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

  it("allows Explore in Browse for guests", () => {
    expect(isTabAccessible("browse", "explore", "guest")).toBe(true);
  });

  it("allows You so guests can reach on-device saved work", () => {
    expect(isTabAccessible("browse", "you", "guest")).toBe(true);
  });

  it("does not invent sub-tabs for the Creators module", () => {
    expect(isTabAccessible("creators", "creators", "guest")).toBe(false);
  });

  it("allows the shape-engine tab in create for guests", () => {
    expect(isTabAccessible("create", "shape-engine", "guest")).toBe(true);
  });
});

describe("getAccessibleTabs", () => {
  it("returns allowed tabs for guests in create", () => {
    expect(getAccessibleTabs("create", "guest")).toEqual([
      "assemble",
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
