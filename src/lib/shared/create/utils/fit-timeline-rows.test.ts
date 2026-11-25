import { describe, expect, it } from "vitest";
import {
  calculateTimelineRowsByBeatCount,
  calculateTimelineUnitSize,
  calculateWorkbenchTimelineRows,
  clampTimelineUnitSizeToHeight,
  fitTimelineRows,
  TIMELINE_FIT_MIN_UNIT,
  TIMELINE_TOUCH_FLOOR,
  timelineRowUnits,
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

  describe("a long step on a narrow phone", () => {
    const durations = (...d: number[]) => d.map((duration) => ({ duration }));

    // StepGrid's two paths: the fit when one is found, otherwise workbench
    // rows at the width-based size, clamped to the height with the 94px floor.
    const layOut = (
      seq: { duration: number }[],
      host: { sizingWidth: number; containerHeight: number },
      beatsPerRow = 4
    ) => {
      const common = { ...host, popReserve: 16, hasStart: true, isNarrow: true };
      const fit = fitTimelineRows({ ...common, steps: seq, beatsPerRow });
      if (fit) return { rows: fit.rows, unit: fit.unitSize };
      const rows = calculateWorkbenchTimelineRows({
        ...common,
        steps: seq,
        beatsPerRow,
      });
      const widthBased = calculateTimelineUnitSize(
        host.sizingWidth,
        timelineRowUnits(rows, true)
      );
      const unit = clampTimelineUnitSizeToHeight(
        widthBased,
        host.containerHeight,
        Math.max(rows.length, 1),
        16,
        94
      );
      return { rows, unit };
    };

    // Measured on 5173: a 360 x 640 phone in Construct gives a 358px host,
    // 155px tall with the step editor open; the 387 x 775 visitor phone a
    // 215px host; the Fold's cover screen is 344 wide.
    const PHONES = [
      { name: "360 x 640", sizingWidth: 358 - 32, containerHeight: 155 },
      { name: "387 x 775", sizingWidth: 385 - 32, containerHeight: 215 },
      { name: "344 x 760", sizingWidth: 342 - 32, containerHeight: 230 },
    ];
    const SEQUENCES = [
      [4],
      [2, 1],
      [3, 1],
      [4, 1],
      [4, 1, 1, 1],
      [1, 1, 4, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 4],
      [1.5, 1.5, 1.5, 1.5, 1.5, 1.5],
    ];

    it.each(PHONES)("never draws a row wider than the $name phone", (host) => {
      for (const d of SEQUENCES) {
        const { rows, unit } = layOut(durations(...d), host);
        const units = timelineRowUnits(rows, true);
        expect(
          units * unit + (units - 1),
          `durations ${d}`
        ).toBeLessThanOrEqual(host.sizingWidth);
        // Up to 4x every cell stays at least the touch floor.
        expect(unit, `durations ${d}`).toBeGreaterThanOrEqual(
          TIMELINE_TOUCH_FLOOR
        );
      }
    });

    it("keeps Start, a 4x step and a 1x step on one row at 360 wide", () => {
      // Wren's case: the 4x step was drawn 426px wide and step 2 sat off screen.
      const { rows, unit } = layOut(durations(4, 1), PHONES[0]!);
      expect(rows).toHaveLength(1);
      expect((1 + 4 + 1) * unit + 2).toBeLessThanOrEqual(326);
    });

    it("gives a long step its own row when four to a row would go under the touch floor", () => {
      const rows = calculateWorkbenchTimelineRows({
        steps: durations(1, 1, 4, 1, 1, 1, 1, 1),
        beatsPerRow: 4,
        hasStart: true,
        sizingWidth: 326,
        isNarrow: true,
      });
      expect(rows.map((row) => row.steps.map((s) => s.stepIndex))).toEqual([
        [0, 1],
        [2],
        [3, 4, 5, 6],
        [7],
      ]);
    });

    it("leaves one-beat sequences, and wide hosts, in their beat rows", () => {
      const ones = steps(9);
      expect(
        calculateWorkbenchTimelineRows({
          steps: ones,
          beatsPerRow: 4,
          hasStart: true,
          sizingWidth: 326,
          isNarrow: true,
        })
      ).toEqual(calculateTimelineRowsByBeatCount(ones, 4));
      const long = durations(1, 1, 4, 1, 1, 1, 1, 1);
      expect(
        calculateWorkbenchTimelineRows({
          steps: long,
          beatsPerRow: 4,
          hasStart: true,
          sizingWidth: 1200,
          isNarrow: false,
        })
      ).toEqual(calculateTimelineRowsByBeatCount(long, 4));
    });
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

  describe("with a LOOP's repetitions", () => {
    const indices = (rows: { steps: { stepIndex: number }[] }[]) =>
      rows.map((row) => row.steps.map((step) => step.stepIndex));

    it("gives each repetition its own row", () => {
      const fit = fitTimelineRows({
        ...FOLD,
        containerHeight: 900,
        steps: steps(6),
        beatsPerRow: 4,
        partLength: 3,
      });
      expect(indices(fit!.rows)).toEqual([
        [0, 1, 2],
        [3, 4, 5],
      ]);
      expect(fit!.rows.map((row) => row.rowIndex)).toEqual([0, 1]);
    });

    it("never lets one row hold two repetitions when a repetition wraps", () => {
      expect(
        indices(
          calculateWorkbenchTimelineRows({
            steps: steps(10),
            beatsPerRow: 4,
            hasStart: true,
            sizingWidth: 1200,
            isNarrow: false,
            partLength: 5,
          })
        )
      ).toEqual([[0, 1, 2, 3], [4], [5, 6, 7, 8], [9]]);
    });

    it("keeps repetitions apart when a phone packs rows by time", () => {
      const held = [
        { duration: 4 },
        { duration: 1 },
        { duration: 4 },
        { duration: 1 },
      ];
      expect(
        indices(
          calculateWorkbenchTimelineRows({
            steps: held,
            beatsPerRow: 4,
            hasStart: true,
            sizingWidth: 240,
            isNarrow: true,
            partLength: 2,
          })
        )
      ).toEqual([[0], [1], [2], [3]]);
    });
  });
});
