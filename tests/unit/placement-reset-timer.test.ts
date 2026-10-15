import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlacementResetTimer } from "../../src/lib/features/create/generate/components/placement-reset-timer";

describe("Generate placement reset timer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps the current 150 ms delay and runs the reset once", () => {
    const timer = new PlacementResetTimer();
    const reset = vi.fn();
    timer.schedule(reset, 150);
    vi.advanceTimersByTime(149);
    expect(reset).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reset).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("only applies the latest grid selection after rapid replacements", () => {
    const timer = new PlacementResetTimer();
    let grid = "initial";
    timer.schedule(() => (grid = "diamond"), 150);
    vi.advanceTimersByTime(100);
    timer.schedule(() => (grid = "box"), 150);
    vi.advanceTimersByTime(50);
    expect(grid).toBe("initial");
    vi.advanceTimersByTime(100);
    expect(grid).toBe("box");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels pending work when the panel unmounts or applies an immediate change", () => {
    const timer = new PlacementResetTimer();
    const reset = vi.fn();
    timer.schedule(reset, 150);
    timer.cancel();
    timer.cancel();
    expect(vi.getTimerCount()).toBe(0);
    vi.runAllTimers();
    expect(reset).not.toHaveBeenCalled();
  });

  it("keeps timers independent across panel lifetimes", () => {
    const first = new PlacementResetTimer();
    const second = new PlacementResetTimer();
    const firstReset = vi.fn();
    const secondReset = vi.fn();
    first.schedule(firstReset, 150);
    second.schedule(secondReset, 150);
    first.cancel();
    vi.runAllTimers();
    expect(firstReset).not.toHaveBeenCalled();
    expect(secondReset).toHaveBeenCalledTimes(1);
  });
});
