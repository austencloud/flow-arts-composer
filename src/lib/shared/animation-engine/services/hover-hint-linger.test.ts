import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHoverHintLinger } from "./hover-hint-linger";

describe("createHoverHintLinger", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("stays asleep until the mouse does something", () => {
    const changes: boolean[] = [];
    createHoverHintLinger((awake) => changes.push(awake), 1000);
    vi.advanceTimersByTime(5000);
    expect(changes).toEqual([]);
  });

  it("rests once the mouse stops, however long it was moving", () => {
    const changes: boolean[] = [];
    const linger = createHoverHintLinger((awake) => changes.push(awake), 1000);

    linger.wake();
    vi.advanceTimersByTime(900);
    linger.wake();
    vi.advanceTimersByTime(900);
    expect(changes).toEqual([true]);

    vi.advanceTimersByTime(100);
    expect(changes).toEqual([true, false]);
  });

  it("wakes again after resting", () => {
    const changes: boolean[] = [];
    const linger = createHoverHintLinger((awake) => changes.push(awake), 1000);

    linger.wake();
    vi.advanceTimersByTime(1000);
    linger.wake();
    expect(changes).toEqual([true, false, true]);
  });

  it("reports nothing after it is disposed", () => {
    const changes: boolean[] = [];
    const linger = createHoverHintLinger((awake) => changes.push(awake), 1000);

    linger.wake();
    linger.dispose();
    vi.advanceTimersByTime(5000);
    expect(changes).toEqual([true]);
  });
});
