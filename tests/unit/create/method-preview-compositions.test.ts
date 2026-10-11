/**
 * Where each Create method preview scene puts its pieces, in box pixels, for
 * the bench's four boxes: strip 146×48, roomy strip 308×96, square 144×144,
 * and square 200×200.
 */
import { describe, expect, it } from "vitest";
import {
  assembleLayout,
  cellCenter,
  type CellRect,
  CONSTRUCT_CHOICE_COUNT,
  CONSTRUCT_MAX_SLOTS,
  constructChoiceCells,
  constructLayout,
  fuseLayout,
  generateLayout,
  previewGap,
  shapeCellRect,
  shapeLayout,
  tunnelLayout,
} from "#lib/features/create/shared/components/method-previews/method-preview-compositions.js";
import {
  DEMO_SEQUENCE,
  openingSteps,
  startPictograph,
} from "#lib/features/create/shared/components/method-previews/method-preview-demo.js";
import type { MethodPreviewShape } from "#lib/features/create/shared/components/method-previews/method-preview-layout.js";

const at = (x: number, y: number, size: number) => ({ x, y, size });

describe("preview gaps", () => {
  it("grows with the box from 3 to 8px", () => {
    expect(previewGap(146, 48)).toBe(3);
    expect(previewGap(308, 96)).toBe(5);
    expect(previewGap(144, 144)).toBe(7);
    expect(previewGap(200, 200)).toBe(8);
  });

  it("finds a cell's center", () => {
    expect(cellCenter(at(10, 4, 20))).toEqual({ x: 20, y: 14 });
  });
});

describe("Construct", () => {
  it("lines up the start and its steps in a strip", () => {
    expect(constructLayout("strip", 146, 48)).toEqual([
      at(1, 1, 46),
      at(50, 1, 46),
      at(99, 1, 46),
    ]);
    expect(constructLayout("roomy", 308, 96)).toEqual([
      at(0, 11, 73),
      at(78, 11, 73),
      at(156, 11, 73),
      at(234, 11, 73),
    ]);
  });

  it("wraps them two by two in a square", () => {
    expect(constructLayout("square", 144, 144)).toEqual([
      at(0, 0, 68),
      at(75, 0, 68),
      at(0, 75, 68),
      at(75, 75, 68),
    ]);
    expect(constructLayout("square", 200, 200)).toEqual([
      at(0, 0, 96),
      at(104, 0, 96),
      at(0, 104, 96),
      at(104, 104, 96),
    ]);
  });
});

describe("Construct choices", () => {
  it("sets three choices across the middle of a box", () => {
    expect(constructChoiceCells(at(0, 0, 68))).toEqual([
      at(1, 24, 20),
      at(24, 24, 20),
      at(47, 24, 20),
    ]);
    expect(constructChoiceCells(at(0, 11, 73))).toEqual([
      at(0, 36, 22),
      at(25, 36, 22),
      at(50, 36, 22),
    ]);
  });

  it("keeps every choice inside its box", () => {
    for (const box of constructLayout("square", 200, 200)) {
      const cells = constructChoiceCells(box);
      expect(cells).toHaveLength(CONSTRUCT_CHOICE_COUNT);
      for (const cell of cells) {
        expect(cell.x).toBeGreaterThanOrEqual(box.x);
        expect(cell.y).toBeGreaterThanOrEqual(box.y);
        expect(cell.x + cell.size).toBeLessThanOrEqual(box.x + box.size);
        expect(cell.y + cell.size).toBeLessThanOrEqual(box.y + box.size);
      }
    }
  });

  it("offers none in a box too small to split", () => {
    expect(constructChoiceCells(at(0, 0, 4))).toEqual([]);
  });
});

