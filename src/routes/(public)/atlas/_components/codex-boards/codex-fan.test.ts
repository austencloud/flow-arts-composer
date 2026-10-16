import { describe, expect, it } from "vitest";
import {
  deckDelays,
  deckDepths,
  deckOffset,
  deckTilt,
  summarizeFrames,
} from "./codex-fan";

describe("codex fan", () => {
  it("puts a card's picture exactly over the clicked cell", () => {
    const card = { x: 400, y: 200, width: 120, height: 120 };
    const picture = { x: 410, y: 210, width: 100, height: 100 };
    const origin = { x: 50, y: 60, width: 50, height: 50 };
    const { x, y, scale } = deckOffset(card, picture, origin);
    expect(scale).toBe(0.5);
    // The card scales about its centre, then moves by (x, y).
    const centre = { x: 460, y: 260 };
    const pictureCentre = {
      x: centre.x + scale * (460 - centre.x) + x,
      y: centre.y + scale * (260 - centre.y) + y,
    };
    expect(pictureCentre).toEqual({ x: 75, y: 85 });
  });

  it("deals the clicked card from the top and the rest in grid order", () => {
    expect(deckDepths(5, 2)).toEqual([1, 2, 0, 3, 4]);
    expect(deckDepths(3, 9)).toEqual([0, 1, 2]);
    expect(deckTilt(0)).toBe(0);
    expect(Math.abs(deckTilt(30))).toBe(7);
    expect(Math.sign(deckTilt(1))).not.toBe(Math.sign(deckTilt(2)));
  });

  it("deals every card within the spread", () => {
    expect(deckDelays([1, 0, 2])).toEqual([32, 0, 64]);
    const many = deckDelays(Array.from({ length: 16 }, (_, i) => i));
    expect(Math.max(...many)).toBe(240);
  });

  it("counts frames slower than one and a half 60Hz frames", () => {
    const stats = summarizeFrames([16.7, 16.6, 33.4, 16.7]);
    expect(stats).toMatchObject({ frames: 4, longFrames: 1, worstMs: 33.4 });
    expect(stats.fps).toBeCloseTo(48, 0);
    expect(summarizeFrames([]).fps).toBe(0);
  });
});
