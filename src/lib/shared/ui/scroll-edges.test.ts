import { describe, expect, it } from "vitest";
import { measureScrollEdges } from "./scroll-edges";

function scroller(scrollLeft: number, scrollWidth: number, clientWidth = 300) {
  return { scrollLeft, scrollWidth, clientWidth } as HTMLElement;
}

describe("measureScrollEdges", () => {
  it("reports no hidden end when everything fits", () => {
    expect(measureScrollEdges(scroller(0, 300))).toEqual({
      start: false,
      end: false,
    });
  });

  it("reports only the end at the start of a long row", () => {
    expect(measureScrollEdges(scroller(0, 900))).toEqual({
      start: false,
      end: true,
    });
  });

  it("reports both ends in the middle", () => {
    expect(measureScrollEdges(scroller(250, 900))).toEqual({
      start: true,
      end: true,
    });
  });

  it("reports only the start at the end, despite a fractional scroll", () => {
    expect(measureScrollEdges(scroller(599.5, 900))).toEqual({
      start: true,
      end: false,
    });
  });
});
