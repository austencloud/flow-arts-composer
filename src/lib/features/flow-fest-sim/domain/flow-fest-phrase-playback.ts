/**
 * Playing a phrase schedule: for one performer and one beat, everything
 * `LiveSequencePerformer3D` needs (where the score is, where the body stands
 * and faces, and how the feet step).
 *
 * - Travelling phrases walk with the shared exact-step plans
 *   (`beat-travel-plan.ts`), footfall k on `startBeat + k * beatsPerStep`.
 * - Turning phrases hand the rig an authored stepping turn over `turnBeats`
 *   from the phrase start, then stand at the new facing.
 * - Planted phrases stand. Between walks the last walk's settled gait sample
 *   stays in place, as the Stage module does, so the gait clock carries on.
 * - Planes: each beat names both staffs' planes (`beatPlanes`). A plane
 *   change never turns the body; the host holds the facing.
 * - Facing: `facingYaw` is the body's facing, eased from the last phrase's
 *   target to this one's over the phrase's first pass and held after it.
 *   `facingAngle` is the root facing the grid turns with. On a planted phrase
 *   the root follows the body, eased over the same first pass, so a big
 *   facing change turns the whole performer, grid and all (Austen,
 *   2026-10-27): the body response holds the feet still in the world while
 *   the root turns and steps them round after it (`phraseRootTurn`). What is
 *   left for the body to turn under its grid is the facing hint
 *   (`phraseFacingHint`): the body yaw relative to the root, per beat of the
 *   sequence, a small trim.
 *
 * The schedule's yaw (0 faces +x, turning toward +z) maps to the rig's
 * facing (0 faces +z) as `rig = π/2 − yaw`.
 *
 * The night loops at `lengthBeats`; at the wrap the performer is back at home.
 *
 * Timing: a phrase's `jitterBeats` and `tempoDrift` loosen the score inside
 * the phrase and ease out over its first and last two beats, so the props
 * leave and land on each join on the beat. Phrases chain (each sequence starts
 * where the last one ended), so a score that ran past the join, or short of
 * it, would show as a jump.
 */
import type {
  ScheduledGaitTimingSample,
  TerminalStepPlan,
  TurnRequest,
} from "@austencloud/scene-3d";
import {
  compileBeatTravel,
  sampleBeatTravel,
  type BeatTravel,
} from "#lib/shared/3d/locomotion/beat-travel-plan.js";
import { worldToBodyDirection } from "#lib/features/stage/domain/stage-performance-sampler.js";
import {
  phraseStartPositions,
  wrapAngle,
  type PhraseBeatPlanes,
  type PhrasePoint,
  type PhraseSchedulePerformer,
  type ScheduledPhrase,
} from "./flow-fest-phrase-brain";

export interface PhrasePlaybackFrame {
  phraseIndex: number;
  phrase: ScheduledPhrase;
  /** Beats into the phrase's sequence (the performer wraps it round the sequence). */
  scoreBeat: number;
  /** Score beats per clock beat just now: 1 on time, above 1 rushing. */
  scoreRate: number;
  position: PhrasePoint;
  /** The rig's root facing, 0 = +z: the grid turns with it. */
  facingAngle: number;
  /**
   * The body's facing in the schedule's yaw (0 faces +x, turning toward +z),
   * eased toward the phrase's `facingTarget`.
   */
  facingYaw: number;
  /** Both staffs' planes on the beat playing now. */
  planes: PhraseBeatPlanes;
  isMoving: boolean;
  moveSpeed: number;
  moveDirection: { x: number; z: number };
  gaitTimingSample: ScheduledGaitTimingSample | null;
  terminalStepPlan: TerminalStepPlan | null;
  turnRequest: TurnRequest | null;
}

export interface PhrasePlayback {
  readonly performer: PhraseSchedulePerformer;
  sample(beat: number): PhrasePlaybackFrame;
  /**
   * The facing a phrase starts from: the last phrase's target, or for the
   * first phrase the root facing the night starts at (at the loop's wrap the
   * body faces out again, as it stands at home again).
   */
  facingFrom(phraseIndex: number): number;
}

/**
 * The facing hint for the body response while a phrase plays: the body yaw
 * the phrase wants relative to the root facing, in radians, at a score time
 * in beats of the sequence (one play; the body response's track loops
 * round the sequence).
 *
 * Sign: the rig's, as `facingAngle` (a turn about +y, +z turning toward
 * +x), which is the opposite of the schedule's yaw. On the first pass the
 * hint eases from the last target to this one; `settled` gives the target
 * alone, for the passes after the first, so a looping track does not replay
 * the turn on every pass.
 */
