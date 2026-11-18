import { describe, expect, it } from "vitest";
import { ROW_LABEL_MIN_GAP, rowHasRoom } from "./row-label-fit";

const row = { left: 0, right: 600 };
const span = (left: number, right: number) => ({ left, right });

describe("rowHasRoom", () => {
  it("fits controls kept apart inside the row", () => {
    expect(
      rowHasRoom([span(18, 115), span(200, 300), span(400, 582)], row)
    ).toBe(true);
  });

  it("refuses an empty row", () => {
    expect(rowHasRoom([], row)).toBe(false);
  });

  it("refuses neighbours closer than the least gap, in any input order", () => {
    const tight = [
      span(300, 400),
      span(0, 100),
      span(100 + ROW_LABEL_MIN_GAP - 1, 200),
    ];
    expect(rowHasRoom(tight, row)).toBe(false);
    const exact = [
      span(300, 400),
      span(0, 100),
      span(100 + ROW_LABEL_MIN_GAP, 200),
    ];
    expect(rowHasRoom(exact, row)).toBe(true);
  });

  it("refuses overlapping and covered controls", () => {
    expect(rowHasRoom([span(0, 120), span(90, 200)], row)).toBe(false);
    expect(
      rowHasRoom([span(0, 300), span(100, 150), span(400, 500)], row)
    ).toBe(false);
  });

  it("refuses a control past either edge of the row", () => {
    expect(rowHasRoom([span(-2, 100), span(300, 400)], row)).toBe(false);
    expect(rowHasRoom([span(0, 100), span(500, 601)], row)).toBe(false);
  });

  it("ignores sub-pixel rounding", () => {
    expect(rowHasRoom([span(-0.4, 100), span(109.6, 600.4)], row)).toBe(true);
  });

  it("takes a different least gap", () => {
    expect(rowHasRoom([span(0, 100), span(100, 200)], row, 0)).toBe(true);
  });
});
