/**
 * One shared clock for every pictograph a sequence edit changes in place.
 *
 * The edit's owner announces it (rotate, mirror, flip, swap, invert) just
 * before the new sequence commits. Each live PictographContainer whose drawing
 * then changes joins the run, keeps its old drawing on screen, and reports
 * ready once its new drawing is prepared. The clock starts when every joiner
 * is ready (or a short cap passes), so the step grid, the start tile and the
 * step editor preview all move on the same frames: old arrows fade, props
 * travel (pictograph-edit-travel.ts), new arrows come in.
 *
 * A container with a stable cell identity also joins when its drawing changes
 * without an announcement (undo, a turns edit, a reused cell); those changes
 * share a "travel" run on the same clock.
 *
 * Reduced motion: no run starts, so every drawing snaps.
 */

import { motionDuration } from "#lib/shared/transitions/motion.js";
import {
  EDIT_TIMELINE,
  editTimelineTotal,
  sampleEditTimeline,
  type EditFrame,
  type EditTimeline,
  type PictographEdit,
} from "../services/pictograph-edit-travel";

/** An announcement nobody picks up within this window is dropped. */
const ANNOUNCE_WINDOW_MS = 1500;
/** The clock starts by this long after the first joiner even if some never report ready. */
const START_CAP_MS = 160;

export interface EditMotionTicket {
  readonly token: number;
  readonly epoch: number;
  readonly edit: PictographEdit;
}

interface Run {
  readonly epoch: number;
  readonly edit: PictographEdit;
  readonly timeline: EditTimeline;
  readonly joinedAt: number;
  readonly waiting: Set<number>;
  startedAt: number | null;
}

function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function scaledTimeline(): EditTimeline | null {
  const timeline = {
    arrowsOutMs: motionDuration(EDIT_TIMELINE.arrowsOutMs),
    travelMs: motionDuration(EDIT_TIMELINE.travelMs),
    arrowsInMs: motionDuration(EDIT_TIMELINE.arrowsInMs),
  };
  return timeline.travelMs > 0 ? timeline : null;
}

export function createPictographEditMotion() {
  let announced: { edit: PictographEdit; at: number } | null = null;
  let snapUntil = 0;
  // Raw: the run object is mutated in place (start time, waiting set); frames
  // react to the run being replaced and to `elapsed`.
  let run = $state.raw<Run | null>(null);
  let elapsed = $state(0);
  let epochSource = 0;
  let tokenSource = 0;
  let frameId = 0;

  function cancelFrame(): void {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
  }

  function finish(): void {
    cancelFrame();
    run = null;
    elapsed = 0;
  }

  function tick(time: number): void {
    const current = run;
    if (!current) {
      frameId = 0;
      return;
    }
    if (current.startedAt === null) {
      // Still collecting: start once everyone is ready or the cap passes.
      if (
        current.waiting.size === 0 ||
        time - current.joinedAt >= START_CAP_MS
      ) {
        current.startedAt = time;
      }
      frameId = requestAnimationFrame(tick);
      return;
    }
    const at = time - current.startedAt;
    if (at >= editTimelineTotal(current.timeline)) {
      finish();
      return;
    }
    elapsed = at;
    frameId = requestAnimationFrame(tick);
  }

  /** The edit about to commit. The next drawings that change join it. */
  function announce(edit: PictographEdit): void {
    announced = { edit, at: now() };
    snapUntil = 0;
  }

  /**
   * A whole new sequence is about to arrive (generation): drawings that change
   * in the next moment snap instead of travelling from the old one's places.
   */
  function snapNext(): void {
    announced = null;
    snapUntil = now() + ANNOUNCE_WINDOW_MS;
  }

  /**
   * Called by a container whose drawing just changed. Joins the announced
   * edit, or the run still collecting, or (when `unannounced` is allowed)
   * opens a "travel" run. Null means snap.
   */
  function join(options: { unannounced: boolean }): EditMotionTicket | null {
    const at = now();
    if (announced && at - announced.at > ANNOUNCE_WINDOW_MS) announced = null;

    let current = run;
    const collecting = current !== null && current.startedAt === null;
    let edit: PictographEdit | null = null;

    if (announced) {
      edit = announced.edit;
      announced = null;
      current = null;
    } else if (collecting && current) {
      edit = current.edit;
    } else if (options.unannounced && at >= snapUntil) {
      edit = { kind: "travel" };
      current = null;
    }
    if (!edit) return null;

    if (!current) {
      const timeline = scaledTimeline();
      if (!timeline) {
        finish();
        return null;
      }
      cancelFrame();
      current = {
        epoch: ++epochSource,
        edit,
        timeline,
        joinedAt: at,
        waiting: new Set(),
        startedAt: null,
      };
      run = current;
      elapsed = 0;
      frameId = requestAnimationFrame(tick);
    }

    const token = ++tokenSource;
    current.waiting.add(token);
    return { token, epoch: current.epoch, edit };
  }

  /** The joiner's new drawing is prepared; it no longer holds the start. */
  function ready(token: number): void {
    run?.waiting.delete(token);
  }

  /** A joiner unmounted or was superseded. */
  function leave(token: number): void {
    run?.waiting.delete(token);
  }

  /** The shared frame for a run, or null once it has finished or been replaced. */
  function frameFor(epoch: number): EditFrame | null {
    const current = run;
    if (current?.epoch !== epoch) return null;
    // Read `elapsed` before checking the start: `startedAt` is not reactive, so
    // a reader that skipped `elapsed` while the clock waited would never see
    // it move once the clock started.
    const at = elapsed;
    return sampleEditTimeline(
      current.startedAt === null ? 0 : at,
      current.timeline
    );
  }

  return { announce, snapNext, join, ready, leave, frameFor };
}

export type PictographEditMotion = ReturnType<
  typeof createPictographEditMotion
>;

let instance: PictographEditMotion | null = null;

export function getPictographEditMotion(): PictographEditMotion {
  instance ??= createPictographEditMotion();
  return instance;
}

/** Announce the edit about to commit to the sequence on screen. */
export function announcePictographEdit(edit: PictographEdit): void {
  getPictographEditMotion().announce(edit);
}

/** The next drawings to change snap: a whole new sequence is arriving. */
export function snapNextPictographEdits(): void {
  getPictographEditMotion().snapNext();
}
