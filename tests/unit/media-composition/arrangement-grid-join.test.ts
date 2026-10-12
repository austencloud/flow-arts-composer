import { describe, expect, it } from "vitest";
import type {
  ArrangementCell,
  ArrangementSnapshot,
} from "#lib/shared/media-composition/domain/arrangement.js";
import { validateArrangementSnapshot } from "#lib/shared/media-composition/domain/arrangement.js";
import {
  arrangementCellFollowsSequence,
  arrangementCellGridJoin,
  arrangementCellSequence,
} from "#lib/shared/media-composition/domain/arrangement-grid-join.js";
import {
  clearCell,
  createArrangementCell,
  setCellGridJoin,
} from "#lib/shared/media-composition/domain/arrangement-edits.js";
import { createArrangementProject } from "#lib/shared/media-composition/domain/post-arrangement-item.js";
import { setArrangementCellGridJoin } from "#lib/shared/media-composition/domain/post-project-edits.js";
import { editContext } from "#lib/shared/post-studio-plugin/index.js";

const NOW = 1_700_000_000_000;
const EAST = { toward: "e", steps: 1 } as const;
const NORTH_TWO = { toward: "n", steps: 2 } as const;

function layer(
  id: string,
  conjoined?: unknown
): ArrangementCell["layers"][number] {
  return {
    sequence: {
      id,
      steps: [{}, {}, {}, {}],
      ...(conjoined !== undefined ? { conjoined } : {}),
    },
    beatOffset: 0,
    propColors: { left: "#3575e2", right: "#ed1c24" },
    transformStack: [],
  } as unknown as ArrangementCell["layers"][number];
}

function cell(partial: Partial<ArrangementCell> = {}): ArrangementCell {
  return { ...createArrangementCell(0, 0), ...partial };
}

/** An 8×8 backing grid showing 1×2; the first cell holds a north-joined sequence unless told otherwise. */
function grid(first: Partial<ArrangementCell> = {}): ArrangementSnapshot {
  const cells: ArrangementCell[] = [];
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++)
      cells.push(createArrangementCell(row, col));
  cells[0] = cell({ layers: [layer("a", NORTH_TWO)], ...first });
  return {
    schemaVersion: 2,
    cells,
    gridRows: 1,
    gridCols: 2,
    bpm: 120,
    skipStartPlacement: true,
  };
}

describe("arrangementCellGridJoin", () => {
  it("follows the first sequence when the cell says nothing", () => {
    expect(
      arrangementCellGridJoin(cell({ layers: [layer("a", NORTH_TWO)] }))
    ).toEqual(NORTH_TWO);
    expect(arrangementCellGridJoin(cell({ layers: [layer("a")] }))).toBeNull();
    expect(arrangementCellGridJoin(cell())).toBeNull();
  });

  it("draws one grid for null and the cell's own pair for a join", () => {
    expect(
      arrangementCellGridJoin(
        cell({ layers: [layer("a", NORTH_TWO)], gridJoin: null })
      )
    ).toBeNull();
    expect(
      arrangementCellGridJoin(
        cell({ layers: [layer("a", NORTH_TWO)], gridJoin: EAST })
      )
    ).toEqual(EAST);
  });

  it("treats a malformed stored value as following the sequence", () => {
    const broken = cell({
      layers: [layer("a", NORTH_TWO)],
      gridJoin: {
        toward: "up",
        steps: 7,
      } as unknown as ArrangementCell["gridJoin"],
    });
    expect(arrangementCellGridJoin(broken)).toEqual(NORTH_TWO);
    expect(arrangementCellFollowsSequence(broken)).toBe(false);
  });

  it("says whether the cell follows its sequence", () => {
    expect(arrangementCellFollowsSequence(cell())).toBe(true);
    expect(arrangementCellFollowsSequence(cell({ gridJoin: null }))).toBe(
      false
    );
    expect(arrangementCellFollowsSequence(cell({ gridJoin: EAST }))).toBe(
      false
    );
  });
});

