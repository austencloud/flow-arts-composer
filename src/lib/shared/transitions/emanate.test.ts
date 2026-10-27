import { afterEach, describe, expect, it } from "vitest";
import {
  EMANATE_ACROSS_MS,
  EMANATE_LEAD_MS,
  EMANATE_SPREAD_MS,
  EMANATE_WAVE_MS_PER_PX,
  emanate,
  emanateTiming,
  emanateWaveTiming,
  type EmanateIntro,
  type EmanateRect,
} from "./emanate";
import { arrive } from "./motion";
import { DURATION, SLIDE } from "./transitions";

const rect = (
  left: number,
  top: number,
  width = 0,
  height = 0
): EmanateRect => ({
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
    const timing = emanateTiming({
      card: rect(-10, -10, 20, 20),
      origin,
      bounds,
      stacked: false,
    });
    expect(timing.delay).toBe(EMANATE_LEAD_MS);
    expect(timing.dx).toBe(0);
    expect(timing.dy).toBe(0);
  });

  it("gives a card at the farthest corner the lead plus the spread", () => {
    const timing = emanateTiming({
      card: rect(400, 300),
      origin,
      bounds,
      stacked: false,
    });
    expect(timing.delay).toBeCloseTo(EMANATE_LEAD_MS + EMANATE_SPREAD_MS);
  });

  it("pushes SLIDE.lg from the card toward the origin", () => {
    const timing = emanateTiming({
      card: rect(300, 400),
      origin,
      bounds,
      stacked: false,
    });
    expect(Math.hypot(timing.dx, timing.dy)).toBeCloseTo(SLIDE.lg);
    // The origin is up and to the left of this card.
    expect(timing.dx).toBeLessThan(0);
    expect(timing.dy).toBeLessThan(0);
    expect(timing.dy / timing.dx).toBeCloseTo(400 / 300);
  });

  it("clamps the distance fraction to [0, 1]", () => {
    // Far outside the sheet: no later than the farthest corner.
    const beyond = emanateTiming({
      card: rect(4000, 3000),
      origin,
      bounds,
      stacked: false,
    });
    expect(beyond.delay).toBe(EMANATE_LEAD_MS + EMANATE_SPREAD_MS);
    // A zero-size sheet under the origin: everything is at the lead.
    const flat = emanateTiming({
      card: rect(50, 50),
      origin,
      bounds: rect(0, 0),
      stacked: false,
    });
    expect(flat.delay).toBe(EMANATE_LEAD_MS);
  });
});

