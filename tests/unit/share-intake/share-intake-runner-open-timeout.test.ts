import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("$app/env", () => ({ browser: true }));

// The runner's own UI dependencies. None of them is reached when the store
// cannot open, but importing the real ones drags in Firebase.
vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: { effectiveUserId: null, isFullAccount: false, loading: false },
}));
vi.mock("#lib/shared/auth/state/auth-drawer-state.svelte.js", () => ({
  authDrawerState: { show: vi.fn() },
}));
vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({
  toast: { info: vi.fn(), error: vi.fn() },
}));
vi.mock("#lib/shared/inbox/state/inbox-state.svelte.js", () => ({
  inboxState: { shareAttachmentReceiptId: null },
}));

import { scheduleIntakeRun } from "#lib/shared/share-intake/services/share-intake-runner.js";

/**
 * A slow cold boot: indexedDB.open hands back a request that never fires
 * success, error, or blocked, so only openDb's own timer settles it. That
 * rejection used to escape ShareIntakeHost's `void scheduleIntakeRun()` as an
 * "Uncaught (in promise)".
 */
describe("scheduleIntakeRun when IndexedDB is slow to open", () => {
  const open = vi.fn(() => ({}) as IDBOpenDBRequest);

  beforeEach(() => {
    vi.useFakeTimers();
    open.mockClear();
    vi.stubGlobal("indexedDB", { open });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves instead of rejecting, warns once, and lets the next run retry", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const first = scheduleIntakeRun();
    await vi.advanceTimersByTimeAsync(5000);
    await expect(first).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][1])).toContain("IndexedDB open timed out");

    // The failed open is not cached, and the coalescing guard has cleared, so
    // the next share or sign-in really does try the store again.
    const second = scheduleIntakeRun();
    await vi.advanceTimersByTimeAsync(5000);
    await expect(second).resolves.toBeUndefined();

    expect(open).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
