import { describe, expect, it } from "vitest";
import { ExportAttemptGuard } from "#lib/shared/sequence-viewer/domain/export-attempt-guard.js";

describe("ExportAttemptGuard", () => {
  it("rejects re-entry and permits exactly one terminal outcome", () => {
    const guard = new ExportAttemptGuard();
    const first = guard.begin();

    expect(first).toBe(1);
    expect(guard.begin()).toBeNull();
    expect(guard.finish(first!)).toBe(true);
    expect(guard.finish(first!)).toBe(false);
    expect(guard.active).toBe(false);
  });

  it("invalidates late work after abandonment and allows a new attempt", () => {
    const guard = new ExportAttemptGuard();
    const abandoned = guard.begin()!;
    expect(guard.abandon()).toBe(abandoned);
    expect(guard.finish(abandoned)).toBe(false);

    const retry = guard.begin()!;
    expect(retry).toBeGreaterThan(abandoned);
    expect(guard.finish(retry)).toBe(true);
  });
});
