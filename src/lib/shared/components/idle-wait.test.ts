import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isModalOnScreen, waitForIdle } from "./idle-wait";

describe("waitForIdle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // The tests run without a browser; an EventTarget stands in for the window.
    vi.stubGlobal("window", new EventTarget());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("runs once after a quiet stretch", () => {
    const attempt = vi.fn(() => true);
    waitForIdle(attempt, 4000);
    vi.advanceTimersByTime(3999);
    expect(attempt).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(attempt).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("starts the wait over on each pointer press or key press", () => {
    const attempt = vi.fn(() => true);
    waitForIdle(attempt, 4000);
    vi.advanceTimersByTime(3000);
    window.dispatchEvent(new Event("pointerdown"));
    vi.advanceTimersByTime(3000);
    window.dispatchEvent(new Event("keydown"));
    vi.advanceTimersByTime(3999);
    expect(attempt).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("keeps waiting for the next quiet window when the attempt declines", () => {
    let blocked = true;
    const attempt = vi.fn(() => !blocked);
    waitForIdle(attempt, 4000);
    vi.advanceTimersByTime(4000);
    expect(attempt).toHaveBeenCalledTimes(1);
    blocked = false;
    vi.advanceTimersByTime(4000);
    expect(attempt).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(20_000);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("does nothing after it is cancelled", () => {
    const attempt = vi.fn(() => true);
    const cancel = waitForIdle(attempt, 4000);
    cancel();
    vi.advanceTimersByTime(10_000);
    expect(attempt).not.toHaveBeenCalled();
  });
});

describe("isModalOnScreen", () => {
  it("is true while the auth sheet is open", () => {
    expect(isModalOnScreen(true)).toBe(true);
  });
});