describe("emanateTiming, stacked", () => {
  // The phone layout: a 400 by 300 sheet with the start cell centred 50 px
  // above its top edge, so the far edge (the bottom) is 350 px down.
  const above = rect(180, -70, 40, 40);

  it("gives every card in a row the same delay and a straight downward glide", () => {
    const left = emanateTiming({
      card: rect(10, 40, 80, 60),
      origin: above,
      bounds,
      stacked: true,
    });
    const right = emanateTiming({
      card: rect(310, 40, 80, 60),
      origin: above,
      bounds,
      stacked: true,
    });
    expect(left.delay).toBe(right.delay);
    expect(left).toMatchObject({ dx: 0, dy: -SLIDE.lg });
    expect(right).toMatchObject({ dx: 0, dy: -SLIDE.lg });
  });

  it("lands a lower row later", () => {
    const top = emanateTiming({
      card: rect(10, 40, 80, 60),
      origin: above,
      bounds,
      stacked: true,
    });
    const lower = emanateTiming({
      card: rect(10, 140, 80, 60),
      origin: above,
      bounds,
      stacked: true,
    });
    expect(lower.delay).toBeGreaterThan(top.delay);
  });

  it("gives the bottom edge the lead plus the spread", () => {
    const timing = emanateTiming({
      card: rect(0, 300),
      origin: above,
      bounds,
      stacked: true,
    });
    expect(timing.delay).toBeCloseTo(EMANATE_LEAD_MS + EMANATE_SPREAD_MS);
  });

  it("still runs in rows while the sheet's box covers the origin", () => {
    // The first pick after a page load: the cards mount while the sheet's box
    // is still the old full-height panel, so its top edge sits above the start
    // cell. Its sides and bottom edge are already final.
    const stale = rect(0, -120, 400, 420);
    const left = emanateTiming({
      card: rect(10, 40, 80, 60),
      origin: above,
      bounds: stale,
      stacked: true,
    });
    const right = emanateTiming({
      card: rect(310, 40, 80, 60),
      origin: above,
      bounds: stale,
      stacked: true,
    });
    expect(left).toMatchObject({ dx: 0, dy: -SLIDE.lg });
    expect(right.delay).toBe(left.delay);
    // The far edge is the bottom, as with the settled box.
    expect(left.delay).toBe(
      emanateTiming({
        card: rect(10, 40, 80, 60),
        origin: above,
        bounds,
        stacked: true,
      }).delay
    );
  });

  it("glides up from below when the origin is under the sheet", () => {
    const under = rect(180, 330, 40, 40);
    const timing = emanateTiming({
      card: rect(10, 40, 80, 60),
      origin: under,
      bounds,
      stacked: true,
    });
    expect(timing).toMatchObject({ dx: 0, dy: SLIDE.lg });
    // 280 px up from the origin over 350 px to the top edge.
    expect(timing.delay).toBeCloseTo(
      EMANATE_LEAD_MS + (280 / 350) * EMANATE_SPREAD_MS
    );
  });

  it("keeps the radial push side by side", () => {
    // The desktop layout: the start cell to the left, level with the sheet.
    const beside = rect(-100, 130, 40, 40);
    const timing = emanateTiming({
      card: rect(300, 0, 0, 0),
      origin: beside,
      bounds,
      stacked: false,
    });
    expect(Math.hypot(timing.dx, timing.dy)).toBeCloseTo(SLIDE.lg);
    expect(timing.dx).toBeLessThan(0);
    expect(timing.dy).toBeGreaterThan(0);
  });

  it("stays radial side by side while the sheet's box still spans the origin", () => {
    // The first pick after a page load on desktop: the cards mount while the
    // sheet's box is still the start picker's wide panel, which reaches left
    // past the start cell. The layout, not the box, says side by side.
    const beside = rect(-100, 130, 40, 40);
    const wide = rect(-300, 0, 700, 300);
    const timing = emanateTiming({
      card: rect(300, 0, 0, 0),
      origin: beside,
      bounds: wide,
      stacked: false,
    });
    expect(timing.dx).toBeLessThan(0);
    expect(timing.dy).toBeGreaterThan(0);
    expect(Math.hypot(timing.dx, timing.dy)).toBeCloseTo(SLIDE.lg);
  });
});

describe("emanateWaveTiming", () => {
  const sheet = rect(0, 100, 600, 900);
  const row = (top: number, left = 0, width = 600) =>
    rect(left, top, width, 40);

  it("starts a row at the sheet's top edge at once", () => {
    expect(
      emanateWaveTiming({ card: row(80), wave: { sheet, elapsed: 0 } })
    ).toEqual({
      delay: 0,
      dx: 0,
      dy: -SLIDE.lg,
    });
  });

  it("times each row by its distance down the sheet", () => {
    const first = emanateWaveTiming({
      card: row(100),
      wave: { sheet, elapsed: 0 },
    });
    const lower = emanateWaveTiming({
      card: row(180),
      wave: { sheet, elapsed: 0 },
    });
    expect(first.delay).toBe(20 * EMANATE_WAVE_MS_PER_PX);
    expect(lower.delay - first.delay).toBe(80 * EMANATE_WAVE_MS_PER_PX);
  });

  it("counts from the wave's start, not the element's mount", () => {
    const late = emanateWaveTiming({
      card: row(380),
      wave: { sheet, elapsed: 150 },
    });
    expect(late.delay).toBe(300 * EMANATE_WAVE_MS_PER_PX - 150);
    const past = emanateWaveTiming({
      card: row(140),
      wave: { sheet, elapsed: 400 },
    });
    expect(past.delay).toBe(0);
  });

  it("steps across a row only when asked", () => {
    const pill = (left: number) => row(80, left, 0);
    const wave = { sheet, elapsed: 0 };
    expect(emanateWaveTiming({ card: pill(0), wave, across: true }).delay).toBe(
      0
    );
    expect(
      emanateWaveTiming({ card: pill(600), wave, across: true }).delay
    ).toBe(EMANATE_ACROSS_MS);
    expect(emanateWaveTiming({ card: pill(600), wave }).delay).toBe(0);
  });
});

