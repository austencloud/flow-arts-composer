import { describe, expect, it } from "vitest";
import { isFirestoreOfflineError } from "../is-firestore-offline-error";

describe("isFirestoreOfflineError", () => {
  it("recognises the SDK's offline read failure", () => {
    const error = Object.assign(
      new Error("Failed to get document because the client is offline."),
      { code: "unavailable" }
    );
    expect(isFirestoreOfflineError(error)).toBe(true);
  });

  it("keeps real failures reportable", () => {
    const denied = Object.assign(
      new Error("Missing or insufficient permissions."),
      { code: "permission-denied" }
    );
    expect(isFirestoreOfflineError(denied)).toBe(false);
    expect(isFirestoreOfflineError(new Error("boom"))).toBe(false);
    expect(isFirestoreOfflineError(null)).toBe(false);
  });
});