describe("arrangementCellSequence", () => {
  it("returns the identical sequence object when nothing changes", () => {
    const plain = cell({ layers: [layer("a")] });
    expect(arrangementCellSequence(plain)).toBe(plain.layers[0]!.sequence);
    const joined = cell({ layers: [layer("a", EAST)] });
    expect(arrangementCellSequence(joined)).toBe(joined.layers[0]!.sequence);
    const matching = cell({ layers: [layer("a", EAST)], gridJoin: EAST });
    expect(arrangementCellSequence(matching)).toBe(
      matching.layers[0]!.sequence
    );
    expect(arrangementCellSequence(cell())).toBeNull();
  });

  it("rewrites the sequence's join to the cell's and leaves the layer alone", () => {
    const own = cell({ layers: [layer("a", NORTH_TWO)], gridJoin: EAST });
    const drawn = arrangementCellSequence(own)!;
    expect(drawn).not.toBe(own.layers[0]!.sequence);
    expect(drawn.conjoined).toEqual(EAST);
    expect(own.layers[0]!.sequence.conjoined).toEqual(NORTH_TWO);
    const source = layer("a", NORTH_TWO);
    const single = arrangementCellSequence(
      cell({ layers: [source], gridJoin: null })
    )!;
    expect(single).not.toHaveProperty("conjoined");
    expect(single.steps).toBe(source.sequence.steps);
  });
});

describe("the schema", () => {
  it("round-trips a join, a null and no field", () => {
    expect(
      validateArrangementSnapshot(grid({ gridJoin: EAST })).cells[0]!.gridJoin
    ).toEqual(EAST);
    expect(
      validateArrangementSnapshot(grid({ gridJoin: null })).cells[0]!.gridJoin
    ).toBeNull();
    expect(validateArrangementSnapshot(grid()).cells[0]).not.toHaveProperty(
      "gridJoin"
    );
  });

  it("keeps a malformed value for the resolver instead of rejecting the arrangement", () => {
    const stored = grid({
      gridJoin: "sideways" as unknown as ArrangementCell["gridJoin"],
    });
    const parsed = validateArrangementSnapshot(stored);
    expect(parsed.cells[0]!.gridJoin).toBe("sideways");
    expect(arrangementCellGridJoin(parsed.cells[0]!)).toEqual(NORTH_TWO);
  });
});

describe("setCellGridJoin", () => {
  it("stores a join, one grid, or removes the field to follow the sequence", () => {
    const start = grid();
    const joined = setCellGridJoin(start, "cell-0-0", EAST);
    expect(joined.cells[0]!.gridJoin).toEqual(EAST);
    expect(joined.cells[1]).toBe(start.cells[1]);
    const single = setCellGridJoin(joined, "cell-0-0", null);
    expect(single.cells[0]!.gridJoin).toBeNull();
    const following = setCellGridJoin(single, "cell-0-0", undefined);
    expect(following.cells[0]).not.toHaveProperty("gridJoin");
    expect(following.cells[0]!.layers).toBe(start.cells[0]!.layers);
  });

  it("returns the same snapshot for an equal value, a missing cell, and undefined over undefined", () => {
    const own = grid({ gridJoin: EAST });
    expect(setCellGridJoin(own, "cell-0-0", { toward: "e", steps: 1 })).toBe(
      own
    );
    expect(setCellGridJoin(own, "cell-9-9", null)).toBe(own);
    const plain = grid();
    expect(setCellGridJoin(plain, "cell-0-0", undefined)).toBe(plain);
    const single = grid({ gridJoin: null });
    expect(setCellGridJoin(single, "cell-0-0", null)).toBe(single);
    expect(setCellGridJoin(single, "cell-0-0", undefined)).not.toBe(single);
  });

  it("is dropped by clearCell with the layers and the offset", () => {
    const cleared = clearCell(
      grid({ gridJoin: EAST, beatOffset: 2 }),
      "cell-0-0"
    );
    expect(cleared.cells[0]).not.toHaveProperty("gridJoin");
    expect(cleared.cells[0]!.layers).toEqual([]);
    expect(cleared.cells[0]!.beatOffset).toBe(0);
    const onlyJoin = grid({ layers: [], gridJoin: null });
    expect(clearCell(onlyJoin, "cell-0-0").cells[0]).not.toHaveProperty(
      "gridJoin"
    );
    const empty = grid({ layers: [] });
    expect(clearCell(empty, "cell-0-0")).toBe(empty);
  });

  it("goes through the project as one edit and skips an equal value", () => {
    const project = createArrangementProject(grid(), "seq", NOW);
    const itemId = project.tracks[0]!.items[0]!.id;
    const next = setArrangementCellGridJoin(
      project,
      itemId,
      "cell-0-0",
      EAST,
      editContext(NOW + 1000)
    );
    const item = next.tracks[0]!.items[0]!;
    expect(item.kind).toBe("arrangement");
    expect(
      item.kind === "arrangement" ? item.snapshot.cells[0]!.gridJoin : null
    ).toEqual(EAST);
    expect(
      setArrangementCellGridJoin(
        next,
        itemId,
        "cell-0-0",
        EAST,
        editContext(NOW + 2000)
      )
    ).toBe(next);
  });
});
