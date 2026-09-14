import { describe, expect, it, vi } from "vitest";
import {
  createChoreoCardRenderEngine,
  type ChoreoCardRenderModel,
  type ChoreoCardRenderDeps,
} from "$lib/shared/choreo-card/services/choreo-card-render-engine";
import { renderCell } from "$lib/shared/sequence-viewer/services/preview-cell-renderer";
import { TRANSITION_REVIEW_SEQUENCE } from "../../src/routes/test/sequence-viewer-transitions/transition-review-fixture";

vi.mock("$lib/shared/sequence-viewer/services/preview-cell-renderer", () => ({
  renderCell: vi.fn(),
  deleteCellCache: vi.fn(),
}));
vi.mock("$lib/shared/render/services/pictograph-blob-cache", () => ({
  pictographBlobCache: {
    get: vi.fn(() => {
      throw new Error("Live cards must not read bitmap caches");
    }),
  },
}));
vi.mock(
  "$lib/shared/choreo-card/services/choreo-card-cell-pipeline",
  async (original) => ({
    ...(await original<object>()),
    getPreviewCacheKey: vi.fn(() => {
      throw new Error("Live cards must not use bitmap previews");
    }),
  })
);

function setup() {
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
    livePictographs: true,
    sequence: TRANSITION_REVIEW_SEQUENCE,
    renderOptions: { size: 240 },
    leftPropType: undefined,
    rightPropType: undefined,
    browseViewMode: undefined,
    showStepNumbers: true,
    includeStartPosition: true,
    startPositionLayout: "column",
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
    getSoloLocationLabel: String,
    onRenderProgress: vi.fn(),
    onRenderSettled: vi.fn(),
  };
  const sizing = {
    containedWidth: 500,
    cellWidth: 100,
    updateCellWidth: vi.fn(),
    setCellWidthSuppressed: vi.fn(),
    setFlipSuppressed: vi.fn(),
  };
  const crossfader = { setActiveDarkMode: vi.fn() } as unknown as Parameters<
    typeof createChoreoCardRenderEngine
  >[3];
  let current = deps;
  return {
    model,
    deps,
    setDeps: (next: ChoreoCardRenderDeps) => {
      current = next;
    },
    engine: createChoreoCardRenderEngine(
      model,
      () => current,
      sizing,
      crossfader
    ),
  };
}

describe("live card rendering lifecycle", () => {
  it("bypasses bitmap caches on mount, visual changes, and relayout", async () => {
    const { engine, model } = setup();
    expect(engine.adoptCachedPreview()).toBe(false);
    await engine.renderAllCells();
    expect(model.cells).toHaveLength(9);
    expect(model.cells.every((cell) => cell.live && !cell.imageUrl)).toBe(true);
    await engine.transitionCellImages();
    engine.relayoutCells();
    expect(renderCell).not.toHaveBeenCalled();
    engine.dispose();
  });
  it("ignores readiness from a replaced sequence or a destroyed card", async () => {
    const { engine, model, deps, setDeps } = setup();
    await engine.renderAllCells();
    const stale = model.cells[1]!.live!.onSettled;
    setDeps({
      ...deps,
      sequence: { ...deps.sequence, steps: deps.sequence.steps.slice(0, 2) },
    });
    await engine.renderAllCells();
    stale(false);
    expect(model.cells[1]!.isLoaded).toBe(false);
    const current = model.cells[1]!.live!.onSettled;
    current(false);
    expect(model.cells[1]!.isLoaded).toBe(true);
    engine.dispose();
    current(false);
    expect(model.cells).toEqual([]);
  });
  it("keeps widened duration geometry and excludes hidden start cells from progress", async () => {
    const { engine, model, deps, setDeps } = setup();
    setDeps({
      ...deps,
      includeStartPosition: false,
      effectiveColumns: 2,
      sequence: {
        ...deps.sequence,
        steps: deps.sequence.steps
          .slice(0, 2)
          .map((step, index) => ({ ...step, duration: index === 0 ? 2 : 1 })),
      },
    });
    await engine.renderAllCells();
    expect(model.hasMixedDurations).toBe(true);
    expect(model.cells[1]!.live!.options.widthMultiplier).toBe(2);
    expect(model.cells[2]!.live!.options.widthMultiplier).toBe(1);
    model.cells[1]!.live!.onSettled(false);
    model.cells[2]!.live!.onSettled(false);
    expect(deps.onRenderProgress).toHaveBeenLastCalledWith(2, 2);
    engine.dispose();
  });
});