export function phraseFacingHint(
  phrase: ScheduledPhrase,
  from: number,
  settled = false
): (scoreTime: number) => number | null {
  const pass = phrasePassBeats(phrase);
  return (scoreTime: number) => {
    const local = settled
      ? pass
      : Math.max(0, Math.min(pass, Number.isFinite(scoreTime) ? scoreTime : 0));
    return wrapAngle(
      rigFacingForYaw(phraseFacingYaw(phrase, from, local)) -
        rigFacingForYaw(phraseRootYaw(phrase, local))
    );
  };
}

/**
 * How far the root has turned since a planted phrase began, at a score time
 * in beats of its sequence, in the rig's sense: what the body response holds
 * the feet still against. Zero for the passes after the first (`settled`)
 * and for every other mode, whose turns the rig steps itself.
 */
export function phraseRootTurn(
  phrase: ScheduledPhrase,
  settled = false
): (scoreTime: number) => number {
  if (settled || !rootFollowsBody(phrase)) return () => 0;
  const pass = phrasePassBeats(phrase);
  const start = rigFacingForYaw(phrase.facingStart);
  return (scoreTime: number) => {
    const local = Math.max(
      0,
      Math.min(pass, Number.isFinite(scoreTime) ? scoreTime : 0)
    );
    return wrapAngle(rigFacingForYaw(phraseRootYaw(phrase, local)) - start);
  };
}

/** A planted phrase that plays turns its root with the body; a rest holds. */
function rootFollowsBody(phrase: ScheduledPhrase): boolean {
  return phrase.mode === "planted" && !phrase.rest;
}

/**
 * The root facing (schedule yaw) `local` beats into a phrase. A planted
 * phrase eases it from `facingStart` to `facingEnd` over its first pass, as
 * the body eases to its target; a turning phrase changes it at the end of
 * its stepping turn; a walk keeps it.
 */
export function phraseRootYaw(phrase: ScheduledPhrase, local: number): number {
  if (phrase.mode === "turning" && phrase.turnBeats) {
    return local < phrase.turnBeats ? phrase.facingStart : phrase.facingEnd;
  }
  if (!rootFollowsBody(phrase)) return phrase.facingEnd;
  const span = Math.min(phrasePassBeats(phrase), phrase.beats);
  const delta = wrapAngle(phrase.facingEnd - phrase.facingStart);
  return wrapAngle(phrase.facingStart + delta * smoothstep01(local / span));
}

/** Schedule yaw to the rig's facing. */
export function rigFacingForYaw(yaw: number): number {
  return wrapAngle(Math.PI / 2 - yaw);
}

const STILL = { x: 0, z: 0 };

function smoothstep01(t: number): number {
  const s = Math.max(0, Math.min(1, t));
  return s * s * (3 - 2 * s);
}

/** Beats in one play of a phrase's sequence. */
export function phrasePassBeats(phrase: ScheduledPhrase): number {
  return Math.max(1, phrase.beatPlanes.length || phrase.beats / phrase.repeats);
}

/**
 * The body's facing (schedule yaw) `local` beats into a phrase: eased from
 * `from` (the last phrase's target) to the phrase's target over its first
 * pass, then held. A rest keeps the facing it starts with.
 */
export function phraseFacingYaw(
  phrase: ScheduledPhrase,
  from: number,
  local: number
): number {
  const span = Math.min(phrasePassBeats(phrase), phrase.beats);
  const delta = wrapAngle(phrase.facingTarget - from);
  return wrapAngle(from + delta * smoothstep01(local / span));
}

/** Both staffs' planes `scoreBeat` beats into a phrase's sequence. */
export function phrasePlanesAt(
  phrase: ScheduledPhrase,
  scoreBeat: number
): PhraseBeatPlanes {
  const n = phrase.beatPlanes.length;
  const i = Math.floor(((scoreBeat % n) + n) % n);
  return phrase.beatPlanes[Math.min(n - 1, i)]!;
}

/** Beats at each end of a phrase over which loose timing eases back onto the beat. */
const TIMING_EASE_BEATS = 2;

/**
 * Where the score is `local` beats into a phrase: loose by the phrase's
 * timing in the middle, exactly on the beat at both joins.
 */
export function phraseScoreBeat(
  phrase: ScheduledPhrase,
  local: number
): number {
  if (phrase.rest) return 0;
  const { jitterBeats, tempoDrift } = phrase.timing;
  const loose = (local - jitterBeats) * (1 + tempoDrift) - local;
  const ease = Math.min(TIMING_EASE_BEATS, phrase.beats / 4);
  const s = Math.max(
    0,
    Math.min(1, local / ease, (phrase.beats - local) / ease)
  );
  return local + loose * s * s * (3 - 2 * s);
}

