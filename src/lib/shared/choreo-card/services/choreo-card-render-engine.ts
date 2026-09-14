import { tick } from "svelte";
import type { BrowseViewMode } from "$lib/shared/browse/domain/browse-view-mode";
import {
  calculateTimelineRowsByBeatCount,
  type TimelineRow,
} from "$lib/shared/create/utils/grid-calculations";
import { createStartPositionFromBeatStart } from "$lib/shared/create/services/sequence-transforms";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { pictographBlobCache } from "$lib/shared/render/services/pictograph-blob-cache";
import {
  markScan,
  markScanAfterPaint,
  reportScanToStable,
} from "$lib/shared/analytics/scan-perf";
import {
  calculateGridPosition,
  detectMixedDurations,
  getPreviewCacheKey,
  globalPreviewCache,
  storePreviewInCache,
} from "$lib/shared/choreo-card/services/choreo-card-cell-pipeline";
import type { createCrossfaderState } from "$lib/shared/choreo-card/state/crossfader-state.svelte";
import { deriveCacheKey } from "$lib/shared/sequence-viewer/services/cell-cache-key-deriver";
import {
  deleteCellCache,
  renderCell,
  type PreviewCellRenderOptions,
} from "$lib/shared/sequence-viewer/services/preview-cell-renderer";
import { compositeStepNumberOnBlob } from "$lib/shared/sequence-viewer/services/step-number-compositor";

export interface ChoreoCardCell {
  index: number;
  label: string;
  imageUrl: string;
  isLoaded: boolean;
  renderFailed?: boolean;
  gridColumn: number;
  gridRow: number;
  duration: number;
  fadeOutUrl?: string;
  live?: {
    data: PictographData;
    options: PreviewCellRenderOptions;
    epoch: number;
    onSettled: (failed: boolean) => void;
  };
}

export interface ChoreoCardRenderModel {
  cells: ChoreoCardCell[];
  columns: number;
  rows: number;
  isLoading: boolean;
  isRefreshing: boolean;
  hasMixedDurations: boolean;
  durationRows: TimelineRow[];
  durationColCount: number;
}

interface MandalaLayoutOverride {
  cols: number;
  rows: number;
  startPos: { col: number; row: number };
  qrPos: { col: number; row: number };
  stepPositions: { col: number; row: number }[];
}

interface RenderSizingPort {
  readonly containedWidth: number | null;
  readonly cellWidth: number;
  updateCellWidth(): void;
  setCellWidthSuppressed(suppressed: boolean): void;
  setFlipSuppressed(suppressed: boolean): void;
}

export interface ChoreoCardRenderDeps {
  readonly livePictographs?: boolean;
  readonly sequence: SequenceData;
  readonly renderOptions: PreviewCellRenderOptions;
  readonly leftPropType: PropType | undefined;
  readonly rightPropType: PropType | undefined;
  readonly browseViewMode: BrowseViewMode | undefined;
  readonly showStepNumbers: boolean;
  readonly includeStartPosition: boolean;
  readonly startPositionLayout: "row" | "column";
  readonly mandalaLayoutOverride: MandalaLayoutOverride | null;
  readonly effectiveColumns: number;
  readonly effectiveRows: number;
  readonly layoutWidthUnits: number;
  readonly columnCount: number | null;
  readonly darkMode: boolean;
  readonly showQRCode: boolean;
  readonly cloudProbeEnabled: boolean;
  readonly isBrowseSoloMode: boolean;
  readonly isMotionSoloMode: boolean;
  readonly getSoloLocationLabel: (stepIndex: number) => string;
  readonly onRenderProgress:
    | ((loaded: number, total: number) => void)
    | undefined;
  readonly onRenderSettled: () => void;
}

interface CellTask {
  cellIndex: number;
  data: PictographData;
  stepNumber: number | undefined;
  options: PreviewCellRenderOptions;
  cacheKey: string;
}

/**
 * Runs the card's cache-first cell pipeline and transition-safe image swaps.
 * The caller owns reactive inputs; this engine owns async scheduling, queued
 * rerenders, cache writes, and blob URL lifetimes.
 */
