import type { CharacterInstanceState } from "../state/character-instance-state.svelte";
import {
  buildStanceYawTrackForSource,
  resolveTrackedUpperBodyStance,
  type StanceYawTrack,
} from "../collision/stance-yaw-track";
import type { StanceClearance } from "../collision/stance-side-lane";
import {
  sameScoreMotionKey,
  scoreMotionKey,
  type ScoreMotionKey,
} from "./performer-score-motion-key";
import { performerScoreClock } from "./performer-score-clock";
import { performerStanceClearance } from "./performer-stance-clearance";

/** The score's prop motion, and the staff the side-on lanes are sized for. */
interface StanceTrackKey extends ScoreMotionKey {
  clearance: Readonly<StanceClearance>;
}

interface CachedStanceTrack {
  key: StanceTrackKey;
  track: StanceYawTrack | null;
}

const stanceTracks = new WeakMap<CharacterInstanceState, CachedStanceTrack>();

/**
 * Replanned whenever the props it samples move or the staff changes length.
 * The hard-beat track keys on the same score motion and staff, so after an
 * effort or path change the torso and the displaced props follow one new plan
 * instead of the torso keeping the old one.
 */
function resolveStanceTrack(performer: CharacterInstanceState) {
  const key: StanceTrackKey = {
    ...scoreMotionKey(performer),
    clearance: performerStanceClearance(performer),
  };
  const cached = stanceTracks.get(performer);
  if (cached && sameScoreMotionKey(cached.key, key)) return cached.track;

  const track = buildStanceYawTrackForSource(
    performer,
    key.planeMode,
    key.clearance
  );
  stanceTracks.set(performer, { key, track });
  return track;
}

/**
 * One owner for the tracked torso pose consumed by both render backends.
 */
export function resolvePerformerUpperBodyStance(
  performer: CharacterInstanceState
) {
  return resolveTrackedUpperBodyStance(
    resolveStanceTrack(performer),
    performerScoreClock(performer),
    performer.planeMode,
    performer.leftPropState,
    performer.rightPropState
  );
}
