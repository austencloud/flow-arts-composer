import { describe, expect, it, vi } from "vitest";
import {
  createVariationSwapTracker,
  type VariationSwapEvent,
} from "./variation-swap-timing";

function setup() {
  let clock = 1000;
  const emit = vi.fn<(event: VariationSwapEvent) => void>();
  const tracker = createVariationSwapTracker(emit, () => clock);
  return {
    tracker,
    emit,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("variation swap timing", () => {
  it("reports tap to picture as shown, with its source", () => {
    const { tracker, emit, advance } = setup();
    tracker.tap({ variationCount: 52, prepared: true });
    advance(240);
    tracker.shown("memory");
    expect(emit).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith({
      duration_ms: 240,
      outcome: "shown",
      source: "memory",
      variation_count: 52,
      prepared: true,
    });
  });

  it("ends an unanswered tap as tapped_again at the next tap", () => {
    const { tracker, emit, advance } = setup();
    tracker.tap({ variationCount: 5, prepared: false });
    advance(4000);
    tracker.tap({ variationCount: 5, prepared: true });
    expect(emit).toHaveBeenCalledOnce();
    expect(emit.mock.calls[0]![0]).toEqual({
      duration_ms: 4000,
      outcome: "tapped_again",
      variation_count: 5,
      prepared: false,
    });
    advance(100);
    tracker.shown("render");
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[1]![0]).toMatchObject({
      outcome: "shown",
      duration_ms: 100,
      prepared: true,
    });
  });

  it("ends a pending swap as left, once", () => {
    const { tracker, emit, advance } = setup();
    tracker.tap({ variationCount: 3, prepared: false });
    advance(700);
    tracker.left();
    tracker.left();
    tracker.shown("cloud");
    expect(emit).toHaveBeenCalledOnce();
    expect(emit.mock.calls[0]![0]).toMatchObject({
      outcome: "left",
      duration_ms: 700,
    });
    expect(emit.mock.calls[0]![0]).not.toHaveProperty("source");
  });

  it("emits nothing for pictures or leaving without a tap", () => {
    const { tracker, emit } = setup();
    tracker.shown("static");
    tracker.left();
    expect(emit).not.toHaveBeenCalled();
  });

  it("emits one event per tap across a run of taps", () => {
    const { tracker, emit, advance } = setup();
    for (let i = 0; i < 4; i++) {
      tracker.tap({ variationCount: 9, prepared: false });
      advance(50);
    }
    tracker.shown("local");
    expect(emit).toHaveBeenCalledTimes(4);
    expect(emit.mock.calls.map((c) => c[0].outcome)).toEqual([
      "tapped_again",
      "tapped_again",
      "tapped_again",
      "shown",
    ]);
  });
});
