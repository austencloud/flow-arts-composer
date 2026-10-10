import { describe, expect, it } from "vitest";
import { toFirestorePathShape } from "#lib/shared/error/domain/firestore-path-shape.js";

describe("toFirestorePathShape", () => {
  it("replaces document IDs while retaining collection names", () => {
    expect(toFirestorePathShape("users/user-123/sequences/sequence-456")).toBe(
      "users/{id}/sequences/{id}"
    );
  });

  it("accepts a fully qualified Firestore document path", () => {
    expect(
      toFirestorePathShape(
        "projects/tka/databases/(default)/documents/users/user-123"
      )
    ).toBe("users/{id}");
  });

  it("normalizes extra slashes", () => {
    expect(toFirestorePathShape("/users/user-123/")).toBe("users/{id}");
  });

  it("returns undefined when no path is available", () => {
    expect(toFirestorePathShape(undefined)).toBeUndefined();
    expect(toFirestorePathShape("  ")).toBeUndefined();
  });
});
