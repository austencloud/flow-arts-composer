// @vitest-environment jsdom
// jsdom, not the suite's default node env: this module's whole job is
// localStorage, which node doesn't have.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The module is browser-gated. Force the browser branch so the localStorage
// path under test actually runs.
vi.mock("$app/env", () => ({ browser: true }));

const STORAGE_KEY = "tka:last-auth-method";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fresh module per test: the record lives in module-level $state, so importing
 * once and reusing it would leak the previous test's value into the next.
 */
async function loadModule() {
  vi.resetModules();
  return import("#lib/shared/auth/services/last-auth-method.svelte.js");
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("last-auth-method", () => {
  it("returns null when nothing was ever recorded", async () => {
    const { getLastAuthMethod } = await loadModule();
    expect(getLastAuthMethod()).toBeNull();
  });

  it("round-trips a recorded method through localStorage", async () => {
    const first = await loadModule();
    first.recordLastAuthMethod("google");
    expect(first.getLastAuthMethod()).toBe("google");

    // A fresh page load reads it back off disk, not off in-memory state.
    const reloaded = await loadModule();
    expect(reloaded.getLastAuthMethod()).toBe("google");
  });

  it("overwrites the previous method rather than accumulating", async () => {
    const mod = await loadModule();
    mod.recordLastAuthMethod("google");
    mod.recordLastAuthMethod("magic-link");
    expect(mod.getLastAuthMethod()).toBe("magic-link");
  });

  it("clears on demand", async () => {
    const mod = await loadModule();
    mod.recordLastAuthMethod("facebook");
    mod.clearLastAuthMethod();
    expect(mod.getLastAuthMethod()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("expires a record older than 180 days", async () => {
    const stale = Date.now() - 181 * DAY_MS;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ method: "google", at: stale }));

    const { getLastAuthMethod } = await loadModule();
    expect(getLastAuthMethod()).toBeNull();
  });

  it("keeps a record just inside the 180-day window", async () => {
    const recent = Date.now() - 179 * DAY_MS;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ method: "password", at: recent }));

    const { getLastAuthMethod } = await loadModule();
    expect(getLastAuthMethod()).toBe("password");
  });

  it.each([
    ["malformed JSON", "not json at all"],
    ["unknown method", JSON.stringify({ method: "myspace", at: Date.now() })],
    ["missing timestamp", JSON.stringify({ method: "google" })],
    ["non-numeric timestamp", JSON.stringify({ method: "google", at: "yesterday" })],
    ["empty object", JSON.stringify({})],
  ])("reads null instead of throwing on %s", async (_label, raw) => {
    localStorage.setItem(STORAGE_KEY, raw);
    const { getLastAuthMethod } = await loadModule();
    expect(getLastAuthMethod()).toBeNull();
  });

  it("never persists anything beyond the method name and a timestamp", async () => {
    const mod = await loadModule();
    mod.recordLastAuthMethod("google");

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    // No email, uid, or display name may ever land here — that is the whole
    // privacy argument for shipping this badge at all.
    expect(Object.keys(stored).sort()).toEqual(["at", "method"]);
  });

  it("survives localStorage throwing (private mode / quota)", async () => {
    const mod = await loadModule();
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    expect(() => mod.recordLastAuthMethod("google")).not.toThrow();
    // In-memory value still updates so the badge works for this session.
    expect(mod.getLastAuthMethod()).toBe("google");

    setItem.mockRestore();
  });
});
