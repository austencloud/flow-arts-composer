import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/shared/analytics/auth-events.js", () => ({
  trackAuthSurfaceOpened: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function load() {
  const { authDrawerState } =
    await import("#lib/shared/auth/state/auth-drawer-state.svelte.js");
  const toasts = await import("#lib/shared/toast/state/toast-state.svelte.js");
  return { auth: authDrawerState, ...toasts };
}

describe("account prompt coordination", () => {
  it("shares one optional invitation across collections, saves and reloads", async () => {
    const { auth, toastQueue, removeToast } = await load();
    expect(auth.offerGuestSaveNudge({ message: "Added to a collection" })).toBe(
      true
    );
    expect(auth.offerGuestSaveNudge({ message: "Saved a sequence" })).toBe(
      false
    );
    expect(toastQueue).toHaveLength(1);
    removeToast(toastQueue[0]!.id);
    auth.reset();
    expect(auth.offerGuestSaveNudge({ message: "Saved again" })).toBe(false);
    vi.resetModules();
    expect(
      (await load()).auth.offerGuestSaveNudge({ message: "After reload" })
    ).toBe(false);
  });

  it("replaces the invitation with the modal while preserving unrelated notifications", async () => {
    const { auth, toastQueue, showToast } = await load();
    showToast({ message: "Upload failed", type: "error", duration: 0 });
    auth.offerGuestSaveNudge({ message: "Saved" });
    auth.show("signup", "save");
    expect(auth.open).toBe(true);
    expect(toastQueue.map((t) => t.message)).toEqual(["Upload failed"]);
    auth.hide();
    expect(auth.offerGuestSaveNudge({ message: "Scan saved" })).toBe(false);
  });

  it("does not repeat or reset a modal for duplicate calls", async () => {
    const { auth } = await load();
    const { trackAuthSurfaceOpened } =
      await import("#lib/shared/analytics/auth-events.js");
    vi.mocked(trackAuthSurfaceOpened).mockClear();
    auth.show("signup", "save");
    auth.show("signup", "save");
    expect(trackAuthSurfaceOpened).toHaveBeenCalledOnce();
    auth.hide();
    auth.show("signin");
    expect(auth.initialMode).toBe("signin");
    expect(trackAuthSurfaceOpened).toHaveBeenCalledTimes(2);
  });

  it("keeps a session guard when browser storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { auth, toastQueue, removeToast } = await load();
    auth.offerGuestSaveNudge({ message: "Saved" });
    removeToast(toastQueue[0]!.id);
    expect(auth.offerGuestSaveNudge({ message: "Saved elsewhere" })).toBe(
      false
    );
  });
});
