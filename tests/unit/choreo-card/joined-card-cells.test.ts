/**
 * A choreo card whose grids join draws image cells, every one (the start cell
 * included) set to the sequence's one join. A card on one grid hands its cells
 * over untouched, so the images it cached before joins existed still match.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createChoreoCardRenderEngine,
  type ChoreoCardRenderModel,
  type ChoreoCardRenderDeps,
} from "$lib/shared/choreo-card/services/choreo-card-render-engine";
import { globalPreviewCache } from "$lib/shared/choreo-card/services/choreo-card-cell-pipeline";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { pictographBlobCache } from "$lib/shared/render/services/pictograph-blob-cache";
import { renderCell } from "$lib/shared/sequence-viewer/services/preview-cell-renderer";
import { TRANSITION_REVIEW_SEQUENCE } from "../../../src/routes/test/sequence-viewer-transitions/transition-review-fixture";

vi.mock("$lib/shared/sequence-viewer/services/preview-cell-renderer", () => ({
  renderCell: vi.fn(
    async (_data: unknown, stepNumber?: number) =>
      `mock:cell-${stepNumber ?? "start"}`
  ),
  deleteCellCache: vi.fn(),
}));
// Every cell misses the image cache, so the card draws each one.
vi.mock("$lib/shared/render/services/pictograph-blob-cache", () => ({
  pictographBlobCache: { get: vi.fn(async () => null) },
}));

const EAST_1 = { toward: "e", steps: 1 } as const;
const SOUTH_2 = { toward: "s", steps: 2 } as const;
const ONE_GRID = TRANSITION_REVIEW_SEQUENCE;

/** The review card joined east. */
const JOINED: SequenceData = { ...ONE_GRID, conjoined: EAST_1 };

/**
 * Steps carrying a join of their own, which a sequence no longer has: step 2
 * says one grid and step 3 says south. They must change nothing about a card.
 */
function withStrayStepJoins(sequence: SequenceData): SequenceData {
  return {
    ...sequence,
    steps: sequence.steps.map((step, index) =>
      index === 1
        ? ({ ...step, conjoined: null } as typeof step)
        : index === 2
          ? ({ ...step, conjoined: SOUTH_2 } as typeof step)
          : step
    ),
  };
}

function setup(overrides: Partial<ChoreoCardRenderDeps>) {
  const model: ChoreoCardRenderModel = {
    cells: [],
    columns: 0,
    rows: 0,
    isLoading: true,
    isRefreshing: false,
    hasMixedDurations: false,
    durationRows: [],
    durationColCount: 0,
  };
  const deps: ChoreoCardRenderDeps = {
    livePictographs: false,
    sequence: ONE_GRID,
    renderOptions: { size: 240 },
    leftPropType: undefined,
    rightPropType: undefined,
    browseViewMode: undefined,
    showStepNumbers: true,
    includeStartPlacement: true,
    startPlacementLayout: "column",
    mandalaLayoutOverride: null,
    effectiveColumns: 5,
    effectiveRows: 2,
    layoutWidthUnits: 5,
    columnCount: 4,
    darkMode: false,
    showQRCode: false,
    cloudProbeEnabled: false,
    isBrowseSoloMode: false,
    isMotionSoloMode: false,
    useDurationLayout: false,
    getSoloLocationLabel: String,
    onRenderProgress: vi.fn(),
    onRenderSettled: vi.fn(),
    ...overrides,
  };
  const sizing = {
    containedWidth: 500,
    cellWidth: 100,
    updateCellWidth: vi.fn(),
    setCellWidthSuppressed: vi.fn(),
    setFlipSuppressed: vi.fn(),
  };
  const crossfader = {
    setActiveDarkMode: vi.fn(),
    flushPendingCrossfade: vi.fn(),
  } as unknown as Parameters<typeof createChoreoCardRenderEngine>[3];
  let current = deps;
  return {
    model,
    setDeps: (next: Partial<ChoreoCardRenderDeps>) => {
      current = { ...current, ...next };
    },
    engine: createChoreoCardRenderEngine(
      model,
      () => current,
      sizing,
      crossfader
    ),
  };
}