export function createPhrasePlayback(
  performer: PhraseSchedulePerformer,
  options: { tempoBpm: number; lengthBeats: number }
): PhrasePlayback {
  const { tempoBpm, lengthBeats } = options;
  const phrases = performer.phrases;
  if (phrases.length === 0)
    throw new Error(`Performer ${performer.id} has no phrases`);
  const starts = phraseStartPositions(performer.home, phrases);
  const facingFrom = (index: number) =>
    index === 0 ? phrases[0]!.facingStart : phrases[index - 1]!.facingTarget;

  // Gait steps walked before each phrase, and the last walk at or before it.
  const gaitBefore: number[] = [];
  const lastWalk: number[] = [];
  let gait = 0;
  let walk = -1;
  for (const [index, phrase] of phrases.entries()) {
    gaitBefore.push(gait);
    if (phrase.path) {
      gait += phrase.path.steps;
      walk = index;
    }
    lastWalk.push(walk);
  }

  const travels = new Map<number, BeatTravel>();
  const travelFor = (index: number): BeatTravel => {
    let travel = travels.get(index);
    if (!travel) {
      const phrase = phrases[index]!;
      const path = phrase.path!;
      travel = compileBeatTravel({
        id: `phrase:${performer.id}:${index}`,
        from: path.from,
        to: path.to,
        steps: path.steps,
        departureBeat: phrase.startBeat,
        arrivalBeat: phrase.startBeat + path.steps * path.beatsPerStep,
        bpm: tempoBpm,
        arrivalFacing: rigFacingForYaw(phrase.facingEnd),
        departureGaitStep: gaitBefore[index]!,
      });
      travels.set(index, travel);
    }
    return travel;
  };

  let cursor = 0;
  const phraseAt = (beat: number): number => {
    if (phrases[cursor]!.startBeat > beat) cursor = 0;
    while (
      cursor < phrases.length - 1 &&
      phrases[cursor + 1]!.startBeat <= beat
    )
      cursor++;
    return cursor;
  };

  return {
    performer,
    facingFrom,
    sample(rawBeat: number): PhrasePlaybackFrame {
      const beat = ((rawBeat % lengthBeats) + lengthBeats) % lengthBeats;
      const index = phraseAt(beat);
      const phrase = phrases[index]!;
      const local = beat - phrase.startBeat;
      const scoreBeat = phraseScoreBeat(phrase, local);
      const h = 1e-3;
      const scoreRate = phrase.rest
        ? 0
        : (phraseScoreBeat(phrase, Math.min(phrase.beats, local + h)) -
            phraseScoreBeat(phrase, Math.max(0, local - h))) /
          (Math.min(phrase.beats, local + h) - Math.max(0, local - h));
      const facingStart = rigFacingForYaw(phrase.facingStart);
      const frame: PhrasePlaybackFrame = {
        phraseIndex: index,
        phrase,
        scoreBeat,
        scoreRate,
        position: starts[index]!,
        facingAngle: facingStart,
        facingYaw: phraseFacingYaw(phrase, facingFrom(index), local),
        planes: phrasePlanesAt(phrase, scoreBeat),
        isMoving: false,
        moveSpeed: 0,
        moveDirection: STILL,
        gaitTimingSample: null,
        terminalStepPlan: null,
        turnRequest: null,
      };

      if (phrase.mode === "travelling" && phrase.path) {
        const travel = travelFor(index);
        const sample = sampleBeatTravel(travel, beat, tempoBpm);
        const dx = phrase.path.to.x - phrase.path.from.x;
        const dz = phrase.path.to.z - phrase.path.from.z;
        const length = Math.hypot(dx, dz) || 1;
        frame.position = sample.position;
        frame.isMoving = sample.moving;
        frame.moveSpeed = sample.speed;
        frame.moveDirection = worldToBodyDirection(
          { x: dx / length, z: dz / length },
          facingStart
        );
        frame.gaitTimingSample = sample.gaitTimingSample;
        frame.terminalStepPlan = sample.terminalStepPlan;
        return frame;
      }

      if (phrase.mode === "turning" && phrase.turnBeats) {
        const phase = local / phrase.turnBeats;
        if (phase < 1) {
          frame.turnRequest = {
            planId: `phrase-turn:${performer.id}:${index}`,
            fromHeading: facingStart,
            // The schedule's yaw and the rig's facing turn opposite ways.
            toHeading:
              facingStart - wrapAngle(phrase.facingEnd - phrase.facingStart),
            phase,
          };
          return frame;
        }
        frame.facingAngle = rigFacingForYaw(phrase.facingEnd);
      } else if (rootFollowsBody(phrase)) {
        // On the score's clock, as the body response's root turn is.
        frame.facingAngle = rigFacingForYaw(phraseRootYaw(phrase, scoreBeat));
      }

      // Standing after a walk: hold that walk's settled gait sample.
      const walkIndex = lastWalk[index]!;
      if (walkIndex >= 0) {
        const settled = sampleBeatTravel(travelFor(walkIndex), beat, tempoBpm);
        frame.gaitTimingSample = settled.gaitTimingSample;
        frame.terminalStepPlan = settled.terminalStepPlan;
      }
      return frame;
    },
  };
}
