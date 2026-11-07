import { describe, expect, it } from "vitest";
import { fitTimelineRows, TIMELINE_FIT_MIN_UNIT } from "./grid-calculations";

const steps = (count: number) =>
  Array.from({ length: count }, () => ({ duration: 1 }));

// The installed app on the unfolded Fold: a 707px workspace and a 327px
// grid host under the 260px Generate panel, with the 16px edge reserve.
const FOLD = {
  sizingWidth: 707 - 32,
  containerHeight: 327,
  popReserve: 16,
  hasStart: true,
  isNarrow: false,
};

describe("fitTimelineRows", () => {
  it("shrinks a 16-step sequence to show all four rows on the unfolded Fold", () => {
    const fit = fitTimelineRows({ ...FOLD, steps: steps(16), beatsPerRow: 4 });
    expect(fit?.beatsPerRow).toBe(4);
    expect(fit?.rows).toHaveLength(4);
    // Four rows, three 1px gaps, 8px padding and the pop reserve fit 327px.
    expect(4 * fit!.unitSize + 3 + 8 + 32).toBeLessThanOrEqual(327);
    expect(fit!.unitSize).toBeGreaterThanOrEqual(TIMELINE_FIT_MIN_UNIT);
  });

  it("puts eight to a row when a wide, short host makes the cells larger", () => {
    const fit = fitTimelineRows({
      ...FOLD,
      sizingWidth: 1400,
      containerHeight: 360,
      steps: steps(16),
      beatsPerRow: 4,
    });
    expect(fit?.beatsPerRow).toBe(8);
    expect(fit?.rows).toHaveLength(2);
  });

  it("never doubles the rows on a narrow phone", () => {
    const fit = fitTimelineRows({
      ...FOLD,
      sizingWidth: 412 - 32,
      containerHeight: 600,
      isNarrow: true,
      steps: steps(16),
      beatsPerRow: 4,
    });
    expect(fit?.beatsPerRow).toBe(4);
  });

  it("gives up below the fit floor so the grid keeps legible cells and scrolls", () => {
    const fit = fitTimelineRows({
      ...FOLD,
      sizingWidth: 412 - 32,
      containerHeight: 200,
      isNarrow: true,
      steps: steps(32),
      beatsPerRow: 4,
    });
    expect(fit).toBeNull();
  });

  describe("shrinkToFit, the save view's card on a 375px phone", () => {
    // The band left above the save form once the room under it has shrunk.
    const PHONE_SAVE_CARD = {
      sizingWidth: 375 - 32,
      containerHeight: 130,
      popReserve: 16,
      hasStart: true,
      isNarrow: true,
      shrinkToFit: true,
    };

    it.each([8, 16, 24, 32, 64])(
      "shows all %i steps without scrolling",
      (count) => {
        const fit = fitTimelineRows({
          ...PHONE_SAVE_CARD,
          steps: steps(count),
          beatsPerRow: 4,
        });
        expect(fit).not.toBeNull();
        const { rows, unitSize, beatsPerRow } = fit!;
        expect(rows.length * beatsPerRow).toBeGreaterThanOrEqual(count);
        // Rows, their 1px gaps, 8px padding and the pop reserve fit the height.
        expect(
          rows.length * unitSize + (rows.length - 1) + 8 + 32
        ).toBeLessThanOrEqual(130);
        // A row of cells plus the start column fits the width.
        expect((beatsPerRow + 1) * unitSize + beatsPerRow).toBeLessThanOrEqual(
          343
        );
      }
    );
  });

  it("keeps a sequence that already fits at its width-based size", () => {
    const fit = fitTimelineRows({
      ...FOLD,
      containerHeight: 900,
      steps: steps(8),
      beatsPerRow: 4,
    });
    expect(fit?.beatsPerRow).toBe(4);
    expect(fit?.rows).toHaveLength(2);
    expect(fit!.unitSize).toBeGreaterThan(94);
  });
});
