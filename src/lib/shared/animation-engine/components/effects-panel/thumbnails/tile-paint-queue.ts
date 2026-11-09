/**
 * The effect picker paints a couple of dozen portraits, some with a pixel field
 * or a WebGL pass, and they all mount in one flush. Painted in their effects,
 * that flush was one long task: about half of the second the hidden viewer froze
 * the page for at start-up. Each portrait gets a task of its own here, behind
 * whatever else is waiting, and none starts during a press or a height ease.
 *
 * One at a time, because a painter may be async and the LED tile shares a single
 * renderer. Returns the cancel for a tile that changed or left before its turn.
 */
import {
  runAtBackgroundPriority,
  whenMotionSettled,
} from "#lib/shared/foundation/utils/background-scheduling.js";

type TilePaint = () => unknown;

const queue: { paint: TilePaint; cancelled: boolean }[] = [];
let draining = false;

async function drain(): Promise<void> {
  draining = true;
  while (queue.length > 0) {
    await new Promise<void>((resolve) => runAtBackgroundPriority(resolve));
    await whenMotionSettled();
    const job = queue.shift();
    if (!job || job.cancelled) continue;
    try {
      await job.paint();
    } catch (error) {
      console.warn("Effect tile failed to paint:", error);
    }
  }
  draining = false;
}

export function queueTilePaint(paint: TilePaint): () => void {
  const job = { paint, cancelled: false };
  queue.push(job);
  if (!draining) void drain();
  return () => {
    job.cancelled = true;
  };
}
