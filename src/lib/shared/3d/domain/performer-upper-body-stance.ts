import type { CharacterInstanceState } from "../state/character-instance-state.svelte";
import {
  buildStanceYawTrackForSource,
  resolveTrackedUpperBodyStance,
  type StanceYawTrack,
} from "../collision/stance-yaw-track";
import {
  sameScoreMotionKey,
  scoreMotionKey,
  type ScoreMotionKey,
} from "./performer-score-motion-key";
import { performerScoreClock } from "./performer-score-clock";

interface CachedStanceTrack {
  key: ScoreMotionKey;
  track: StanceYawTrack | null;
}

const stanceTracks = new WeakMap<CharacterInstanceState, CachedStanceTrack>();

/**
 * Replanned whenever the props it samples move. The hard-beat track keys on
 * the same score motion, so after an effort or path change the torso and the
 * displaced props follow one new plan instead of the torso keeping the old one.
 */
function resolveStanceTrack(performer: CharacterInstanceState) {
  const key = scoreMotionKey(performer);
  const cached = stanceTracks.get(performer);
  if (cached && sameScoreMotionKey(cached.key, key)) return cached.track;

  const track = buildStanceYawTrackForSource(performer, key.planeMode);
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
