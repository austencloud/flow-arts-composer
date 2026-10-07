import { describe, it, expect } from "vitest";
import type { GridJoin } from "@tka/tka-types";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { cellRasterKey, joinedCellStep } from "./sheet-cell-raster";
import { buildBands, planSheet } from "./sheet-row-planner";
import { getSheetPageLayout } from "../domain/sheet-page-layout";
import { DEFAULT_SHEET_LAYOUT } from "../domain/types/choreo-sheet";

const join: GridJoin = { toward: "e", steps: 1 };
const step = { letter: "A", gridMode: "diamond", motions: {} } as StepData;

function seq(id: string, conjoined?: GridJoin): SequenceData {
  return { id, steps: [step, step], ...(conjoined && { conjoined }) } as never;
}

describe("joinedCellStep", () => {
  it("stamps the cell's join on a copy of the step", () => {
    const out = joinedCellStep({ step, join });
    expect(out).toEqual({ ...step, conjoined: join });
    expect(step).not.toHaveProperty("conjoined");
  });

  it("gives back the same step for a one-grid cell, null for a blank", () => {
    expect(joinedCellStep({ step, join: null })).toBe(step);
    expect(joinedCellStep({ step: null, join })).toBeNull();
  });
});

describe("cellRasterKey", () => {
  const key = (s: object) =>
    cellRasterKey(s as StepData, PropType.STAFF, PropType.STAFF, null);

  it("keeps a joined cell apart from the same step on one grid", () => {
    expect(key({ ...step, conjoined: join })).not.toBe(key(step));
  });

  it("is unchanged for one grid and shared by identical joined cells", () => {
    expect(key(step)).toBe(key({ ...step }));
    expect(key({ ...step, conjoined: join })).toBe(
      key({ ...step, conjoined: { ...join } })
    );
  });

  it("tells joins apart", () => {
    expect(key({ ...step, conjoined: { toward: "w", steps: 1 } })).not.toBe(
      key({ ...step, conjoined: join })
    );
  });
});

describe("sheet planner carries each sequence's join", () => {
  const layout = { ...DEFAULT_SHEET_LAYOUT, columns: 4 };

  it("puts the join on every cell of a joined sequence only", () => {
    const pages = planSheet([seq("a", join), seq("b")], layout);
    const cells = pages.flatMap((p) => p.rows.flatMap((r) => r.cells));
    const real = cells.filter((c) => !c.isBlank);
    expect(real.filter((c) => c.sequenceId === "a").map((c) => c.join)).toEqual(
      [join, join]
    );
    expect(real.filter((c) => c.sequenceId === "b").map((c) => c.join)).toEqual(
      [null, null]
    );
    expect(cells.filter((c) => c.isBlank).every((c) => c.join === null)).toBe(
      true
    );
  });

  it("does the same through the band planner", () => {
    const bands = buildBands({
      sequences: [seq("a", join), seq("b")],
      geo: getSheetPageLayout(layout),
      cues: [],
      notes: [],
    });
    const joins = (id: string) =>
      bands
        .filter((b) => b.sequenceId === id)
        .flatMap((b) => b.cells.map((c) => c.join));
    expect(joins("a")).toEqual([join, join]);
    expect(joins("b")).toEqual([null, null]);
  });
});
