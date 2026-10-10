import { describe, expect, it } from "vitest";
import { layoutBeatCarousel } from "#lib/shared/media-composition/services/beat-carousel-layout.js";

const rect = { x: 500, y: 1420, width: 580, height: 500 };
const layout = (position: number) =>
  layoutBeatCarousel({ rect, position, beatCount: 4 });

describe("breakdown beat carousel", () => {
  it("starts on the start pose with no landed or current tick", () => {
    const result = layout(0);
    const focus = result.cells.find((cell) => cell.isFocus);
    expect(focus?.beat).toBe("start");
    expect(focus?.x).toBeCloseTo(rect.x + rect.width * 0.4);
    expect(focus?.size).toBeCloseTo(result.focusSize);
    expect(result.ticks.map((tick) => tick.state)).toEqual([
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });

  it("holds a landed beat until the last 18 percent of its interval", () => {
    const early = layout(1.81);
    const sliding = layout(1.91);
    const landed = layout(2);
    const cell = (result: ReturnType<typeof layout>, index: number) =>
      result.cells.find((each) => each.cellIndex === index)!;
    expect(cell(early, 1).x).toBeCloseTo(rect.x + rect.width * 0.4);
    expect(cell(sliding, 1).x).toBeLessThan(cell(early, 1).x);
    expect(cell(landed, 2).x).toBeLessThan(cell(sliding, 2).x);
    expect(cell(landed, 2).x).toBeCloseTo(rect.x + rect.width * 0.4);
    expect(landed.cells.find((cell) => cell.isFocus)?.beat).toBe(2);
    expect(landed.ticks.map((tick) => tick.state)).toEqual([
      "landed",
      "current",
      "upcoming",
      "upcoming",
    ]);
  });

  it("moves continuously across the middle of a slide", () => {
    const before = layout(1.909);
    const after = layout(1.911);
    const x = (result: ReturnType<typeof layout>) =>
      result.cells.find((cell) => cell.cellIndex === 1)!.x;
    expect(Math.abs(x(after) - x(before))).toBeLessThan(10);
  });

  it("wraps the previous and next beats without repeating the start pose", () => {
    // Anchored further right, the previous beat sits wholly inside.
    const first = layoutBeatCarousel({
      rect,
      position: 1,
      beatCount: 4,
      anchor: 0.75,
    });
    expect(first.cells.find((cell) => cell.cellIndex === 0)?.beat).toBe(4);
    const wrapped = layout(5);
    expect(wrapped.cells.find((cell) => cell.isFocus)?.beat).toBe(1);
    expect(wrapped.ticks[0]?.state).toBe("current");
  });

  it("leaves no sliver of a card at the region's edge", () => {
    // At rest the previous beat would sit about 13% inside, a stray grey bar
    // against the animation.
    const rest = layout(1);
    expect(rest.cells.map((cell) => cell.cellIndex)).toEqual([1, 2]);
    // The next beat peeks past the right edge at full strength.
    const next = rest.cells.find((cell) => cell.cellIndex === 2)!;
    expect(next.x + next.size / 2).toBeGreaterThan(rect.x + rect.width);
    expect(next.opacity).toBeCloseTo(0.66);
  });

  it("fades cells at the edges as they slide instead of popping", () => {
    const opacities = (position: number) =>
      new Map(
        layout(position).cells.map((cell) => [cell.cellIndex, cell.opacity])
      );
    let previous = opacities(1.8);
    for (let step = 1; step <= 400; step += 1) {
      const current = opacities(1.8 + step * 0.0005);
      for (const index of new Set([...previous.keys(), ...current.keys()])) {
        const change = (current.get(index) ?? 0) - (previous.get(index) ?? 0);
        expect(Math.abs(change)).toBeLessThan(0.05);
      }
      previous = current;
    }
  });
});
