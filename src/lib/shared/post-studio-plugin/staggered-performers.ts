import type { SequenceFrame } from "@austencloud/video-editor/core";
import { sequenceFrameAt } from "#lib/shared/media-composition/domain/sequence-frame.js";

/**
 * A staggered tunnel filmed live: the front performer starts the sequence and
 * each other performer starts the same sequence some beats later. The tapped
 * beats cover the whole tunnel, from the front performer's first move to the
 * last performer's last landing, so every performer does the same number of
 * moves and the front one finishes `maxBehind` beats before the end.
 */

/** The take's last landing rides along on the frame the alignment built. */
export interface TkaSequenceFrame extends SequenceFrame {
  endArrival?: number | null;
}

export interface StaggeredFrames {
  leader: SequenceFrame;
  /** One frame per follower, in the order they were given. */
  followers: SequenceFrame[];
}

export function staggeredFrames(
  frame: TkaSequenceFrame,
  moveBeats: readonly number[],
  beatsBehind: readonly number[]
): StaggeredFrames {
  const maxBehind = Math.max(0, ...beatsBehind);
  const end = frame.endArrival;
  // Without a last landing the tunnel runs on, and no one stops early.
  const moves =
    typeof end === "number" && Number.isFinite(end)
      ? Math.max(0, end - maxBehind)
      : Infinity;
  const at = (arrival: number): SequenceFrame =>
    sequenceFrameAt(Math.min(moves, Math.max(0, arrival)), moveBeats, {
      endArrival: Number.isFinite(moves) ? moves : null,
    });
  return {
    leader: frame.arrival <= moves ? frame : at(frame.arrival),
    followers: beatsBehind.map((behind) => at(frame.arrival - behind)),
  };
}
