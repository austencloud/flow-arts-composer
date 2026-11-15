/**
 * Times one variation swap on a gallery card: the tap on the variation pill to
 * the new picture showing. Pure logic, so the outcome rules are tested without
 * a component; the card feeds it taps, pictures and its own unmount.
 *
 * One event per tap. A tap that is followed by another tap before its picture
 * shows ends as `tapped_again` (duration: tap to next tap). A card that goes
 * away or is opened first ends it as `left`.
 */

import type { CacheLayer } from "./thumbnail-metrics-collector";

export type VariationSwapOutcome = "shown" | "tapped_again" | "left";

export interface VariationSwapEvent {
  duration_ms: number;
  outcome: VariationSwapOutcome;
  /** The tier that answered, when the orchestrator reported one. */
  source?: CacheLayer;
  variation_count: number;
  /** The next-variation preparation had its picture ready at the tap. */
  prepared: boolean;
}

interface PendingSwap {
  startedAt: number;
  prepared: boolean;
  variationCount: number;
}

export interface VariationSwapTracker {
  /** The visitor tapped the pill. */
  tap(info: { variationCount: number; prepared: boolean }): void;
  /** A picture finished loading on the card. Ignored with no swap pending. */
  shown(source?: CacheLayer): void;
  /** The card unmounted, was opened, or was recycled. */
  left(): void;
}

export function createVariationSwapTracker(
  emit: (event: VariationSwapEvent) => void,
  now: () => number = () => performance.now()
): VariationSwapTracker {
  let pending: PendingSwap | null = null;

  function finish(outcome: VariationSwapOutcome, source?: CacheLayer): void {
    if (!pending) return;
    const swap = pending;
    pending = null;
    const event: VariationSwapEvent = {
      duration_ms: Math.max(0, Math.round(now() - swap.startedAt)),
      outcome,
      variation_count: swap.variationCount,
      prepared: swap.prepared,
    };
    if (source !== undefined && outcome === "shown") event.source = source;
    emit(event);
  }

  return {
    tap({ variationCount, prepared }) {
      finish("tapped_again");
      pending = { startedAt: now(), prepared, variationCount };
    },
    shown(source) {
      finish("shown", source);
    },
    left() {
      finish("left");
    },
  };
}