export function createChoreoCardRenderEngine(
  model: ChoreoCardRenderModel,
  getDeps: () => ChoreoCardRenderDeps,
  sizing: RenderSizingPort,
  crossfader: ReturnType<typeof createCrossfaderState>
) {
  let liveEpoch = 0;
  let liveGeneration = 0;
  let disposed = false;
  let isRendering = false;
  let renderQueued = false;
  let refreshDelayTimer: ReturnType<typeof setTimeout> | null = null;
  const refreshDelayMs = 200;

  function beginRefresh(): void {
    if (refreshDelayTimer !== null) return;
    refreshDelayTimer = setTimeout(() => {
      refreshDelayTimer = null;
      model.isRefreshing = true;
    }, refreshDelayMs);
  }

  function endRefresh(): void {
    if (refreshDelayTimer !== null) {
      clearTimeout(refreshDelayTimer);
      refreshDelayTimer = null;
    }
    model.isRefreshing = false;
  }

  function gridPosition(
    stepIndex: number,
    columns: number
  ): { gridColumn: number; gridRow: number } {
    const deps = getDeps();
    return calculateGridPosition(
      stepIndex,
      columns,
      deps.includeStartPosition,
      deps.startPositionLayout,
      deps.mandalaLayoutOverride
    );
  }

  function cacheKey(deps: ChoreoCardRenderDeps): string {
    return getPreviewCacheKey(
      deps.sequence,
      deps.renderOptions,
      deps.columnCount,
      deps.darkMode,
      deps.startPositionLayout,
      deps.includeStartPosition
    );
  }

  function relayoutCells(): void {
    const deps = getDeps();
    if (!deps.sequence.steps?.length || model.cells.length === 0) return;

    model.columns = deps.effectiveColumns;
    model.rows = deps.effectiveRows;
    model.cells = model.cells.map((cell) => ({
      ...cell,
      ...gridPosition(cell.index, deps.effectiveColumns),
    }));
    sizing.updateCellWidth();

    if (deps.livePictographs) return;

    storePreviewInCache(
      cacheKey(deps),
      {
        cells: model.cells.map((cell) => ({
          index: cell.index,
          label: cell.label,
          imageUrl: cell.imageUrl,
          gridColumn: cell.gridColumn,
          gridRow: cell.gridRow,
          duration: cell.duration,
        })),
        columns: deps.effectiveColumns,
        rows: deps.effectiveRows,
        durationRows: model.durationRows,
        hasMixedDurations: model.hasMixedDurations,
        durationColCount: model.durationColCount,
      },
      model.cells
    );
  }

  function buildPlaceholders(
    deps: ChoreoCardRenderDeps,
    columns: number
  ): ChoreoCardCell[] {
    const placeholders: ChoreoCardCell[] = [];
    const firstStep = deps.sequence.steps[0];
    if (deps.sequence.startPosition || firstStep) {
      placeholders.push({
        index: -1,
        label: "Start",
        imageUrl: "",
        isLoaded: false,
        ...gridPosition(-1, columns),
        duration: 1,
      });
    }
    for (let index = 0; index < deps.sequence.steps.length; index++) {
      placeholders.push({
        index,
        label: deps.isBrowseSoloMode
          ? deps.getSoloLocationLabel(index)
          : String(index + 1),
        imageUrl: "",
        isLoaded: false,
        ...gridPosition(index, columns),
        duration: deps.sequence.steps[index]?.duration ?? 1,
      });
    }
    return placeholders;
  }

  function buildTasks(
    deps: ChoreoCardRenderDeps,
    mixedDurations: boolean
  ): CellTask[] {
    const tasks: CellTask[] = [];
    const firstStep = deps.sequence.steps[0];
    if (deps.sequence.startPosition || firstStep) {
      const startData =
        deps.sequence.startPosition ??
        createStartPositionFromBeatStart(firstStep!);
      tasks.push({
        cellIndex: -1,
        data: startData,
        stepNumber: undefined,
        options: deps.renderOptions,
        cacheKey: deriveCacheKey(startData, undefined, deps.darkMode, {
          ...deps.renderOptions,
          showStepNumbers: false,
        }),
      });
    }
    for (let index = 0; index < deps.sequence.steps.length; index++) {
      const step = deps.sequence.steps[index];
      if (!step) continue;
      const duration = step.duration ?? 1;
      const options =
        mixedDurations && duration !== 1
          ? { ...deps.renderOptions, widthMultiplier: duration }
          : deps.renderOptions;
      tasks.push({
        cellIndex: index,
        data: step,
        stepNumber: index + 1,
        options,
        cacheKey: deriveCacheKey(step, undefined, deps.darkMode, {
          ...options,
          showStepNumbers: false,
        }),
      });
    }
    return tasks;
  }

  async function renderAllCells(): Promise<void> {
    const initialDeps = getDeps();
    if (!initialDeps.sequence.steps?.length) {
      model.cells = [];
      model.isLoading = false;
      return;
    }
    if (isRendering) {
      renderQueued = true;
      return;
    }
    isRendering = true;
    beginRefresh();

    try {
      const deps = getDeps();
      const mixed = detectMixedDurations(deps.sequence.steps);
      model.hasMixedDurations = mixed;
      const columns = deps.effectiveColumns;
      let rows = deps.effectiveRows;
      model.columns = columns;

      let computedDurationRows: TimelineRow[] = [];
      if (mixed) {
        const stepsPerRow =
          deps.includeStartPosition && deps.startPositionLayout === "column"
            ? columns - 1
            : columns;
        computedDurationRows = calculateTimelineRowsByBeatCount(
          deps.sequence.steps,
          stepsPerRow
        );
        rows =
          computedDurationRows.length +
          (deps.includeStartPosition && deps.startPositionLayout === "row"
            ? 1
            : 0);
        model.durationRows = computedDurationRows;
        let maxStepUnits = 0;
        for (const row of computedDurationRows) {
          maxStepUnits = Math.max(maxStepUnits, row.totalDuration);
        }
        model.durationColCount =
          deps.includeStartPosition && deps.startPositionLayout === "column"
            ? maxStepUnits + 1
            : Math.max(
                maxStepUnits,
                deps.includeStartPosition && deps.showQRCode ? 2 : 1
              );
        if (
          deps.includeStartPosition &&
          deps.startPositionLayout === "column" &&
          deps.showQRCode
        ) {
          rows = Math.max(rows, 2);
        }
      } else {
        model.durationRows = [];
        model.durationColCount = 0;
      }
      model.rows = rows;

      if (deps.livePictographs) {
        const generation = ++liveGeneration;
        const firstStep = deps.sequence.steps[0];
        const start =
          deps.sequence.startPosition ??
          createStartPositionFromBeatStart(firstStep!);
        model.cells = buildPlaceholders(deps, columns).map((cell) => ({
          ...cell,
          live: {
            data: cell.index === -1 ? start : deps.sequence.steps[cell.index]!,
            options: {
              ...deps.renderOptions,
              widthMultiplier: mixed && cell.index !== -1 ? cell.duration : 1,
            },
            epoch: liveEpoch,
            onSettled: (failed: boolean) => {
              if (disposed || generation !== liveGeneration) return;
              const current = model.cells.find(
                (item) => item.index === cell.index
              );
              if (!current) return;
              current.isLoaded = !failed;
              current.renderFailed = failed;
              const visible = model.cells.filter(
                (item) => deps.includeStartPosition || item.index !== -1
              );
              deps.onRenderProgress?.(
                visible.filter((item) => item.isLoaded || item.renderFailed)
                  .length,
                visible.length
              );
            },
          },
        }));
        crossfader.setActiveDarkMode(deps.darkMode);
        model.isLoading = false;
        return;
      }

      const key = cacheKey(deps);
      const cached = globalPreviewCache.get(key);
      if (cached?.columns === columns && cached.rows === rows) {
        model.cells = cached.cells.map((cell) => ({ ...cell, isLoaded: true }));
        model.hasMixedDurations = cached.hasMixedDurations ?? false;
        model.durationRows = cached.durationRows ?? [];
        model.durationColCount = cached.durationColCount ?? 0;
        model.isLoading = false;
        deps.onRenderProgress?.(cached.cells.length, cached.cells.length);
        await tick();
        markScan("cell-dom-committed");
        void markScanAfterPaint("first-cell-painted");
        void markScanAfterPaint("all-cells-stable").then(reportScanToStable);
        return;
      }

      const oldBlobUrls = model.cells
        .filter((cell) => cell.imageUrl.startsWith("blob:"))
        .map((cell) => cell.imageUrl);
      if (oldBlobUrls.length > 0) {
        const urls = new Set(oldBlobUrls);
        for (const [previewKey, entry] of globalPreviewCache) {
          if (entry.cells.some((cell) => urls.has(cell.imageUrl))) {
            globalPreviewCache.delete(previewKey);
          }
        }
      }

      model.cells = buildPlaceholders(deps, columns);
      if (sizing.containedWidth && deps.layoutWidthUnits > 0) {
        sizing.updateCellWidth();
      }
      sizing.setCellWidthSuppressed(true);
      model.isLoading = false;

      const totalCellCount = model.cells.length;
      let loadedCount = 0;
      const tasks = buildTasks(deps, mixed);
      markScan("cell-cache-read-start");
      const blobResults = await Promise.all(
        tasks.map((task) =>
          pictographBlobCache.get(task.cacheKey).catch(() => null)
        )
      );
      markScan("cell-cache-read-end");

      let decodeStarted = false;
      const decodeForScan = async (imageUrl: string): Promise<void> => {
        if (!deps.cloudProbeEnabled || typeof Image === "undefined") return;
        if (!decodeStarted) {
          decodeStarted = true;
          markScan("cell-decode-start");
        }
        const image = new Image();
        image.decoding = "async";
        image.src = imageUrl;
        try {
          await image.decode();
        } catch {
          // The DOM image remains responsible for presenting decode failures.
        }
      };

      const hitUrls = await Promise.all(
        blobResults.map(async (blob, index) => {
          if (!blob) return null;
          const task = tasks[index]!;
          const bakeNumber =
            deps.showStepNumbers &&
            !deps.cloudProbeEnabled &&
            !deps.isBrowseSoloMode &&
            !deps.isMotionSoloMode &&
            task.stepNumber != null &&
            task.stepNumber !== -1;
          const finalBlob = bakeNumber
            ? await compositeStepNumberOnBlob(
                blob,
                task.stepNumber!,
                task.options.size,
                deps.darkMode,
                task.options.widthMultiplier ?? 1
              )
            : blob;
          return URL.createObjectURL(finalBlob);
        })
      );
      await Promise.all(
        hitUrls.map((url) => (url ? decodeForScan(url) : Promise.resolve()))
      );

      const updatedCells = model.cells.map((cell) => ({ ...cell }));
      const misses: { task: CellTask; cellArrayIndex: number }[] = [];
      for (let index = 0; index < tasks.length; index++) {
        const task = tasks[index]!;
        const cellArrayIndex = updatedCells.findIndex(
          (cell) => cell.index === task.cellIndex
        );
        if (cellArrayIndex === -1) continue;
        const url = hitUrls[index];
        if (url) {
          updatedCells[cellArrayIndex] = {
            ...updatedCells[cellArrayIndex]!,
            imageUrl: url,
            isLoaded: true,
          };
          loadedCount++;
        } else {
          misses.push({ task, cellArrayIndex });
        }
      }
      model.cells = updatedCells;
      deps.onRenderProgress?.(loadedCount, totalCellCount);
      if (loadedCount > 0) {
        await tick();
        markScan("cell-dom-committed");
        void markScanAfterPaint("first-cell-painted");
      }

      if (misses.length > 0) {
        await Promise.allSettled(
          misses.map(async ({ task, cellArrayIndex }) => {
            try {
              const imageUrl = await renderCell(
                task.data,
                task.stepNumber,
                deps.darkMode,
                task.options
              );
              await decodeForScan(imageUrl);
              const current = model.cells[cellArrayIndex];
              if (current?.index === task.cellIndex && !current.isLoaded) {
                model.cells[cellArrayIndex] = {
                  ...current,
                  imageUrl,
                  isLoaded: true,
                };
                loadedCount++;
                deps.onRenderProgress?.(loadedCount, totalCellCount);
                if (loadedCount === 1) {
                  await tick();
                  markScan("cell-dom-committed");
                  void markScanAfterPaint("first-cell-painted");
                }
              }
            } catch (error) {
              console.warn(
                "[ChoreoCard] cell image failed for cell",
                task.cellIndex,
                error
              );
              const current = model.cells[cellArrayIndex];
              if (
                current?.index === task.cellIndex &&
                !current.isLoaded &&
                !current.renderFailed
              ) {
                model.cells[cellArrayIndex] = {
                  ...current,
                  renderFailed: true,
                };
                loadedCount++;
                deps.onRenderProgress?.(loadedCount, totalCellCount);
              }
            }
          })
        );
      }
      if (decodeStarted) markScan("cell-decode-end");

      if (model.cells.every((cell) => cell.isLoaded)) {
        storePreviewInCache(
          key,
          {
            cells: [...model.cells],
            columns,
            rows,
            durationRows: computedDurationRows,
            hasMixedDurations: mixed,
            durationColCount: model.durationColCount,
          },
          model.cells
        );
      }
      for (const url of oldBlobUrls) URL.revokeObjectURL(url);
      await tick();
      markScan("cell-dom-committed");
      void markScanAfterPaint("all-cells-stable").then(reportScanToStable);
    } catch (error) {
      console.error("Failed to render cells:", error);
    } finally {
      isRendering = false;
      sizing.setCellWidthSuppressed(false);
      sizing.setFlipSuppressed(true);
      sizing.updateCellWidth();
      getDeps().onRenderSettled();
      requestAnimationFrame(() => sizing.setFlipSuppressed(false));
      if (renderQueued) {
        renderQueued = false;
        void renderAllCells();
      } else {
        endRefresh();
      }
    }
  }

  async function transitionCellImages(
    mode: "crossfade" | "swap" = "crossfade",
    animate = true
  ): Promise<void> {
    const initialDeps = getDeps();
    if (initialDeps.livePictographs) return renderAllCells();
    if (!initialDeps.sequence.steps?.length || model.cells.length === 0) return;
    if (isRendering) {
      renderQueued = true;
      return;
    }
    isRendering = true;
    beginRefresh();
    crossfader.flushPendingCrossfade(() => {
      model.cells = model.cells.map((cell) => ({
        ...cell,
        fadeOutUrl: undefined,
      }));
    });

    try {
      const deps = getDeps();
      const key = cacheKey(deps);
      const cached = globalPreviewCache.get(key);
      let newUrls: Map<number, string>;

      if (cached) {
        newUrls = new Map(
          cached.cells.map((cell) => [cell.index, cell.imageUrl])
        );
      } else {
        newUrls = new Map();
        const firstStep = deps.sequence.steps[0];
        if (deps.sequence.startPosition || firstStep) {
          const startData =
            deps.sequence.startPosition ??
            createStartPositionFromBeatStart(firstStep!);
          newUrls.set(
            -1,
            await renderCell(
              startData,
              undefined,
              deps.darkMode,
              deps.renderOptions
            )
          );
        }
        const mixed = detectMixedDurations(deps.sequence.steps);
        for (let index = 0; index < deps.sequence.steps.length; index++) {
          const step = deps.sequence.steps[index];
          if (!step) continue;
          const duration = step.duration ?? 1;
          const options =
            mixed && duration !== 1
              ? { ...deps.renderOptions, widthMultiplier: duration }
              : deps.renderOptions;
          newUrls.set(
            index,
            await renderCell(step, index + 1, deps.darkMode, options)
          );
        }
        storePreviewInCache(
          key,
          {
            cells: model.cells.map((cell) => ({
              ...cell,
              imageUrl: newUrls.get(cell.index) ?? cell.imageUrl,
              fadeOutUrl: undefined,
            })),
            columns: model.columns,
            rows: model.rows,
            durationRows: [...model.durationRows],
            hasMixedDurations: model.hasMixedDurations,
            durationColCount: model.durationColCount,
          },
          model.cells
        );
      }

      if (renderQueued) {
        for (const url of newUrls.values()) {
          if (url.startsWith("blob:")) URL.revokeObjectURL(url);
        }
        return;
      }

      if (!animate) {
        crossfader.setActiveDarkMode(deps.darkMode);
        model.cells = model.cells.map((cell) => ({
          ...cell,
          fadeOutUrl: undefined,
          imageUrl: newUrls.get(cell.index) ?? cell.imageUrl,
        }));
      } else {
        model.cells = model.cells.map((cell) => ({
          ...cell,
          fadeOutUrl: cell.imageUrl,
          imageUrl: newUrls.get(cell.index) ?? cell.imageUrl,
        }));
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
        crossfader.beginCrossfade(deps.darkMode, mode);
        crossfader.scheduleCrossfadeEnd(() => {
          model.cells = model.cells.map((cell) => ({
            ...cell,
            fadeOutUrl: undefined,
          }));
        });
      }
    } catch (error) {
      console.error("Failed to transition card images:", error);
      crossfader.setActiveDarkMode(getDeps().darkMode);
    } finally {
      isRendering = false;
      if (renderQueued) {
        renderQueued = false;
        crossfader.abortCrossfade(() => {
          model.cells = model.cells.map((cell) => ({
            ...cell,
            fadeOutUrl: undefined,
          }));
        });
        void renderAllCells();
      } else {
        endRefresh();
      }
    }
  }

  function clearCellUrls(): void {
    const cachedUrls = new Set<string>();
    for (const entry of globalPreviewCache.values()) {
      for (const cell of entry.cells) {
        if (cell.imageUrl.startsWith("blob:")) cachedUrls.add(cell.imageUrl);
      }
    }
    for (const cell of model.cells) {
      if (cell.imageUrl.startsWith("blob:") && !cachedUrls.has(cell.imageUrl)) {
        URL.revokeObjectURL(cell.imageUrl);
      }
      if (
        cell.fadeOutUrl?.startsWith("blob:") &&
        !cachedUrls.has(cell.fadeOutUrl)
      ) {
        URL.revokeObjectURL(cell.fadeOutUrl);
      }
    }
    model.cells = [];
  }

  async function forceRerenderAllCells(): Promise<void> {
    const deps = getDeps();
    if (!deps.sequence.steps?.length) return;
    if (deps.livePictographs) {
      liveEpoch++;
      const { pictographPreparer } =
        await import("$lib/shared/pictograph/shared/services/pictograph-preparer");
      pictographPreparer.clearCache();
      return renderAllCells();
    }
    globalPreviewCache.delete(cacheKey(deps));

    const firstStep = deps.sequence.steps[0];
    if (deps.sequence.startPosition || firstStep) {
      const startData =
        deps.sequence.startPosition ??
        createStartPositionFromBeatStart(firstStep!);
      await deleteCellCache(
        startData,
        undefined,
        deps.darkMode,
        deps.renderOptions
      );
    }
    for (let index = 0; index < deps.sequence.steps.length; index++) {
      const step = deps.sequence.steps[index];
      if (step) {
        await deleteCellCache(
          step,
          index + 1,
          deps.darkMode,
          deps.renderOptions
        );
      }
    }
    clearCellUrls();
    model.isLoading = true;
    void renderAllCells();
  }

  function adoptCachedPreview(): boolean {
    const deps = getDeps();
    if (deps.livePictographs) return false;
    if (!deps.sequence.steps?.length) return false;
    const cached = globalPreviewCache.get(cacheKey(deps));
    if (
      cached?.columns !== deps.effectiveColumns ||
      cached.rows !== deps.effectiveRows
    ) {
      return false;
    }

    model.cells = cached.cells.map((cell) => ({ ...cell, isLoaded: true }));
    model.columns = cached.columns;
    model.rows = cached.rows;
    model.hasMixedDurations = cached.hasMixedDurations ?? false;
    model.durationRows = cached.durationRows ?? [];
    model.durationColCount = cached.durationColCount ?? 0;
    model.isLoading = false;
    deps.onRenderProgress?.(cached.cells.length, cached.cells.length);
    sizing.updateCellWidth();
    void tick().then(() => {
      markScan("cell-dom-committed");
      void markScanAfterPaint("first-cell-painted");
      void markScanAfterPaint("all-cells-stable").then(reportScanToStable);
    });
    return true;
  }

  function dispose(): void {
    disposed = true;
    if (refreshDelayTimer !== null) clearTimeout(refreshDelayTimer);
    clearCellUrls();
  }

  return {
    relayoutCells,
    renderAllCells,
    transitionCellImages,
    clearCellUrls,
    forceRerenderAllCells,
    adoptCachedPreview,
    dispose,
  } as const;
}
