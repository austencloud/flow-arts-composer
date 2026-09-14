import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { PreviewCellRenderOptions } from "./preview-cell-renderer";
import { resolvePreviewCellRender } from "./preview-cell-render-contract";

export type PreWarmPriority = "background" | "user-visible" | "user-blocking";
import { deriveCacheKey } from "./cell-cache-key-deriver";
import { pictographBlobCache } from "$lib/shared/render/services/pictograph-blob-cache";
import { pictographPreparer } from "$lib/shared/pictograph/shared/services/pictograph-preparer";
import { getWorkerRenderPool } from "$lib/shared/render/services/worker-render-pool";
import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
import { buildRenderOptions as buildCellRenderOptions } from "$lib/shared/choreo-card/services/choreo-card-cell-pipeline";
import { isCatDogMode } from "$lib/shared/browse/utils/prop-mode-helpers";
import { createStartPositionFromBeatStart } from "$lib/shared/create/services/sequence-transforms";
import { getVisibilityStateManager } from "$lib/shared/pictograph/shared/state/visibility-state.svelte";

interface CellTask {
  pictographData: PictographData;
  stepNumber: number | undefined;
  cacheKey: string;
  isDark: boolean;
}

function hasSchedulerApi(): boolean {
  return (
    typeof globalThis.scheduler !== "undefined" &&
    typeof globalThis.scheduler.postTask === "function"
  );
}

function hasSchedulerYield(): boolean {
  return hasSchedulerApi() && typeof globalThis.scheduler!.yield === "function";
}

export class CellPreWarmer {
  private activeWarms = new Map<string, AbortController>();
  private completedSequences = new Set<string>();

  preWarmSequence(sequence: SequenceData, priority: PreWarmPriority): void {
    if (!sequence.steps?.length) return;

    const seqId = sequence.id;

    if (this.completedSequences.has(seqId)) return;

    const existing = this.activeWarms.get(seqId);
    if (existing) {
      const priorityRank: Record<PreWarmPriority, number> = {
        background: 0,
        "user-visible": 1,
        "user-blocking": 2,
      };
      const existingPriority =
        (existing as AbortController & { _priority?: PreWarmPriority })
          ._priority ?? "background";
      if (priorityRank[priority] <= priorityRank[existingPriority]) {
        return;
      }
      existing.abort();
    }

    const controller = new AbortController();
    (
      controller as AbortController & { _priority?: PreWarmPriority }
    )._priority = priority;
    this.activeWarms.set(seqId, controller);

    const isDark = settingsService.settings.darkMode ?? false;
    const renderOptions = this.buildRenderOptions();
    const cellTasks = this.buildCellTasks(sequence, renderOptions, isDark);

    if (priority === "background") {
      this.warmSequential(seqId, cellTasks, renderOptions, controller.signal);
    } else {
      this.warmParallel(seqId, cellTasks, renderOptions, controller.signal);
    }
  }

  async preWarmSequenceAsync(sequence: SequenceData): Promise<void> {
    if (!sequence.steps?.length) return;

    const seqId = sequence.id;
    if (this.completedSequences.has(seqId)) return;

    const controller = new AbortController();
    this.activeWarms.set(seqId, controller);

    const isDark = settingsService.settings.darkMode ?? false;
    const renderOptions = this.buildRenderOptions();
    const cellTasks = this.buildCellTasks(sequence, renderOptions, isDark);

    await this.warmParallel(seqId, cellTasks, renderOptions, controller.signal);
  }

  cancelPreWarm(sequenceId: string): void {
    const controller = this.activeWarms.get(sequenceId);
    if (controller) {
      controller.abort();
      this.activeWarms.delete(sequenceId);
    }
  }

  cancelAll(): void {
    for (const controller of this.activeWarms.values()) {
      controller.abort();
    }
    this.activeWarms.clear();
  }

  invalidateCompleted(): void {
    this.completedSequences.clear();
  }

