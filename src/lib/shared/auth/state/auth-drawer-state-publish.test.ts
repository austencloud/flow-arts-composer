import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/shared/analytics/auth-events.js", () => ({
  trackAuthSurfaceOpened: vi.fn(),
}));

/**
 * A guest who switches Public on still saves, privately, because only a full
 * account can post to the gallery. The save service answers with this toast
 * instead of the raw "Couldn't publish" box guests used to get (Lupe's
 * visitor replay, 2026-11-15).
 */
describe("authDrawerState when a guest asks to publish", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
    });
    // The first-save invitation is offered once per page, so each test gets
    // fresh copies of both modules.
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function freshModules() {
    const toasts =
      await import("#lib/shared/toast/state/toast-state.svelte.js");
    const { authDrawerState: drawer } =
      await import("./auth-drawer-state.svelte");
    return { toasts, drawer };
  }

  it("offers the account for publishing every time, replacing rather than stacking", async () => {
    const { toasts, drawer } = await freshModules();

    expect(drawer.offerPublishAccount("First ask")).toBe(true);
    expect(drawer.offerPublishAccount("Second ask")).toBe(true);

    expect(toasts.toastQueue.map((toast) => toast.message)).toEqual([
      "Second ask",
    ]);
    expect(toasts.toastQueue[0]?.action?.label).toBe("Create account");
    toasts.toastQueue[0]?.action?.onClick();
    expect(drawer.open).toBe(true);
    expect(drawer.reason).toBe("viewer-signin-publish");
    drawer.reset();
    drawer.clearGateCooldown();
    toasts.clearToasts();
  });

  it("stands in for the first-save invitation", async () => {
    const { toasts, drawer } = await freshModules();

    drawer.offerPublishAccount("Saved on this device.");
    toasts.clearToasts();

    expect(drawer.offerGuestSaveNudge({ message: "Saved again." })).toBe(false);
    expect(toasts.toastQueue).toEqual([]);
    drawer.clearGateCooldown();
  });
});
