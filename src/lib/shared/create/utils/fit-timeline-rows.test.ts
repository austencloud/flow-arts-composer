import { describe, expect, it } from "vitest";
import {
  fitTimelineRows,
  TIMELINE_FIT_MIN_UNIT,
} from "./grid-calculations";

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
