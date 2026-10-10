import { flushSync } from "svelte";
import { describe, expect, it, vi } from "vitest";
import { createScanActivityState } from "#lib/features/choreo-card/state/scan-activity-state.svelte.js";
import type { ScanEventRow } from "#lib/features/choreo-card/state/scan-activity-state.svelte.js";
import { createScanActivityConnectionHarness } from "./scan-activity-connection-harness.svelte";

describe("scan activity connection lifecycle", () => {
  it("tracks auth changes without tracking the rune state changed by connect", async () => {
    let publishEvents: (events: ScanEventRow[]) => void = () => {};
    const stopSubscription = vi.fn();
    const watchRecentEvents = vi.fn(async (onEvents) => {
      publishEvents = onEvents;
      return stopSubscription;
    });
    const activity = createScanActivityState({
      data: {
        watchRecentEvents,
        loadCards: vi.fn(async () => []),
        loadAuthor: vi.fn(async () => ({ displayName: "Unknown" })),
      },
      decodeSequence: vi.fn(async () => ({ steps: [] }) as never),
    });
    const harness = createScanActivityConnectionHarness(activity);

    try {
      flushSync();
      expect(watchRecentEvents).not.toHaveBeenCalled();

      expect(() =>
        flushSync(() => {
          harness.setAuth({
            loading: false,
            userId: "owner-1",
            isAdmin: true,
          });
        })
      ).not.toThrow();
      expect(watchRecentEvents).toHaveBeenCalledTimes(1);

      publishEvents([
        {
          id: "shortcodes/WOYG/scanEvents/live",
          code: "WOYG",
          timestamp: "2026-07-20T12:00:00.000Z",
          city: "Chicago",
          country: "US",
          lat: 41.85,
          lng: -87.65,
          deviceId: null,
          userId: null,
          leftPropType: null,
          rightPropType: null,
          catDogMode: null,
        },
      ]);
      expect(activity.status).toBe("live");

      await Promise.resolve();
      await Promise.resolve();
      expect(watchRecentEvents).toHaveBeenCalledTimes(1);
    } finally {
      harness.dispose();
    }

    expect(stopSubscription).toHaveBeenCalledTimes(1);
  });
});
