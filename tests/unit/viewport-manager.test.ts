import { describe, expect, it, vi } from "vitest";
import { ViewportManager } from "../../src/lib/shared/device/services/viewport-manager.svelte";

describe("ViewportManager", () => {
  it("ignores queued dimension checks after the browser environment closes", () => {
    vi.useFakeTimers();
    const viewport = new ViewportManager();
    const browserWindow = window;

    try {
      browserWindow.dispatchEvent(new Event("resize"));
      vi.stubGlobal("window", undefined);
      expect(() => vi.advanceTimersByTime(101)).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
      viewport.dispose();
      vi.useRealTimers();
    }
  });
});
