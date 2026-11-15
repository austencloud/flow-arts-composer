import { describe, expect, it, vi } from "vitest";
import {
  ExportAttemptGuard,
  settleRefusedExportStart,
} from "#lib/shared/sequence-viewer/domain/export-attempt-guard.js";

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

describe("settleRefusedExportStart", () => {
  it("puts a refused start back at rest, so leaving later reports nothing", async () => {
    const guard = new ExportAttemptGuard();
    const token = guard.begin()!;
    const events: string[] = [];

    // The account ask opened instead of an export: the start resolves false.
    const settled = await settleRefusedExportStart(
      guard,
      token,
      Promise.resolve(false),
      () => {
        if (guard.finish(token)) events.push("canceled:not_started");
      }
    );

    expect(settled).toBe(true);
    expect(guard.active).toBe(false);
    // Closing the viewer abandons whatever is active. Nothing is, so no
    // second, untapped export event goes out.
    expect(guard.abandon()).toBeNull();
    expect(events).toEqual(["canceled:not_started"]);
  });

  it("treats a throwing start as refused", async () => {
    const guard = new ExportAttemptGuard();
    const token = guard.begin()!;
    await settleRefusedExportStart(guard, token, Promise.reject(new Error("x")), () =>
      guard.finish(token)
    );
    expect(guard.active).toBe(false);
  });

  it("leaves a started or silent export running", async () => {
    for (const start of [Promise.resolve(true), undefined, Promise.resolve()]) {
      const guard = new ExportAttemptGuard();
      const token = guard.begin()!;
      const onRefused = vi.fn();
      expect(await settleRefusedExportStart(guard, token, start, onRefused)).toBe(false);
      expect(onRefused).not.toHaveBeenCalled();
      expect(guard.isActive(token)).toBe(true);
    }
  });

  it("ignores a late refusal once a newer attempt owns the guard", async () => {
    const guard = new ExportAttemptGuard();
    const old = guard.begin()!;
    guard.abandon();
    const fresh = guard.begin()!;
    const onRefused = vi.fn();
    await settleRefusedExportStart(guard, old, Promise.resolve(false), onRefused);
    expect(onRefused).not.toHaveBeenCalled();
    expect(guard.isActive(fresh)).toBe(true);
  });
});
