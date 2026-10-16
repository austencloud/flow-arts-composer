import { describe, expect, it } from "vitest";
import {
  CODEX_BOXES,
  CODEX_TYPES,
} from "../../../src/routes/(public)/atlas/_components/codex-boards/codex-letters";
import {
  SHEET1,
  SHEET2,
} from "../../../src/routes/(public)/codex/_data/codex-groups";

describe("Letter Codex Atlas semantics", () => {
  it("keeps both accents for combined motion families", () => {
    const type1 = CODEX_TYPES.find((type) => type.n === 1)!;
    const type5 = CODEX_TYPES.find((type) => type.n === 5)!;

    expect(type1.segs.map((segment) => segment.c)).toEqual([
      "#22b8cf",
      "#7048b6",
    ]);
    expect(type5.segs.map((segment) => segment.c)).toEqual([
      "#22b8cf",
      "#2f9e44",
    ]);
  });

  it("moves flat-board position captions into the shared box header only", () => {
    const compactBoxes = CODEX_BOXES.filter((box) => box.type.n >= 4);

    expect(compactBoxes).toHaveLength(9);
    expect(compactBoxes.every(({ box }) => Boolean(box.header))).toBe(true);
    expect(
      compactBoxes.every(({ box }) => box.cells.every((cell) => !cell.top))
    ).toBe(true);

    const printTypes = [...SHEET1.types, ...SHEET2.types].filter(
      (type) => type.n >= 4
    );
    expect(
      printTypes.every((type) =>
        type.boxes.every((box) => box.cells.every((cell) => Boolean(cell.top)))
      )
    ).toBe(true);
  });
});