// The wave's intro is deferred; the others are immediate.
const resolve = (intro: EmanateIntro) =>
  typeof intro === "function" ? intro() : intro;

describe("emanate", () => {
  const node = document.createElement("div");

  afterEach(() => {
    delete document.documentElement.dataset.motionPreference;
  });

  it("behaves as arrive when there is no origin", () => {
    const config = resolve(
      emanate(node, { origin: () => null, bounds: () => bounds, index: 3 })
    );
    const expected = arrive(node, { index: 3 });
    expect(config.delay).toBe(expected.delay);
    expect(config.duration).toBe(expected.duration);
    expect(config.css?.(0, 1)).toBe(expected.css?.(0, 1));
  });

  it("holds at the start for its delay, then settles in its slot", () => {
    const card = document.createElement("div");
    card.getBoundingClientRect = () => new DOMRect(300, 400, 0, 0);
    const config = resolve(
      emanate(card, { origin: () => origin, bounds: () => bounds })
    );
    const { delay } = emanateTiming({
      card: rect(300, 400),
      origin,
      bounds,
      stacked: false,
    });
    const total = config.duration ?? 0;
    expect(config.delay ?? 0).toBe(0);
    expect(total).toBeCloseTo(delay + DURATION.emphasis);
    expect(config.css?.(delay / total, 1 - delay / total)).toMatch(
      /^opacity: 0;/
    );
    expect(config.css?.(1, 0)).toBe(
      "opacity: 1; transform: translate(0px, 0px) scale(1);"
    );
  });

  it("runs in rows when the layout is stacked", () => {
    const card = document.createElement("div");
    card.getBoundingClientRect = () => new DOMRect(310, 40, 80, 60);
    const config = resolve(
      emanate(card, {
        origin: () => rect(180, -70, 40, 40),
        bounds: () => bounds,
        stacked: () => true,
      })
    );
    const total = config.duration ?? 0;
    expect(config.css?.(0, 1)).toBe(
      `opacity: 0; transform: translate(0px, ${-SLIDE.lg}px) scale(0.96);`
    );
    expect(total).toBeGreaterThan(DURATION.emphasis);
  });

  it("reads a wave row's place once the mount has settled", () => {
    const card = document.createElement("div");
    let top = 400;
    card.getBoundingClientRect = () => new DOMRect(0, top, 80, 40);
    const intro = emanate(card, {
      stacked: () => true,
      wave: () => ({ sheet: rect(0, 100, 600, 900), elapsed: 0 }),
    });
    expect(typeof intro).toBe("function");
    // The section re-lays itself out before the paint: the card moves up a row.
    top = 300;
    const config = resolve(intro);
    expect(config.duration).toBeCloseTo(
      220 * EMANATE_WAVE_MS_PER_PX + DURATION.emphasis
    );
  });

  it("lands instantly under reduced motion", () => {
    document.documentElement.dataset.motionPreference = "reduce";
    expect(
      emanate(node, { origin: () => origin, bounds: () => bounds })
    ).toEqual({
      delay: 0,
      duration: 0,
    });
  });
});
