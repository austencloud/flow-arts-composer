import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { holdDeferredWorkForMotion } from "#lib/shared/foundation/utils/background-scheduling.js";

import { queueTilePaint } from "./tile-paint-queue";

describe("effect tile painting", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(async () => {
    await vi.advanceTimersByTimeAsync(5000);
    vi.useRealTimers();
  });

  it("paints no tile in the task that mounted it", async () => {
    const paint = vi.fn();
    queueTilePaint(paint);
    expect(paint).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10);
    expect(paint).toHaveBeenCalledOnce();
  });

  it("finishes an async painter before starting the next", async () => {
    const order: string[] = [];
    let finishFirst = (): void => {};
    queueTilePaint(() => {
      order.push("first starts");
      return new Promise<void>((resolve) => (finishFirst = resolve));
    });
    queueTilePaint(() => order.push("second starts"));
    await vi.advanceTimersByTimeAsync(10);
    expect(order).toEqual(["first starts"]);
    finishFirst();
    await vi.advanceTimersByTimeAsync(10);
    expect(order).toEqual(["first starts", "second starts"]);
  });

  it("skips a tile that was cancelled before its turn", async () => {
    const paint = vi.fn();
    const cancel = queueTilePaint(paint);
    cancel();
    await vi.advanceTimersByTimeAsync(10);
    expect(paint).not.toHaveBeenCalled();
  });

  it("waits for a motion to land", async () => {
    const paint = vi.fn();
    const land = holdDeferredWorkForMotion();
    queueTilePaint(paint);
    await vi.advanceTimersByTimeAsync(10);
    expect(paint).not.toHaveBeenCalled();
    land();
    await vi.advanceTimersByTimeAsync(10);
    expect(paint).toHaveBeenCalledOnce();
  });

  it("keeps painting after a tile fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const next = vi.fn();
    queueTilePaint(() => {
      throw new Error("no canvas");
    });
    queueTilePaint(next);
    await vi.advanceTimersByTimeAsync(10);
    expect(next).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
