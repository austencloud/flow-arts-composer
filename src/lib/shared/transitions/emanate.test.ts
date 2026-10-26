import { afterEach, describe, expect, it } from "vitest";
import {
  EMANATE_LEAD_MS,
  EMANATE_SPREAD_MS,
  emanate,
  emanateTiming,
  type EmanateRect,
} from "./emanate";
import { arrive } from "./motion";
import { DURATION, SLIDE } from "./transitions";

const rect = (left: number, top: number, width = 0, height = 0): EmanateRect => ({
  left,
  top,
  width,
  height,
});

// A 400 by 300 sheet with the start cell centred on its top-left corner.
const bounds = rect(0, 0, 400, 300);
const origin = rect(-20, -20, 40, 40);

describe("emanateTiming", () => {
  it("gives a card at the origin the lead and no push", () => {
    const timing = emanateTiming({ card: rect(-10, -10, 20, 20), origin, bounds });
    expect(timing.delay).toBe(EMANATE_LEAD_MS);
    expect(timing.dx).toBe(0);
    expect(timing.dy).toBe(0);
  });

  it("gives a card at the farthest corner the lead plus the spread", () => {
    const timing = emanateTiming({ card: rect(400, 300), origin, bounds });
    expect(timing.delay).toBeCloseTo(EMANATE_LEAD_MS + EMANATE_SPREAD_MS);
  });

  it("pushes SLIDE.lg from the card toward the origin", () => {
    const timing = emanateTiming({ card: rect(300, 400), origin, bounds });
    expect(Math.hypot(timing.dx, timing.dy)).toBeCloseTo(SLIDE.lg);
    // The origin is up and to the left of this card.
    expect(timing.dx).toBeLessThan(0);
    expect(timing.dy).toBeLessThan(0);
    expect(timing.dy / timing.dx).toBeCloseTo(400 / 300);
  });

  it("clamps the distance fraction to [0, 1]", () => {
    // Far outside the sheet: no later than the farthest corner.
    const beyond = emanateTiming({ card: rect(4000, 3000), origin, bounds });
    expect(beyond.delay).toBe(EMANATE_LEAD_MS + EMANATE_SPREAD_MS);
    // A zero-size sheet under the origin: everything is at the lead.
    const flat = emanateTiming({
      card: rect(50, 50),
      origin,
      bounds: rect(0, 0),
    });
    expect(flat.delay).toBe(EMANATE_LEAD_MS);
  });
});

describe("emanate", () => {
  const node = document.createElement("div");

  afterEach(() => {
    delete document.documentElement.dataset.motionPreference;
  });

  it("behaves as arrive when there is no origin", () => {
    const config = emanate(node, { origin: () => null, bounds: () => bounds, index: 3 });
    const expected = arrive(node, { index: 3 });
    expect(config.delay).toBe(expected.delay);
    expect(config.duration).toBe(expected.duration);
    expect(config.css?.(0, 1)).toBe(expected.css?.(0, 1));
  });

  it("holds at the start for its delay, then settles in its slot", () => {
    const card = document.createElement("div");
    card.getBoundingClientRect = () => new DOMRect(300, 400, 0, 0);
    const config = emanate(card, { origin: () => origin, bounds: () => bounds });
    const { delay } = emanateTiming({ card: rect(300, 400), origin, bounds });
    const total = config.duration ?? 0;
    expect(config.delay ?? 0).toBe(0);
    expect(total).toBeCloseTo(delay + DURATION.emphasis);
    expect(config.css?.(delay / total, 1 - delay / total)).toMatch(/^opacity: 0;/);
    expect(config.css?.(1, 0)).toBe(
      "opacity: 1; transform: translate(0px, 0px) scale(1);"
    );
  });

  it("lands instantly under reduced motion", () => {
    document.documentElement.dataset.motionPreference = "reduce";
    expect(emanate(node, { origin: () => origin, bounds: () => bounds })).toEqual({
      delay: 0,
      duration: 0,
    });
  });
});
