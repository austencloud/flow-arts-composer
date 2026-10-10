import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createKeepAliveController } from "#lib/shared/modules/keep-alive-controller.js";

describe("keep-alive-controller", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not mount non-keep-alive modules", () => {
    const c = createKeepAliveController(["museum"], { evictMs: 1000 });
    c.setActiveModule("create");
    expect(c.isMounted("create")).toBe(false);
    expect(c.isVisible("create")).toBe(false);
  });

  it("mounts and shows a keep-alive module when activated", () => {
    const c = createKeepAliveController(["museum"], { evictMs: 1000 });
    c.setActiveModule("museum");
    expect(c.isMounted("museum")).toBe(true);
    expect(c.isVisible("museum")).toBe(true);
  });

  it("keeps a keep-alive module mounted but hidden after switching away", () => {
    const c = createKeepAliveController(["museum"], { evictMs: 1000 });
    c.setActiveModule("museum");
    c.setActiveModule("create");
    expect(c.isMounted("museum")).toBe(true);
    expect(c.isVisible("museum")).toBe(false);
  });

  it("cancels eviction when returning before the timeout", () => {
    const c = createKeepAliveController(["museum"], { evictMs: 1000 });
    c.setActiveModule("museum");
    c.setActiveModule("create");
    vi.advanceTimersByTime(500);
    c.setActiveModule("museum");
    vi.advanceTimersByTime(1000);
    expect(c.isMounted("museum")).toBe(true);
    expect(c.isVisible("museum")).toBe(true);
  });

  it("evicts a keep-alive module after the idle timeout", () => {
    const c = createKeepAliveController(["museum"], { evictMs: 1000 });
    c.setActiveModule("museum");
    c.setActiveModule("create");
    vi.advanceTimersByTime(1000);
    expect(c.isMounted("museum")).toBe(false);
    expect(c.isVisible("museum")).toBe(false);
  });

  it("is idempotent under rapid re-activation (no duplicate timers)", () => {
    const onChange = vi.fn();
    const c = createKeepAliveController(["museum"], { evictMs: 1000, onChange });
    c.setActiveModule("museum");
    c.setActiveModule("museum");
    c.setActiveModule("museum");
    expect(c.isVisible("museum")).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("fires onChange on mount, hide, and eviction", () => {
    const onChange = vi.fn();
    const c = createKeepAliveController(["museum"], { evictMs: 1000, onChange });
    c.setActiveModule("museum"); // mount+show
    c.setActiveModule("create"); // hide + start evict
    vi.advanceTimersByTime(1000); // evict
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("dispose clears pending evict timers", () => {
    const onChange = vi.fn();
    const c = createKeepAliveController(["museum"], { evictMs: 1000, onChange });
    c.setActiveModule("museum");
    c.setActiveModule("create");
    c.dispose();
    onChange.mockClear();
    vi.advanceTimersByTime(5000);
    expect(onChange).not.toHaveBeenCalled();
    expect(c.isMounted("museum")).toBe(true);
  });
});
