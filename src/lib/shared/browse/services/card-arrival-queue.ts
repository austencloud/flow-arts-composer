/**
 * Card arrival queue: lets slow gallery cards start their mandala drawings
 * one at a time, in reading order.
 *
 * A screen of slow cards used to mount every drawing in the same frame. Each
 * mount costs a few milliseconds (40 on a slowed phone), so the page stalled
 * and every card drew in lockstep. Here, cards that want to draw join a queue.
 * Each frame starts at most one, top row first and left to right, no sooner
 * than STAGGER.normal after the last, so the grid ripples in.
 *
 * Searched before writing this: requestAnimationFrame queue, stagger,
 * frameQueue, perFrame, background-scheduling. The closest matches don't fit:
 * `foundation/utils/background-scheduling.ts` defers work behind the page and
 * has no order or pacing, and `transitions/emanate.ts` staggers one sheet's
 * cards out of one element. The drawings start from many independent cards,
 * so this is its own small owner, used only by PropAwareThumbnail.
 */
import { STAGGER } from "#lib/shared/transitions/transitions.js";
import { motionDuration } from "#lib/shared/transitions/motion.js";

export interface ArrivalStart {
  /** The card's place on the page, which decides its turn. */
  top: number;
  left: number;
  /**
   * Start the drawing. Return false when the card no longer wants it (its
   * picture came first); that card gives up its turn without using a frame.
   */
  start: () => boolean;
}

const waiting = new Set<ArrivalStart>();
let frame: number | null = null;
let lastStart = -Infinity;

function readingOrder(a: ArrivalStart, b: ArrivalStart): number {
  // Cards in one grid row can differ by a pixel or two.
  return Math.abs(a.top - b.top) > 4 ? a.top - b.top : a.left - b.left;
}

function tick(now: number): void {
  frame = null;
  if (now - lastStart >= motionDuration(STAGGER.normal)) {
    for (const entry of [...waiting].sort(readingOrder)) {
      waiting.delete(entry);
      if (entry.start()) {
        lastStart = now;
        break;
      }
    }
  }
  if (waiting.size > 0) frame = requestAnimationFrame(tick);
}

/** Join the queue. The returned function leaves it, if still waiting. */
export function queueArrivalStart(entry: ArrivalStart): () => void {
  waiting.add(entry);
  frame ??= requestAnimationFrame(tick);
  return () => {
    waiting.delete(entry);
    if (waiting.size === 0 && frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  };
}
