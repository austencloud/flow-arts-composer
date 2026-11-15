// @vitest-environment jsdom
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createScanArrivalHarness } from "./scan-arrival-layout-harness.svelte";

/**
 * A scan used to open on Card and, about a second after the card painted,
 * switch itself to Side by Side: the card moved down, re-laid itself out and
 * the workspace dissolved, which read as the page refreshing. The scan now
 * opens on Side by Side, and the card's paint only starts the animation.
 */
describe("scan arrival", () => {
  const disposals: Array<() => void> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    while (disposals.length > 0) disposals.pop()?.();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("starts the animation after the card paints without changing the view", () => {
    const harness = createScanArrivalHarness();
    disposals.push(harness.dispose);
    disposals.push(harness.layout.mount());

    expect(harness.captureScanViewerOpened).toHaveBeenCalledWith("split");

    harness.setCardReady(true);
    flushSync();
    expect(harness.ensureInteractiveServices).not.toHaveBeenCalled();

    // Two paints, then the next task.
    vi.advanceTimersByTime(100);

    expect(harness.ensureInteractiveServices).toHaveBeenCalledOnce();
    expect(harness.viewerMode).toBe("split");
    expect(harness.setViewerMode).not.toHaveBeenCalled();
    expect(harness.setSplitConfig).not.toHaveBeenCalled();
  });

  it("starts the animation only once when the card repaints", () => {
    const harness = createScanArrivalHarness();
    disposals.push(harness.dispose);

    harness.setCardReady(true);
    flushSync();
    vi.advanceTimersByTime(100);
    harness.setCardReady(false);
    flushSync();
    harness.setCardReady(true);
    flushSync();
    vi.advanceTimersByTime(100);

    expect(harness.ensureInteractiveServices).toHaveBeenCalledOnce();
  });

  it("leaves hosts that did not defer startup alone", () => {
    const harness = createScanArrivalHarness(false);
    disposals.push(harness.dispose);

    harness.setCardReady(true);
    flushSync();
    vi.advanceTimersByTime(100);

    expect(harness.ensureInteractiveServices).not.toHaveBeenCalled();
    expect(harness.setViewerMode).not.toHaveBeenCalled();
  });
});
