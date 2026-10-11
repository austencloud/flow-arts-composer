import { describe, expect, it } from "vitest";
import {
  gridCellsToComposition,
  compositionToGridState,
} from "#lib/features/compose/tabs/arrange/services/arrange-composition-converter.js";
import { TrailMode } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import { validateArrangementSnapshot } from "#lib/shared/media-composition/domain/arrangement.js";
import type { GridCell } from "#lib/features/compose/tabs/arrange/state/arrange-grid-state.svelte.js";

function cells(): GridCell[] {
  return Array.from({ length: 64 }, (_, index) => ({
    id: `cell-${Math.floor(index / 8)}-${index % 8}`,
    row: Math.floor(index / 8),
    col: index % 8,
    layers: [],
    beatOffset: 0,
    colSpan: 1,
    rowSpan: 1,
    mediaType: "animation",
  }));
}

describe("Arrange composition persistence", () => {
  it("stores the editor's look fields as a v2 appearance and reads them back", () => {
    const original = cells();
    original[0] = {
      ...original[0]!,
      layers: [
        {
          sequence: {
            id: "one",
            steps: [],
            createdAt: new Date("2026-01-01"),
            optionalMetadata: undefined,
          } as never,
          beatOffset: 3,
          propColors: { left: "#123456", right: "#abcdef" },
          transformStack: [{ type: "rotate90", hand: "both", timestamp: 1 }],
        },
        {
          sequence: { id: "two", steps: [] } as never,
          beatOffset: -2,
          propColors: { left: "#654321", right: "#fedcba" },
          transformStack: [],
        },
      ],
      beatOffset: 2,
      colSpan: 2,
      speedMultiplier: 1.5,
      effect: "fire",
      trailMode: TrailMode.PERSISTENT,
      effort: "glide",
      leftMotionVisible: false,
      rightMotionVisible: true,
      mediaType: "viewer-3d",
    };
    const snapshot = {
      cells: original,
      gridRows: 2,
      gridCols: 3,
      bpm: 96,
      skipStartPlacement: false,
    };
    const saved = gridCellsToComposition("id", "test", snapshot);
    expect(saved.arrangement?.schemaVersion).toBe(2);
    const savedCell = saved.arrangement?.cells[0];
    expect(savedCell).not.toHaveProperty("effect");
    expect(savedCell).not.toHaveProperty("trailMode");
    expect(savedCell).not.toHaveProperty("effort");
    expect(savedCell?.appearance).toMatchObject({
      effortPreset: "glide",
      effects: { activeEffect: "fire", tipEffectMap: { "*": { effect: "fire" } } },
      trail: { enabled: false, settings: { mode: TrailMode.PERSISTENT } },
    });
    expect(saved.arrangement?.cells.slice(1)).toEqual(original.slice(1));

    const loaded = compositionToGridState(saved);
    expect(loaded).toMatchObject({
      gridRows: 2,
      gridCols: 3,
      bpm: 96,
      skipStartPlacement: false,
    });
    expect(loaded.cells[0]).toMatchObject({
      effect: "fire",
      trailMode: TrailMode.PERSISTENT,
      effort: "glide",
      beatOffset: 2,
      colSpan: 2,
      speedMultiplier: 1.5,
      leftMotionVisible: false,
      rightMotionVisible: true,
      mediaType: "viewer-3d",
    });
    expect(loaded.cells[0]?.layers).toEqual(original[0]!.layers);
    expect(loaded.cells.slice(1)).toEqual(original.slice(1));

    original[0]!.beatOffset = 99;
    expect(saved.arrangement?.cells[0]?.beatOffset).toBe(2);
  });

  it("round-trips a saved arrangement without growing it", () => {
    const original = cells();
    original[5] = { ...original[5]!, effect: "led", effort: "punch" };
    const once = gridCellsToComposition("id", "test", {
      cells: original,
      gridRows: 1,
      gridCols: 8,
      bpm: 100,
      skipStartPlacement: true,
    });
    const twice = gridCellsToComposition("id", "test", {
      ...compositionToGridState(once),
    });
    expect(twice.arrangement).toEqual(once.arrangement);
  });

  it("drops an effort the appearance schema does not know", () => {
    const original = cells();
    original[0] = { ...original[0]!, effect: "led", effort: "high" };
    const saved = gridCellsToComposition("id", "test", {
      cells: original,
      gridRows: 1,
      gridCols: 1,
      bpm: 96,
      skipStartPlacement: false,
    });
    expect(saved.arrangement?.cells[0]?.appearance?.effects?.activeEffect).toBe(
      "led"
    );
    expect(saved.arrangement?.cells[0]?.appearance).not.toHaveProperty(
      "effortPreset"
    );
    expect(compositionToGridState(saved).cells[0]).not.toHaveProperty("effort");
  });

  it("loads older compositions without a versioned snapshot", () => {
    const saved = gridCellsToComposition("id", "test", {
      cells: cells(),
      gridRows: 2,
      gridCols: 2,
      bpm: 96,
      skipStartPlacement: false,
    });
    delete saved.arrangement;
    expect(compositionToGridState(saved)).toMatchObject({
      gridRows: 2,
      gridCols: 2,
      bpm: 120,
      skipStartPlacement: true,
    });
  });

  it("rejects snapshots with unsupported versions or invalid grid geometry", () => {
    const base = {
      cells: cells(),
      gridRows: 2,
      gridCols: 2,
      bpm: 96,
      skipStartPlacement: false,
    };
    expect(validateArrangementSnapshot({ ...base, schemaVersion: 2 }).schemaVersion).toBe(2);
    expect(() =>
      validateArrangementSnapshot({ ...base, schemaVersion: 3 })
    ).toThrow();
    expect(() =>
      validateArrangementSnapshot({ ...base, schemaVersion: 2, gridRows: 9 })
    ).toThrow();
  });
});