describe("Construct slot limit", () => {
  it("is the most slots any shape or box size lays out", () => {
    const shapes: MethodPreviewShape[] = ["strip", "roomy", "square"];
    let most = 0;
    for (const shape of shapes) {
      for (let width = 1; width <= 420; width += 7) {
        for (let height = 1; height <= 260; height += 5) {
          const count = constructLayout(shape, width, height).length;
          expect(count, `${shape} ${width}x${height}`).toBeLessThanOrEqual(
            CONSTRUCT_MAX_SLOTS
          );
          most = Math.max(most, count);
        }
      }
    }
    expect(most).toBe(CONSTRUCT_MAX_SLOTS);
  });

  it("is covered by the demo's start position and opening steps", () => {
    expect(startPictograph(DEMO_SEQUENCE)).not.toBeNull();
    expect(openingSteps(DEMO_SEQUENCE, CONSTRUCT_MAX_SLOTS - 1)).toHaveLength(
      CONSTRUCT_MAX_SLOTS - 1
    );
  });
});

describe("Generate", () => {
  it("puts the dice first in a strip", () => {
    expect(generateLayout("strip", 146, 48)).toEqual({
      dice: at(0, 7, 34),
      cells: [at(37, 7, 34), at(74, 7, 34), at(111, 7, 34)],
      columns: 4,
    });
    expect(generateLayout("roomy", 308, 96)).toEqual({
      dice: at(0, 11, 73),
      cells: [at(78, 11, 73), at(156, 11, 73), at(234, 11, 73)],
      columns: 4,
    });
  });

  it("uses a 3×3 grid only when its cells stay large", () => {
    expect(generateLayout("square", 144, 144)).toEqual({
      dice: at(0, 0, 68),
      cells: [at(75, 0, 68), at(0, 75, 68), at(75, 75, 68)],
      columns: 2,
    });
    const large = generateLayout("square", 200, 200)!;
    expect(large.columns).toBe(3);
    expect(large.dice).toEqual(at(0, 0, 61));
    expect(large.cells).toHaveLength(8);
    expect(large.cells[7]).toEqual(at(138, 138, 61));
  });
});

describe("Shape", () => {
  it("draws the chosen cell in place in a short strip", () => {
    const layout = shapeLayout("strip", 146, 48)!;
    expect(layout).toMatchObject({
      cell: 48,
      x: 1,
      y: 0,
      columns: 2,
      rows: 1,
      columnHeads: false,
      chosen: { row: 0, column: 1 },
      grows: false,
    });
    expect(layout.stage).toEqual(at(97, 0, 48));
  });

  it("grows the chosen cell into a stage beside a roomy corner", () => {
    const layout = shapeLayout("roomy", 308, 96)!;
    expect(layout).toMatchObject({
      cell: 32,
      x: 23,
      y: 0,
      columns: 4,
      rows: 2,
      columnHeads: true,
      chosen: { row: 0, column: 3 },
      grows: true,
    });
    expect(layout.stage).toEqual(at(188, 0, 96));
    expect(shapeCellRect(layout, 0, 3)).toEqual(at(151, 32, 32));
  });

  it("grows the chosen cell over the middle of a square corner", () => {
    const small = shapeLayout("square", 144, 144)!;
    expect(small).toMatchObject({ cell: 48, x: 0, y: 0, columns: 2, rows: 2 });
    expect(small.stage).toEqual(at(48, 48, 96));
    expect(shapeCellRect(small, 0, 1)).toEqual(at(96, 48, 48));
    const large = shapeLayout("square", 200, 200)!;
    expect(large).toMatchObject({ cell: 66, x: 1, y: 1 });
    expect(large.stage).toEqual(at(67, 67, 132));
    expect(shapeCellRect(large, 0, 1)).toEqual(at(133, 67, 66));
  });

  it("falls back to the square corner when a roomy strip is too narrow", () => {
    expect(shapeLayout("roomy", 153, 96)).toEqual({
      cell: 32,
      x: 28,
      y: 0,
      columns: 2,
      rows: 2,
      columnHeads: true,
      chosen: { row: 0, column: 1 },
      stage: at(60, 32, 64),
      grows: true,
    });
  });
});

