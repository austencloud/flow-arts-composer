import { describe, it, expect } from "vitest";
import { planSheet, type SheetPage } from "#lib/features/write/services/sheet-row-planner.js";
import { DEFAULT_SHEET_LAYOUT } from "#lib/features/write/domain/types/choreo-sheet.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

// minimal StepData stub — the planner only reads identity/length, not pictograph fields
function step(n: number): StepData {
  return { stepNumber: n, duration: 1, leftReversal: false, rightReversal: false, isBlank: false } as StepData;
}
function seq(id: string, count: number): SequenceData {
  return { id, steps: Array.from({ length: count }, (_, i) => step(i + 1)) } as unknown as SequenceData;
}
function flatCells(pages: SheetPage[]) {
  return pages.flatMap((p) => p.rows.flatMap((r) => r.cells));
}

const layout = DEFAULT_SHEET_LAYOUT; // 8 cols, 6 rows/page

describe("planSheet (continuous flow)", () => {
  it("returns no pages for no sequences", () => {
    expect(planSheet([], layout)).toEqual([]);
  });

  it("an 8-count fills one row, no blanks, all one owner", () => {
    const pages = planSheet([seq("a", 8)], layout);
    expect(pages).toHaveLength(1);
    expect(pages[0].rows).toHaveLength(1);
    const cells = pages[0].rows[0].cells;
    expect(cells).toHaveLength(8);
    expect(cells.every((c) => !c.isBlank)).toBe(true);
    expect(cells.every((c) => c.sequenceId === "a")).toBe(true);
    expect(cells[0].isSequenceStart).toBe(true);
  });

  it("pads only the final row to 8 with unowned blank cells", () => {
    const cells = planSheet([seq("a", 5)], layout)[0].rows[0].cells;
    expect(cells.filter((c) => !c.isBlank)).toHaveLength(5);
    const blanks = cells.filter((c) => c.isBlank);
    expect(blanks).toHaveLength(3);
    expect(blanks.every((c) => c.sequenceId === null && !c.isSequenceStart)).toBe(true);
  });

  it("marks only the first cell of each sequence as a sequence start", () => {
    const all = flatCells(planSheet([seq("a", 16)], layout));
    expect(all).toHaveLength(16);
    expect(all.filter((c) => c.isSequenceStart)).toHaveLength(1);
    expect(all[0].isSequenceStart).toBe(true);
    expect(all.every((c) => c.sequenceId === "a")).toBe(true);
  });

  it("continues the next sequence in the very next cell, mid-row (no fresh row)", () => {
    const pages = planSheet([seq("a", 12), seq("b", 8)], layout);
    const cells = flatCells(pages);
    // 12 + 8 = 20 real cells, padded to 24 → 3 rows, one page.
    expect(pages).toHaveLength(1);
    expect(pages[0].rows).toHaveLength(3);
    expect(cells.slice(0, 12).every((c) => c.sequenceId === "a")).toBe(true);
    expect(cells[12].sequenceId).toBe("b");
    expect(cells[12].isSequenceStart).toBe(true);
    // Cell 12 lands in row 1 col 4 — seq b starts mid-row, right after seq a's tail.
    expect(pages[0].rows[1].cells[3].sequenceId).toBe("a");
    expect(pages[0].rows[1].cells[4].sequenceId).toBe("b");
    expect(pages[0].rows[1].cells[4].isSequenceStart).toBe(true);
  });

  it("paginates at 6 rows per landscape page", () => {
    const pages = planSheet(Array.from({ length: 7 }, (_, i) => seq(`s${i}`, 8)), layout);
    expect(pages).toHaveLength(2);
    expect(pages[0].rows).toHaveLength(6);
    expect(pages[1].rows).toHaveLength(1);
  });

  it("fits eight compact rows on one portrait page", () => {
    const pages = planSheet(
      Array.from({ length: 8 }, (_, i) => seq(`s${i}`, 8)),
      { ...layout, orientation: "portrait" },
    );

    expect(pages).toHaveLength(1);
    expect(pages[0].rows).toHaveLength(8);
  });
});
