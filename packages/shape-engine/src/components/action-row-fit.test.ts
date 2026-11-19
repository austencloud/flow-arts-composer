import { describe, expect, it } from "vitest";
import {
  ACTION_ROW_MIN_EDGE,
  chooseActionRowRung,
  wordsFit,
  type ActionRowRung,
} from "./action-row-fit";

function ladder(fitsFrom: number) {
  const tried: ActionRowRung[] = [];
  const fitsAt = (rung: ActionRowRung) => {
    tried.push(rung);
    return rung >= fitsFrom;
  };
  return { fitsAt, tried };
}

describe("chooseActionRowRung", () => {
  it("takes the first rung where the words fit and tries no further", () => {
    const { fitsAt, tried } = ladder(3);
    expect(chooseActionRowRung(fitsAt, true)).toBe(3);
    expect(tried).toEqual([1, 2, 3]);
  });

  it("keeps rung 1 when it already fits", () => {
    expect(chooseActionRowRung(ladder(1).fitsAt, true)).toBe(1);
  });

  it("falls back to two rows of two when nothing else fits", () => {
    expect(chooseActionRowRung(() => false, true)).toBe(5);
  });

  it("never reaches two rows on the phone tier", () => {
    const { fitsAt, tried } = ladder(5);
    expect(chooseActionRowRung(fitsAt, false)).toBe(4);
    expect(tried).not.toContain(5);
  });
});

describe("wordsFit", () => {
  const button = { left: 100, right: 200 };

  it("wants the minimum edge on both sides", () => {
    const edge = ACTION_ROW_MIN_EDGE;
    expect(wordsFit({ left: 100 + edge, right: 200 - edge }, button)).toBe(
      true
    );
    expect(wordsFit({ left: 100 + edge - 2, right: 200 - edge }, button)).toBe(
      false
    );
    expect(wordsFit({ left: 100 + edge, right: 200 - edge + 2 }, button)).toBe(
      false
    );
  });
});
