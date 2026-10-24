import { describe, expect, it } from "vitest";
import schedule from "../../static/data/flow-fest/phrase-stage-schedule.json";
import {
  wrapAngle,
  type PhraseScheduleFile,
} from "../../src/lib/features/flow-fest-sim/domain/flow-fest-phrase-brain";
import {
  createPhrasePlayback,
  phraseFacingHint,
  phrasePassBeats,
  rigFacingForYaw,
} from "../../src/lib/features/flow-fest-sim/domain/flow-fest-phrase-playback";

const file = schedule as unknown as PhraseScheduleFile;
const playbacks = file.performers.map((performer) =>
  createPhrasePlayback(performer, {
    tempoBpm: file.tempoBpm,
    lengthBeats: file.lengthBeats,
  })
);

describe("phrase playback", () => {
  it("walks each travelling phrase onto its end point, on the beat", () => {
    for (const playback of playbacks) {
      const walks = playback.performer.phrases.filter((p) => p.path);
      expect(walks.length).toBeGreaterThan(0);
      for (const phrase of walks) {
        const path = phrase.path!;
        const arrival = phrase.startBeat + path.steps * path.beatsPerStep;
        const mid = playback.sample(phrase.startBeat + 0.5 * path.beatsPerStep);
        expect(mid.isMoving).toBe(true);
        const after = playback.sample(arrival + 0.25);
        expect(after.position.x).toBeCloseTo(path.to.x, 3);
        expect(after.position.z).toBeCloseTo(path.to.z, 3);
        expect(after.gaitTimingSample?.arrived).toBe(true);
      }
    }
  });

  it("stands still with the last walk's gait held between walks", () => {
    for (const playback of playbacks) {
      const phrases = playback.performer.phrases;
      for (const [index, phrase] of phrases.entries()) {
        if (phrase.mode !== "planted") continue;
        const a = playback.sample(phrase.startBeat + 0.1);
        const b = playback.sample(phrase.startBeat + 1.9);
        expect(a.isMoving).toBe(false);
        expect(a.turnRequest).toBeNull();
        expect(b.position).toEqual(a.position);
        expect(b.facingAngle).toBe(a.facingAngle);
        const walkedBefore = phrases.slice(0, index).some((p) => p.path);
        if (walkedBefore)
          expect(b.gaitTimingSample?.planId).toBe(a.gaitTimingSample?.planId);
      }
    }
  });

  it("turns through an authored request, then faces the phrase's end yaw", () => {
    let turns = 0;
    for (const playback of playbacks) {
      for (const phrase of playback.performer.phrases) {
        if (phrase.mode !== "turning" || !phrase.turnBeats) continue;
        turns++;
        const mid = playback.sample(phrase.startBeat + phrase.turnBeats / 2);
        expect(mid.turnRequest?.phase).toBeCloseTo(0.5, 6);
        expect(mid.turnRequest?.fromHeading).toBeCloseTo(
          rigFacingForYaw(phrase.facingStart),
          9
        );
        const done = playback.sample(phrase.startBeat + phrase.turnBeats + 0.1);
        expect(done.turnRequest).toBeNull();
        expect(done.facingAngle).toBeCloseTo(
          rigFacingForYaw(phrase.facingEnd),
          9
        );
        // The request lands where the standing facing picks up.
        const end = mid.turnRequest!.toHeading;
        expect(Math.cos(end - done.facingAngle)).toBeCloseTo(1, 9);
      }
    }
    expect(turns).toBeGreaterThan(0);
  });

  it("loosens timing inside a phrase but lands each join on the beat", () => {
    let loose = 0;
    for (const playback of playbacks) {
      for (const phrase of playback.performer.phrases) {
        if (phrase.rest) continue;
        const start = playback.sample(phrase.startBeat);
        expect(start.scoreBeat).toBeCloseTo(0, 9);
        const end = playback.sample(phrase.startBeat + phrase.beats - 1e-6);
        expect(end.scoreBeat).toBeCloseTo(phrase.beats, 4);
        // Both hands share one clock: the score only ever moves forward.
        let previous = -Infinity;
        for (let t = 0; t < phrase.beats; t += 0.25) {
          const frame = playback.sample(phrase.startBeat + t);
          expect(frame.scoreBeat).toBeGreaterThan(previous);
          expect(frame.scoreRate).toBeGreaterThan(0.3);
          previous = frame.scoreBeat;
        }
        const middle = playback.sample(phrase.startBeat + phrase.beats / 2);
        if (Math.abs(middle.scoreBeat - phrase.beats / 2) > 1e-3) loose++;
      }
    }
    // The sloppier performer's timing still shows somewhere.
    expect(loose).toBeGreaterThan(0);
  });

  it("loops at the night's length", () => {
    for (const playback of playbacks) {
      const a = playback.sample(3.3);
      const b = playback.sample(3.3 + file.lengthBeats);
      expect(b.phraseIndex).toBe(a.phraseIndex);
      expect(b.position).toEqual(a.position);
    }
  });
  it("turns the body's facing continuously, reaching each target by the end of the first pass", () => {
    for (const playback of playbacks) {
      const phrases = playback.performer.phrases;
      // Small steps across the night: no jump anywhere but the loop's wrap.
      const dt = 0.05;
      let previous = playback.sample(0).facingYaw;
      for (let beat = dt; beat < file.lengthBeats; beat += dt) {
        const yaw = playback.sample(beat).facingYaw;
        expect(
          Math.abs(wrapAngle(yaw - previous)),
          `${playback.performer.id} at ${beat.toFixed(2)}`
        ).toBeLessThan(0.1);
        previous = yaw;
      }
      for (const [index, phrase] of phrases.entries()) {
        const from = playback.facingFrom(index);
        const start = playback.sample(phrase.startBeat);
        expect(Math.cos(start.facingYaw - from)).toBeCloseTo(1, 6);
        const settled = playback.sample(
          phrase.startBeat +
            Math.min(phrasePassBeats(phrase), phrase.beats) -
            1e-6
        );
        expect(Math.cos(settled.facingYaw - phrase.facingTarget)).toBeCloseTo(
          1,
          4
        );
      }
    }
  });

  it("plays each beat's planes, per staff, without turning the root", () => {
    let changes = 0;
    for (const playback of playbacks) {
      for (const phrase of playback.performer.phrases) {
        if (phrase.rest) continue;
        let last = null as null | { left: string; right: string };
        for (let t = 0.5; t < phrase.beats; t += 1) {
          const frame = playback.sample(phrase.startBeat + t);
          const n = phrase.beatPlanes.length;
          const step = Math.floor(((frame.scoreBeat % n) + n) % n);
          expect(frame.planes).toEqual(phrase.beatPlanes[step]);
          if (
            last &&
            (last.left !== frame.planes.left ||
              last.right !== frame.planes.right)
          ) {
            changes++;
            // A plane change asks for no turn: only a turning phrase does.
            if (phrase.mode !== "turning") expect(frame.turnRequest).toBeNull();
          }
          last = frame.planes;
        }
      }
    }
    expect(changes).toBeGreaterThan(50);
  });

  it("hands the body response the facing relative to the root, settling after the first pass", () => {
    for (const playback of playbacks) {
      for (const [index, phrase] of playback.performer.phrases.entries()) {
        const from = playback.facingFrom(index);
        const hint = phraseFacingHint(phrase, from);
        const settled = phraseFacingHint(phrase, from, true);
        const pass = phrasePassBeats(phrase);
        const root = rigFacingForYaw(phrase.facingEnd);
        const relative = (yaw: number) =>
          wrapAngle(rigFacingForYaw(yaw) - root);
        // At the end of the first pass the hint is the target; settled, it
        // stays there the whole loop.
        expect(
          Math.cos(hint(pass)! - relative(phrase.facingTarget))
        ).toBeCloseTo(1, 6);
        for (const t of [0, pass / 3, pass / 2, pass - 0.01])
          expect(Math.cos(settled(t)! - hint(pass)!)).toBeCloseTo(1, 9);
        // Continuous over the pass.
        let previous = hint(0)!;
        for (let t = 0.05; t <= pass; t += 0.05) {
          const h = hint(t)!;
          if (phrase.mode !== "turning")
            expect(Math.abs(wrapAngle(h - previous))).toBeLessThan(0.1);
          previous = h;
        }
        // And matches the frame's facing against the root while it stands.
        if (phrase.mode === "planted" && !phrase.rest) {
          const frame = playback.sample(phrase.startBeat + pass / 2);
          expect(
            Math.cos(
              hint(pass / 2)! -
                wrapAngle(rigFacingForYaw(frame.facingYaw) - frame.facingAngle)
            )
          ).toBeCloseTo(1, 6);
        }
      }
    }
  });
});
