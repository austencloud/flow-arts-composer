import { describe, it, expect } from "vitest";
import { findEmptyCellForQR } from "$lib/shared/render/services/cell-border-renderer";
import { calculateLayout } from "$lib/shared/render/services/layout-calculator";

// Regression: one-count cards (a single beat + start position) have no spare
// cell. In row mode the QR heuristic returned { col: columns - 1, row: 0 },
// which for columns === 1 IS the start-placement cell — so the QR painted over
// the start (gallery showed a QR and no start). One-count cards must never
// resolve a QR cell, in any layout mode.
describe("findEmptyCellForQR — one-count cards", () => {
  const oneStep = { steps: [{ letter: "A" }], startPlacement: {} } as any;

  it("returns null for a one-count card in row mode (no cell to steal from start)", () => {
    const [columns, rows] = calculateLayout(1, true, "row"); // [1, 2]
    expect(columns).toBe(1);
    const cell = findEmptyCellForQR(columns, rows, oneStep, {
      includeStartPlacement: true,
      startPlacementLayout: "row",
    });
    expect(cell).toBeNull();
  });

  it("returns null for a one-count card in column mode", () => {
    const [columns, rows] = calculateLayout(1, true, "column"); // [2, 1]
    const cell = findEmptyCellForQR(columns, rows, oneStep, {
      includeStartPlacement: true,
      startPlacementLayout: "column",
    });
    expect(cell).toBeNull();
  });

  it("returns null for a one-count card with no start position", () => {
    const [columns, rows] = calculateLayout(1, false, "row");
    const cell = findEmptyCellForQR(columns, rows, { steps: [{ letter: "A" }] } as any, {
      includeStartPlacement: false,
    });
    expect(cell).toBeNull();
  });

  it("still resolves a QR cell for a multi-count card (control) and never the start cell", () => {
    const fourSteps = {
      steps: [{ letter: "A" }, { letter: "B" }, { letter: "C" }, { letter: "D" }],
      startPlacement: {},
    } as any;
    const [columns, rows] = calculateLayout(4, true, "row");
    const cell = findEmptyCellForQR(columns, rows, fourSteps, {
      includeStartPlacement: true,
      startPlacementLayout: "row",
    });
    expect(cell).not.toBeNull();
    // The start position renders at (0, 0); the QR must never land on it.
    expect(cell).not.toEqual({ col: 0, row: 0 });
  });
});
