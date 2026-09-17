import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/environment", () => ({ browser: true }));
vi.mock("./posthog", () => ({ captureWhenReady: vi.fn() }));

import { captureWhenReady } from "./posthog";
import { logSessionStart } from "./posthog-activity-logger";
import { SW_UPDATE_RELOAD_MARKER_KEY } from "$lib/shared/offline/services/sw-update-manager";
import { rememberChunkRecoveryReload } from "$lib/shared/offline/services/chunk-recovery-marker";

describe("logSessionStart", () => {
  beforeEach(() => {
    vi.mocked(captureWhenReady).mockClear();
    sessionStorage.clear();
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      { type: "reload" } as PerformanceNavigationTiming,
    ]);
  });

  it("distinguishes a service-worker update from an unexplained reload", async () => {
    sessionStorage.setItem(SW_UPDATE_RELOAD_MARKER_KEY, String(Date.now()));

    await logSessionStart();

    expect(captureWhenReady).toHaveBeenCalledWith(
      "session_start",
      expect.objectContaining({
        category: "session",
        navigation_type: "reload",
        sw_update_reload: true,
        sw_update_reload_age_ms: expect.any(Number),
      })
    );
    expect(sessionStorage.getItem(SW_UPDATE_RELOAD_MARKER_KEY)).toBeNull();

    vi.mocked(captureWhenReady).mockClear();
    await logSessionStart();

    expect(captureWhenReady).toHaveBeenCalledWith(
      "session_start",
      expect.objectContaining({
        navigation_type: "reload",
        sw_update_reload: false,
        sw_update_reload_age_ms: null,
      })
    );
  });

  it("reports a stale-chunk recovery reload consumed at boot, exactly once", async () => {
    rememberChunkRecoveryReload({ occurred: true, ageMs: 800 });

    await logSessionStart();

    expect(captureWhenReady).toHaveBeenCalledWith(
      "session_start",
      expect.objectContaining({
        chunk_recovery_reload: true,
        chunk_recovery_reload_age_ms: 800,
        sw_update_reload: false,
      })
    );

    vi.mocked(captureWhenReady).mockClear();
    await logSessionStart();

    expect(captureWhenReady).toHaveBeenCalledWith(
      "session_start",
      expect.objectContaining({
        chunk_recovery_reload: false,
        chunk_recovery_reload_age_ms: null,
      })
    );
  });
});
