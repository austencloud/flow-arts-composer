import { Vector3 } from "three";
import type { PropState3D } from "@austencloud/scene-3d";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  DEFAULT_POI_STRING_OPTIONS,
  getPoiHandTrack,
  samplePoiHandTrack,
  type PoiHandSide,
  type PoiHandTrack,
} from "#lib/shared/poi/poi-hand-track.js";
import {
  PoiTether,
  type PoiTetherSampler,
} from "#lib/shared/poi/poi-tether.js";

export interface PoiTetherSettings {
  bpm: number;
  stringLength: number;
  /** Radius of the drawn hand circle, metres. */
  handRadius: number;
  gravity: boolean;
  steeringGain: number;
}

/** A jump forward longer than this, seconds, is a seek or a long stall:
 *  the poi starts over rather than replaying it. */
const SEEK_SECONDS = 5;
/** A slow frame is replayed in pieces this long; the sim cuts any one call
 *  short so a stalled tab can't freeze the page. */
const CATCH_UP_SECONDS = 0.1;
/** Span of the finite difference that starts the poi already spinning. */
const START_SPAN = 1e-3;

/**
 * One hand's real poi on the test page: the solver's track for that hand,
 * the string sim fed from it, and the prop state that moves the performer's
 * hand to where the sim put it.
 *
 * Everything is in the hand anchor's frame (the rig's PERFORMER_PROP group),
 * the frame a prop state's `worldPosition` is measured in. The rig carries
 * that frame's facing, so gravity there is still −y.
 */
export class PoiTetherHand {
  readonly sim: PoiTether;
  private readonly track: PoiHandTrack;
  private readonly beatSeconds: number;
  private readonly sample: PoiTetherSampler;
  private lastScore: number | null = null;

  private constructor(track: PoiHandTrack, settings: PoiTetherSettings) {
    this.track = track;
    this.beatSeconds = 60 / settings.bpm;
    this.sim = new PoiTether({
      stringLength: settings.stringLength,
      gravity: settings.gravity ? 9.81 : 0,
      steeringGain: settings.steeringGain,
      beatSeconds: this.beatSeconds,
    });
    const beat = this.beatSeconds;
    this.sample = (time, hand, head) =>
      samplePoiHandTrack(track, time / beat, hand, head);
  }

  static create(
    sequence: SequenceData,
    side: PoiHandSide,
    settings: PoiTetherSettings
  ): PoiTetherHand | null {
    const track = getPoiHandTrack(sequence, side, "wall", {
      ...DEFAULT_POI_STRING_OPTIONS,
      bpm: settings.bpm,
      stringLength: settings.stringLength,
      handRadius: settings.handRadius,
      gravity: settings.gravity,
    });
    return track ? new PoiTetherHand(track, settings) : null;
  }

  /**
   * Runs the sim up to `score` (beats). Calling it again with the same score
   * does nothing, so it is safe wherever the score is read. A loop seam
   * carries on, and a slow frame is caught up in full; a seek or a long
   * stall starts the poi over, spinning.
   */
  advance(score: number): void {
    const last = this.lastScore;
    this.lastScore = score;
    if (last === null) return this.restart(score);
    let beats = score - last;
    if (beats < -this.track.beats / 2) beats += this.track.beats;
    let seconds = beats * this.beatSeconds;
    if (seconds < 0 || seconds > SEEK_SECONDS) return this.restart(score);
    while (seconds > 0) {
      const piece = Math.min(seconds, CATCH_UP_SECONDS);
      this.sim.step(piece, this.sample);
      seconds -= piece;
    }
  }

  /** The performer's prop state, moved to the sim's hand. The handle keeps
   *  the sequence's own turn: re-aiming it down the string every frame
   *  changed the grip geometry each frame, so the finger solver re-ran from
   *  scratch on both hands (about a second a frame). */
  apply(prop: PropState3D): PropState3D {
    const p = this.sim.points;
    return { ...prop, worldPosition: new Vector3(p[0]!, p[1]!, p[2]!) };
  }

  private restart(score: number): void {
    const time = score * this.beatSeconds;
    const hand = new Float64Array(3);
    const head = new Float64Array(3);
    const handAhead = new Float64Array(3);
    const headAhead = new Float64Array(3);
    this.sample(time, hand, head);
    this.sample(time + START_SPAN, handAhead, headAhead);
    const rate = (from: Float64Array, to: Float64Array) =>
      [0, 1, 2].map((k) => (to[k]! - from[k]!) / START_SPAN);
    this.sim.reset(
      hand,
      head,
      time,
      rate(head, headAhead),
      rate(hand, handAhead)
    );
  }
}