  private buildRenderOptions(): PreviewCellRenderOptions {
    const leftPropType = settingsService.settings.leftPropType;
    const rightPropType = settingsService.settings.rightPropType;
    const catDogMode = settingsService.settings.catDogMode;
    const catDogModeEnabled = isCatDogMode(
      leftPropType,
      rightPropType,
      catDogMode
    );
    const vm = getVisibilityStateManager();

    // Mirror ChoreoCard's canonical render options EXACTLY — same VM source, same
    // pipeline builder — so warmed cache keys match what the card reads. Pre-warm
    // targets the default full-card view: no solo/hand-path filtering, both
    // motions visible. (showGrid was previously omitted here, so a grid-off card
    // baked grid:true into the pre-warm key and never hit.)
    return {
      fanAppearance: settingsService.settings.fanAppearance,
      primaryPropColors: settingsService.settings.primaryPropColors,
      ...buildCellRenderOptions({
        cellSize: 240,
        leftPropType,
        rightPropType,
        catDogModeEnabled,
        leftBuugengFlipped:
          settingsService.settings.leftBuugengFlipped ?? false,
        rightBuugengFlipped:
          settingsService.settings.rightBuugengFlipped ?? false,
        showNonRadial: vm.getNonRadialVisibility(),
        showGrid: vm.getGridVisibility(),
        handPointVis: vm.getHandPointVisibility(),
        showTKA: vm.getRawGlyphVisibility("tkaGlyph"),
        showReversals: vm.getRawGlyphVisibility("reversalIndicators"),
        showTnD: vm.getRawGlyphVisibility("tndGlyph"),
        showElemental: vm.getRawGlyphVisibility("elementalGlyph"),
        showPositions: vm.getRawGlyphVisibility("positionsGlyph"),
        isSoloMode: false,
        handPathMode: false,
        browseViewMode: undefined,
        showLeftMotion: true,
        showRightMotion: true,
      }),
    };
  }

  private buildCellTasks(
    sequence: SequenceData,
    options: PreviewCellRenderOptions,
    isDark: boolean
  ): CellTask[] {
    const tasks: CellTask[] = [];

    const firstStep = sequence.steps![0];
    if (sequence.startPosition || firstStep) {
      const startData =
        sequence.startPosition || createStartPositionFromBeatStart(firstStep!);
      tasks.push({
        pictographData: startData,
        stepNumber: undefined,
        cacheKey: deriveCacheKey(startData, undefined, isDark, options),
        isDark,
      });
    }

    for (let i = 0; i < sequence.steps!.length; i++) {
      const step = sequence.steps![i];
      if (!step) continue;
      const stepNumber = i + 1;
      tasks.push({
        pictographData: step,
        stepNumber,
        cacheKey: deriveCacheKey(step, stepNumber, isDark, options),
        isDark,
      });
    }

    return tasks;
  }

  private async warmSequential(
    seqId: string,
    tasks: CellTask[],
    options: PreviewCellRenderOptions,
    signal: AbortSignal
  ): Promise<void> {
    try {
      for (const task of tasks) {
        if (signal.aborted) return;

        await this.renderCellIfNeeded(task, options, signal);

        if (signal.aborted) return;
        if (hasSchedulerYield()) {
          await globalThis.scheduler!.yield();
        } else if (typeof requestIdleCallback !== "undefined") {
          await new Promise<void>((resolve) =>
            requestIdleCallback(() => resolve())
          );
        }
      }

      this.completedSequences.add(seqId);
    } finally {
      // Only evict if THIS task's controller is still the registered one. A
      // superseding higher-priority warm aborts us and registers its own
      // controller under the same seqId; a blind delete here would drop the
      // live controller, so cancel could no longer abort it and a duplicate
      // parallel warm could launch. Identity via the unique signal.
      if (this.activeWarms.get(seqId)?.signal === signal) {
        this.activeWarms.delete(seqId);
      }
    }
  }

  private async warmParallel(
    seqId: string,
    tasks: CellTask[],
    options: PreviewCellRenderOptions,
    signal: AbortSignal
  ): Promise<void> {
    try {
      const promises = tasks.map((task) =>
        this.renderCellIfNeeded(task, options, signal)
      );
      await Promise.allSettled(promises);

      if (!signal.aborted) {
        this.completedSequences.add(seqId);
      }
    } finally {
      // See warmSequential: only evict if this task's controller is still the
      // registered one, so a superseding warm's controller isn't dropped.
      if (this.activeWarms.get(seqId)?.signal === signal) {
        this.activeWarms.delete(seqId);
      }
    }
  }

  private async renderCellIfNeeded(
    task: CellTask,
    options: PreviewCellRenderOptions,
    signal: AbortSignal
  ): Promise<void> {
    const cached = await pictographBlobCache.has(task.cacheKey);
    if (cached) return;

    if (signal.aborted) return;

    const { data, prepareOptions, renderOptions, visibility } =
      resolvePreviewCellRender(task.pictographData, task.isDark, options);
    const prepared = await pictographPreparer.prepareSingle(
      data,
      prepareOptions
    );
    if (signal.aborted) return;
    const pool = getWorkerRenderPool();

    try {
      const resolvedStepNum = options.showStepNumbers
        ? task.stepNumber
        : undefined;
      const blob = await pool.render(
        prepared,
        renderOptions,
        visibility,
        resolvedStepNum
      );
      if (!signal.aborted) {
        await pictographBlobCache.set(task.cacheKey, blob);
      }
    } catch {
      // Best-effort
    }
  }
}

export const cellPreWarmer = new CellPreWarmer();
