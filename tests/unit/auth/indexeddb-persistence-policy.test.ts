import { describe, expect, it } from "vitest";
import { shouldAvoidIndexedDbPersistence } from "#lib/shared/auth/services/indexeddb-persistence-policy.js";

describe("shouldAvoidIndexedDbPersistence", () => {
  it("uses non-IndexedDB Firebase backends in desktop Safari", () => {
    expect(
      shouldAvoidIndexedDbPersistence({
        browser: "safari",
        platform: "desktop",
      })
    ).toBe(true);
  });

  it("covers every iOS browser because they share WebKit storage", () => {
    expect(
      shouldAvoidIndexedDbPersistence({
        browser: "chrome",
        platform: "ios",
      })
    ).toBe(true);
  });

  it("keeps persistent Firestore caching in desktop Chromium", () => {
    expect(
      shouldAvoidIndexedDbPersistence({
        browser: "chrome",
        platform: "desktop",
      })
    ).toBe(false);
  });
});