describe("Fuse", () => {
  it("lines up two blue and two red sources, then two combined cells", () => {
    expect(fuseLayout("strip", 146, 48)).toEqual({
      blue: [at(0, 7, 34), at(37, 7, 34)],
      red: [at(74, 7, 34), at(111, 7, 34)],
      combined: [at(23, 0, 48), at(74, 0, 48)],
    });
    expect(fuseLayout("roomy", 308, 96)).toEqual({
      blue: [at(8, 13, 69), at(82, 13, 69)],
      red: [at(156, 13, 69), at(230, 13, 69)],
      combined: [at(55, 0, 96), at(156, 0, 96)],
    });
  });

  it("stacks blue over red in a square", () => {
    expect(fuseLayout("square", 144, 144)).toEqual({
      blue: [at(25, 0, 43), at(75, 0, 43)],
      red: [at(25, 101, 43), at(75, 101, 43)],
      combined: [at(0, 38, 68), at(75, 38, 68)],
    });
    expect(fuseLayout("square", 200, 200)).toEqual({
      blue: [at(35, 0, 61), at(104, 0, 61)],
      red: [at(35, 139, 61), at(104, 139, 61)],
      combined: [at(0, 52, 96), at(104, 52, 96)],
    });
  });
});

describe("Tunnel", () => {
  it("centers the tunnel in a strip with the dice beside it", () => {
    expect(tunnelLayout("strip", 146, 48)).toEqual({
      stage: at(38, 0, 48),
      dice: at(89, 14, 19),
    });
    expect(tunnelLayout("roomy", 308, 96)).toEqual({
      stage: at(89, 0, 96),
      dice: at(190, 34, 28),
    });
  });

  it("puts the dice in the corner of a square tunnel", () => {
    expect(tunnelLayout("square", 144, 144)).toEqual({
      stage: at(0, 0, 144),
      dice: at(112, 112, 26),
    });
    expect(tunnelLayout("square", 200, 200)).toEqual({
      stage: at(0, 0, 200),
      dice: at(164, 164, 28),
    });
  });
});

describe("Assemble", () => {
  it("puts the beats beside the grid in a strip", () => {
    expect(assembleLayout("strip", 146, 48)).toEqual({
      grid: at(8, 0, 48),
      beats: [at(62, 6, 36), at(101, 6, 36)],
    });
    expect(assembleLayout("roomy", 308, 96)).toEqual({
      grid: at(26, 0, 96),
      beats: [at(132, 12, 72), at(209, 12, 72)],
    });
  });

  it("puts the beats under the grid in a square", () => {
    expect(assembleLayout("square", 144, 144)).toEqual({
      grid: at(29, 0, 85),
      beats: [at(17, 92, 51), at(75, 92, 51)],
    });
    expect(assembleLayout("square", 200, 200)).toEqual({
      grid: at(40, 0, 120),
      beats: [at(24, 128, 72), at(104, 128, 72)],
    });
  });

  it("keeps the grid and both beats apart and inside any box", () => {
    const overlap = (a: CellRect, b: CellRect) =>
      a.x < b.x + b.size &&
      b.x < a.x + a.size &&
      a.y < b.y + b.size &&
      b.y < a.y + a.size;
    for (const shape of ["strip", "roomy", "square"] as const) {
      for (let width = 40; width <= 820; width += 13) {
        for (let height = 30; height <= 420; height += 11) {
          const layout = assembleLayout(shape, width, height);
          if (!layout) continue;
          const rects = [layout.grid, ...layout.beats];
          expect(layout.beats).toHaveLength(2);
          for (const rect of rects) {
            expect(rect.size).toBeGreaterThan(0);
            expect(rect.x).toBeGreaterThanOrEqual(0);
            expect(rect.y).toBeGreaterThanOrEqual(0);
            expect(rect.x + rect.size).toBeLessThanOrEqual(width);
            expect(rect.y + rect.size).toBeLessThanOrEqual(height);
          }
          expect(layout.beats[0]!.size).toBeLessThan(layout.grid.size);
          for (const [index, a] of rects.entries()) {
            for (const b of rects.slice(index + 1)) {
              expect(overlap(a, b)).toBe(false);
            }
          }
        }
      }
    }
  });
});

describe("an unsized box", () => {
  it("places nothing", () => {
    expect(constructLayout("strip", 0, 48)).toEqual([]);
    expect(generateLayout("strip", 0, 48)).toBeNull();
    expect(shapeLayout("square", 0, 10)).toBeNull();
    expect(fuseLayout("strip", 0, 48)).toBeNull();
    expect(tunnelLayout("strip", 0, 48)).toBeNull();
    expect(assembleLayout("strip", 0, 48)).toBeNull();
  });
});
