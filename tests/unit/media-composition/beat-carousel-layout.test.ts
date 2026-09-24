import { describe, expect, it } from "vitest";
import { layoutBeatCarousel } from "$lib/shared/media-composition/services/beat-carousel-layout";

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
    const beat1 = (result: ReturnType<typeof layout>) =>
      result.cells.find((cell) => cell.cellIndex === 1)!;
    expect(beat1(early).x).toBeCloseTo(rect.x + rect.width * 0.4);
    expect(beat1(sliding).x).toBeLessThan(beat1(early).x);
    expect(beat1(landed).x).toBeLessThan(beat1(sliding).x);
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
    const first = layout(1);
    expect(first.cells.find((cell) => cell.cellIndex === 0)?.beat).toBe(4);
    const wrapped = layout(5);
    expect(wrapped.cells.find((cell) => cell.isFocus)?.beat).toBe(1);
    expect(wrapped.ticks[0]?.state).toBe("current");
  });
});
