import { describe, expect, it } from "vitest";

import { fitWordLabel, type WordLabelFitInput } from "./word-label-fit";

// Widths as the label measures them at a 24px font: letters 14-30px, a 3px
// gap, a 20px ellipsis, a 16px chevron with its margin, 26px of padding.
function input(overrides: Partial<WordLabelFitInput> = {}): WordLabelFitInput {
  return {
    unitWidths: [20, 20, 20, 20, 20],
    gap: 3,
    ellipsisWidth: 20,
    trailingWidth: 16,
    fixedWidth: 26,
    available: 400,
    minScale: 0.5,
    ...overrides,
  };
}

// The rendered width of a decision, the same way the label lays it out.
function renderedWidth(
  fit: ReturnType<typeof fitWordLabel>,
  params: WordLabelFitInput
): number {
  const shown = params.unitWidths.slice(0, fit.visibleCount);
  const withEllipsis = fit.truncated || params.endsInEllipsis === true;
  const items = shown.length + (withEllipsis ? 1 : 0) + 1;
  const row =
    shown.reduce((sum, width) => sum + width, 0) +
    (withEllipsis ? params.ellipsisWidth : 0) +
    params.trailingWidth +
    params.gap * (items - 1);
  return params.fixedWidth + fit.scale * row;
}

describe("fitWordLabel", () => {
  it("shows the whole word at normal size when it fits", () => {
    const params = input();
    // 100 letters + 16 chevron + 5 gaps of 3 + 26 padding = 157
    expect(fitWordLabel({ ...params, available: 157 })).toEqual({
      scale: 1,
      visibleCount: 5,
      truncated: false,
    });
  });

  it("shrinks to the exact scale that fits while it is above the floor", () => {
    const params = input({ available: 26 + 131 * 0.8 });
    const fit = fitWordLabel(params);
    expect(fit.truncated).toBe(false);
    expect(fit.visibleCount).toBe(5);
    expect(fit.scale).toBeCloseTo(0.8, 2);
    expect(fit.scale).toBeLessThanOrEqual(0.8);
    expect(renderedWidth(fit, params)).toBeLessThanOrEqual(params.available);
  });

  it("holds the floor and cuts to the most letters that fit with the ellipsis", () => {
    // At 0.5: two letters + ellipsis + chevron + 3 gaps = 85 -> 42.5 + 26.
    // Three letters would be 108 -> 54 + 26 = 80.
    const params = input({ available: 70 });
    const fit = fitWordLabel(params);
    expect(fit).toEqual({ scale: 0.5, visibleCount: 2, truncated: true });
    expect(renderedWidth(fit, params)).toBeLessThanOrEqual(70);
    expect(renderedWidth({ ...fit, visibleCount: 3 }, params)).toBeGreaterThan(
      70
    );
  });

  it("keeps at least one letter when even one does not fit", () => {
    const fit = fitWordLabel(input({ available: 30 }));
    expect(fit.visibleCount).toBe(1);
    expect(fit.truncated).toBe(true);
  });

  it("never ends a cut word on a group dot", () => {
    // Units: A B · C D, where the dot is unit 2. Room for three units would
    // leave "A B ·...", so the cut stops at "A B...".
    const params = input({
      unitWidths: [20, 20, 6, 20, 20],
      separators: [false, false, true, false, false],
    });
    const atThree = 26 + 0.5 * (46 + 20 + 16 + 3 * 4);
    const fit = fitWordLabel({ ...params, available: atThree + 1 });
    expect(fit.truncated).toBe(true);
    expect(fit.visibleCount).toBe(2);
  });

  it("does not count a second ellipsis for a word that already ends in one", () => {
    const params = input({ endsInEllipsis: true });
    // The whole row already carries the ellipsis: 100 + 20 + 16 + 6 gaps.
    const full = 26 + 100 + 20 + 16 + 18;
    expect(fitWordLabel({ ...params, available: full })).toEqual({
      scale: 1,
      visibleCount: 5,
      truncated: false,
    });
    const cut = fitWordLabel({ ...params, available: 70 });
    expect(cut.truncated).toBe(true);
    expect(renderedWidth(cut, params)).toBeLessThanOrEqual(70);
  });

  it("returns the whole word at scale 1 for unmeasured input", () => {
    const whole = { scale: 1, visibleCount: 5, truncated: false };
    expect(fitWordLabel(input({ available: 0 }))).toEqual(whole);
    expect(fitWordLabel(input({ available: Number.NaN }))).toEqual(whole);
    expect(fitWordLabel(input({ unitWidths: [20, 0, 20, 20, 20] }))).toEqual(
      whole
    );
    expect(
      fitWordLabel(input({ unitWidths: [20, Number.NaN, 20, 20, 20] }))
    ).toEqual(whole);
    expect(fitWordLabel(input({ unitWidths: [] }))).toEqual({
      scale: 1,
      visibleCount: 0,
      truncated: false,
    });
  });

  it("never exceeds the room whenever one letter and the ellipsis fit", () => {
    const words = [
      [14, 30, 22, 18, 26, 30, 14, 24, 20, 28, 16, 30],
      [30, 30, 30],
      [14],
      [18, 6, 24, 30, 6, 14, 22, 26, 18],
    ];
    for (const unitWidths of words) {
      for (const minScale of [0.4, 0.5, 0.75, 1]) {
        for (const endsInEllipsis of [false, true]) {
          for (let available = 40; available <= 400; available += 1) {
            const params = input({
              unitWidths,
              minScale,
              endsInEllipsis,
              separators: unitWidths.map((width) => width === 6),
            });
            params.available = available;
            const fit = fitWordLabel(params);
            expect(fit.scale).toBeGreaterThan(0);
            expect(fit.scale).toBeLessThanOrEqual(1);
            expect(fit.scale).toBeGreaterThanOrEqual(minScale);
            expect(fit.visibleCount).toBeGreaterThanOrEqual(1);
            expect(fit.visibleCount).toBeLessThanOrEqual(unitWidths.length);
            const oneFits =
              params.fixedWidth +
                minScale *
                  (unitWidths[0]! +
                    params.ellipsisWidth +
                    params.trailingWidth +
                    params.gap * 2) <=
              available;
            if (oneFits) {
              expect(renderedWidth(fit, params)).toBeLessThanOrEqual(available);
            }
          }
        }
      }
    }
  });
});
