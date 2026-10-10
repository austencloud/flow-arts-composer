/**
 * The next turn's sequence for a scene that shows a fresh one each turn
 * (Generate, Tunnel). It comes from drawMatrixRealization(), the
 * Firebase-free source behind the home hero, drawn in the background between
 * turns. When that source fails, it stops asking and the scene falls back on
 * its demo.
 *
 * Under reduced motion no turn ever plays, so a request fetches nothing. A
 * scene asks again when a turn starts, so turns that come back after motion
 * returns still get a fresh sequence, or the demo when it has not arrived.
 */
import { previewMotionReduced } from "#lib/features/create/shared/state/method-preview-turns.svelte.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { runAtBackgroundPriority } from "#lib/shared/foundation/utils/background-scheduling.js";
import { drawMatrixRealization } from "#lib/shared/landing/data/shape-matrix-hero-pool.js";

export interface NextSequenceDraw {
  /** Draw the next sequence, unless one is waiting, drawing, or cannot come. */
  request(): void;
  /** The drawn sequence, handed over once; null when none has arrived. */
  take(): SequenceData | null;
  /** The scene has gone: a draw still running is dropped. */
  dispose(): void;
}

export function createNextSequenceDraw(options: {
  /** Logged when the source returns no sequence. */
  emptyWarning: string;
  /** Logged, with the error, when the draw throws. */
  errorWarning: string;
  /** Defaults to previewMotionReduced(): the system and app settings. */
  reducedMotion?: () => boolean;
}): NextSequenceDraw {
  const isReduced = options.reducedMotion ?? previewMotionReduced;
  let fresh: SequenceData | null = null;
  let drawing = false;
  let sourceFailed = false;
  let disposed = false;

  function request(): void {
    if (disposed || drawing || fresh || sourceFailed || isReduced()) return;
    drawing = true;
    runAtBackgroundPriority(() => {
      // The scene can be gone by the time the scheduler runs this.
      if (disposed) return;
      void drawMatrixRealization()
        .then((draw) => {
          if (!draw) {
            // The pool reports its own load failure as null, so this is
            // almost always a failed fetch, not an unlucky draw.
            sourceFailed = true;
            console.warn(options.emptyWarning);
          } else if (!disposed) fresh = draw.sequence;
        })
        .catch((error: unknown) => {
          sourceFailed = true;
          console.warn(options.errorWarning, error);
        })
        .finally(() => {
          drawing = false;
        });
    });
  }

  function take(): SequenceData | null {
    const drawn = fresh;
    fresh = null;
    return drawn;
  }

  function dispose(): void {
    disposed = true;
    fresh = null;
  }

  return { request, take, dispose };
}
