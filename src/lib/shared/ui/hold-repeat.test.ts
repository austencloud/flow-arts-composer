// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { holdRepeat } from "./hold-repeat";

// jsdom's MouseEvent carries `button` and `detail`, which is all the action reads.
function press(node: HTMLElement, button = 0) {
  node.dispatchEvent(new MouseEvent("pointerdown", { button, bubbles: true }));
}
function release(node: HTMLElement, type = "pointerup") {
  node.dispatchEvent(new MouseEvent(type, { bubbles: true }));
}
function click(node: HTMLElement, detail: number) {
  node.dispatchEvent(new MouseEvent("click", { detail, bubbles: true }));
}

describe("holdRepeat", () => {
  let button: HTMLButtonElement;
  let steps: number[];
  let action: ReturnType<typeof holdRepeat>;

  beforeEach(() => {
    vi.useFakeTimers();
    // The shared setup stubs document.createElement; a fresh document gives
    // a real button that dispatches events and answers :disabled.
    const doc = document.implementation.createHTMLDocument();
    button = doc.createElement("button");
    doc.body.append(button);
    steps = [];
    action = holdRepeat(button, {
      step: 1,
      fastStep: 5,
      delayMs: 500,
      tickMs: 100,
      accelMs: 2000,
      onStep: (step) => steps.push(step),
    });
  });

  afterEach(() => {
    action.destroy();
    button.remove();
    vi.useRealTimers();
  });

  it("steps once on a tap and does not step again for its click", () => {
    press(button);
    release(button);
    click(button, 1);
    vi.advanceTimersByTime(3000);
    expect(steps).toEqual([1]);
  });

  it("does not repeat before the hold delay", () => {
    press(button);
    vi.advanceTimersByTime(499);
    expect(steps).toEqual([1]);
  });

  it("repeats at the tick once the delay passes", () => {
    press(button);
    vi.advanceTimersByTime(500 + 300);
    expect(steps).toEqual([1, 1, 1, 1]);
  });

  it("uses the larger step after the acceleration point", () => {
    press(button);
    vi.advanceTimersByTime(2000);
    expect(steps.every((step) => step === 1)).toBe(true);
    vi.advanceTimersByTime(200);
    expect(steps.slice(-2)).toEqual([5, 5]);
  });

  it.each(["pointerup", "pointercancel", "pointerleave"])(
    "stops repeating on %s",
    (type) => {
      press(button);
      vi.advanceTimersByTime(700);
      const count = steps.length;
      release(button, type);
      vi.advanceTimersByTime(3000);
      expect(steps).toHaveLength(count);
    }
  );

  it("starts slow again on the next press", () => {
    press(button);
    vi.advanceTimersByTime(2500);
    release(button);
    steps = [];
    press(button);
    vi.advanceTimersByTime(600);
    expect(steps).toEqual([1, 1]);
  });

  it("steps once per keyboard click, even after a press that slid off", () => {
    press(button);
    release(button, "pointerleave");
    click(button, 0);
    click(button, 0);
    expect(steps).toEqual([1, 1, 1]);
  });

  it("ignores secondary buttons", () => {
    press(button, 2);
    vi.advanceTimersByTime(1000);
    expect(steps).toEqual([]);
  });

  it("stops once the button becomes disabled mid-hold", () => {
    press(button);
    vi.advanceTimersByTime(600);
    button.disabled = true;
    const count = steps.length;
    vi.advanceTimersByTime(1000);
    expect(steps).toHaveLength(count);
  });
});
