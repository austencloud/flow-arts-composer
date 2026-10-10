import { describe, it, expect } from "vitest";
import { AppVersionSchema } from "#lib/shared/feedback/domain/models/feedback-schemas.js";

/**
 * Legacy version-doc regression lock.
 *
 * Old release scripts wrote explicit `null` (not `undefined`) for absent
 * optional fields on `versions/*` docs. `z.string().optional()` accepts
 * `undefined` but REJECTS `null`, so `firestore-crud`'s safeParse dropped the
 * whole doc and logged `[firestore] Validation failed for versions/0.3.0:
 * releaseNotes expected string` on every app load (surfaced in a real user's
 * live session, 2026-07-08). The fix accepts null via `.nullish()` and coerces
 * it back to `undefined` so the output type stays `T | undefined`.
 */
describe("AppVersionSchema legacy null optional fields", () => {
  const base = {
    id: "0.3.0",
    version: "0.3.0",
    releasedAt: "2026-01-01T00:00:00.000Z",
    feedbackCount: 3,
    feedbackSummary: { bugs: 1, features: 1, general: 1 },
  };

  it("parses a legacy doc whose optional fields are null (does not drop it)", () => {
    const result = AppVersionSchema.safeParse({
      ...base,
      releaseNotes: null,
      changelogEntries: null,
      highlights: null,
      contributorIds: null,
    });
    expect(result.success).toBe(true);
  });

  it("coerces null optional fields to undefined (output type stays T | undefined)", () => {
    const result = AppVersionSchema.parse({
      ...base,
      releaseNotes: null,
      changelogEntries: null,
      highlights: null,
      contributorIds: null,
    });
    expect(result.releaseNotes).toBeUndefined();
    expect(result.changelogEntries).toBeUndefined();
    expect(result.highlights).toBeUndefined();
    expect(result.contributorIds).toBeUndefined();
  });

  it("still preserves real string / array values", () => {
    const result = AppVersionSchema.parse({
      ...base,
      releaseNotes: "Fixed the thing",
      highlights: ["a", "b"],
      contributorIds: ["u1"],
    });
    expect(result.releaseNotes).toBe("Fixed the thing");
    expect(result.highlights).toEqual(["a", "b"]);
    expect(result.contributorIds).toEqual(["u1"]);
  });

  it("still parses when optional fields are omitted entirely", () => {
    const result = AppVersionSchema.parse(base);
    expect(result.releaseNotes).toBeUndefined();
    expect(result.feedbackCount).toBe(3);
  });
});
