/**
 * Profiling for a front-door tap into a Create method.
 *
 * Records `create:enter:<method>` from the tap to the end of the crossfade,
 * with milestones for each readiness step, so the first entry of a visit can be
 * read in the `?profile=1` console and checked by
 * `scripts/audit-create-entry.mjs`. The milestones are cheap and always
 * recorded; the frame and placeholder watch runs only with `?profile=1`.
 */
import {
  bootProfiler,
  isBootProfileVerbose,
} from "#lib/shared/analytics/boot-profiler.js";
import {
  startFrameGapSampler,
  summarizeFrameGaps,
} from "#lib/shared/analytics/frame-gap-sampler.js";
import { pictographDrawState } from "#lib/shared/pictograph/shared/utils/pictograph-draw-state.js";
import { DURATION } from "#lib/shared/transitions/transitions.js";

/** Every loading state that can stand in for a Create workspace or panel. */
export const CREATE_ENTRY_PLACEHOLDERS =
  ".create-loading, .generate-load-state, .picker-loading, .persistence-loading, .workspace-area-pending";

/**
 * True when the workspace layer shows the finished method: its panel has
 * content, no loading state is left in the layer, and no pictograph is still
 * drawing.
 */
export function isEntryLayerSettled(layer: Element, method: string): boolean {
  const panel = layer.querySelector(
    `.sub-tab-content[data-tab="${CSS.escape(method)}"]`
  );
  return (
    panel !== null &&
    panel.childElementCount > 0 &&
    layer.querySelector(CREATE_ENTRY_PLACEHOLDERS) === null &&
    pictographDrawState(layer) !== "drawing"
  );
}

export type CreateEntryStage =
  | "layout-ready"
  | "panel-ready"
  | "pictures-ready";

export interface CreateEntryTrace {
  readonly method: string;
  readonly tapAt: number;
  stage(stage: CreateEntryStage): void;
  swap(cappedOut: boolean): void;
  settled(): void;
  cancel(): void;
}

export function startCreateEntryTrace(
  method: string,
  getVisibleLayer: () => Element | null
): CreateEntryTrace {
  const prefix = `create:enter:${method}`;
  const tapAt = performance.now();
  const verbose = isBootProfileVerbose();
  bootProfiler.milestone(prefix);
  const finishSpan = bootProfiler.startSpan(prefix);
  const stopFrames = verbose ? startFrameGapSampler() : null;

  let swapAt: number | null = null;
  let cappedOut = false;
  let placeholderShown = false;
  let placeholderFrame = 0;
  let reportTimer: ReturnType<typeof setTimeout> | null = null;
  let finished = false;

  const sinceTap = () => Math.round(performance.now() - tapAt);

  // Between the swap and the end of the fade, any loading state in the visible
  // layer is one the visitor saw.
  function watchPlaceholders(): void {
    placeholderFrame = requestAnimationFrame(function check() {
      if (getVisibleLayer()?.querySelector(CREATE_ENTRY_PLACEHOLDERS)) {
        placeholderShown = true;
      }
      placeholderFrame = requestAnimationFrame(check);
    });
  }

  return {
    method,
    tapAt,
    stage(stage) {
      if (finished || swapAt !== null) return;
      bootProfiler.milestone(`${prefix}:${stage}`, { fromTapMs: sinceTap() });
    },
    swap(capped) {
      if (finished || swapAt !== null) return;
      swapAt = performance.now();
      cappedOut = capped;
      bootProfiler.milestone(`${prefix}:swap`, {
        heldMs: Math.round(swapAt - tapAt),
        cappedOut,
      });
      if (getVisibleLayer()?.querySelector(CREATE_ENTRY_PLACEHOLDERS)) {
        placeholderShown = true;
      }
      if (verbose) watchPlaceholders();
    },
    settled() {
      if (finished || swapAt === null) return;
      finished = true;
      const settledAt = performance.now();
      const heldMs = Math.round(swapAt - tapAt);
      cancelAnimationFrame(placeholderFrame);
      finishSpan("ok", { heldMs, cappedOut });
      // Frames keep being watched for one more fade's length: work queued by
      // the arrival (an idle prefetch, a late layout) lands here.
      reportTimer = setTimeout(() => {
        const detail: Record<string, number | boolean> = {
          heldMs,
          cappedOut,
          settleMs: Math.round(settledAt - tapAt),
        };
        if (stopFrames) {
          const frames = summarizeFrameGaps(
            stopFrames(),
            swapAt ?? settledAt,
            performance.now()
          );
          Object.assign(detail, {
            placeholderShown,
            worstFrameGapMs: frames.worstFrameGapMs,
            framesOverBudget: frames.framesOverBudget,
            displayIntervalMs: frames.displayIntervalMs,
          });
        }
        bootProfiler.milestone(`${prefix}:settled`, detail, settledAt);
        bootProfiler.printTimeline(prefix);
      }, DURATION.emphasis);
    },
    cancel() {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(placeholderFrame);
      if (reportTimer) clearTimeout(reportTimer);
      stopFrames?.();
      finishSpan("cancelled", { cappedOut });
    },
  };
}