/** The picture each drawn cell was given, by step number ("start" first). */
function drawnCells() {
  return new Map(
    vi
      .mocked(renderCell)
      .mock.calls.map(([data, stepNumber]) => [stepNumber ?? "start", data])
  );
}

/** The image-cache keys the card looked its cells up under, in cell order. */
function lookedUpKeys(): string[] {
  return vi.mocked(pictographBlobCache.get).mock.calls.map(([key]) => key);
}

beforeEach(() => {
  vi.clearAllMocks();
  globalPreviewCache.clear();
});

describe("a joined card's image cells", () => {
  it("all draw with the sequence's one join, the start cell included", async () => {
    const { engine, model } = setup({ sequence: JOINED });
    await engine.renderAllCells();

    const joins = [...drawnCells()].map(([cell, data]) => [
      cell,
      data.conjoined,
    ]);
    expect(joins).toEqual([
      ["start", EAST_1],
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((step) => [step, EAST_1]),
    ]);
    expect(model.cells).toHaveLength(9);
    expect(
      model.cells.every(
        (cell) => !cell.live && cell.imageUrl.startsWith("mock:")
      )
    ).toBe(true);
    engine.dispose();
  });

  it("ignore a join a step carries on its own", async () => {
    const { engine } = setup({ sequence: withStrayStepJoins(JOINED) });
    await engine.renderAllCells();

    for (const [, data] of drawnCells()) {
      expect(data.conjoined).toEqual(EAST_1);
    }
    engine.dispose();
  });

  it("look every cell up under a joined image, none under its one-grid image", async () => {
    const plain = setup({});
    await plain.engine.renderAllCells();
    const oneGridKeys = lookedUpKeys();
    plain.engine.dispose();
    vi.clearAllMocks();

    const joined = setup({ sequence: JOINED });
    await joined.engine.renderAllCells();
    const joinedKeys = lookedUpKeys();
    joined.engine.dispose();
    vi.clearAllMocks();
    globalPreviewCache.clear();

    const stray = setup({ sequence: withStrayStepJoins(JOINED) });
    await stray.engine.renderAllCells();
    const strayKeys = lookedUpKeys();
    stray.engine.dispose();

    expect(joinedKeys).toHaveLength(oneGridKeys.length);
    joinedKeys.forEach((key, cell) => {
      expect(key).not.toBe(oneGridKeys[cell]);
    });
    // A join a step carries on its own does not change what the card looks up.
    expect(strayKeys).toEqual(joinedKeys);
  });
});

describe("a one-grid card's image cells", () => {
  it("are its own pictures, untouched", async () => {
    const { engine } = setup({});
    await engine.renderAllCells();

    const cells = drawnCells();
    expect(cells.get("start")).toBe(ONE_GRID.startPlacement);
    ONE_GRID.steps.forEach((step, index) => {
      expect(cells.get(index + 1)).toBe(step);
    });
    engine.dispose();
  });

  it("drop a join a step carries on its own", async () => {
    const { engine } = setup({ sequence: withStrayStepJoins(ONE_GRID) });
    await engine.renderAllCells();

    for (const [, data] of drawnCells()) {
      expect("conjoined" in data).toBe(false);
    }
    engine.dispose();
  });
});

describe("switching a card's grids", () => {
  it("redraws live cells as joined images, and back", async () => {
    const { engine, model, setDeps } = setup({ livePictographs: true });
    await engine.renderAllCells();
    expect(model.cells.every((cell) => cell.live)).toBe(true);

    setDeps({ livePictographs: false, sequence: JOINED });
    await engine.transitionCellImages("swap");
    expect(renderCell).toHaveBeenCalledTimes(9);
    expect(drawnCells().get(1)?.conjoined).toEqual(EAST_1);
    expect(model.cells.some((cell) => cell.live)).toBe(false);

    setDeps({ livePictographs: true, sequence: ONE_GRID });
    await engine.transitionCellImages("swap");
    expect(model.cells.every((cell) => cell.live)).toBe(true);
    expect(model.cells[1]!.live!.data).toBe(ONE_GRID.steps[0]);
    engine.dispose();
  });
});
