import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { Plane, PlaneMode } from "@austencloud/scene-3d";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
  type CharacterInstanceState,
} from "$lib/shared/3d/state/character-instance-state.svelte";
import {
  ScoreSeekDetector,
  resolvePerformerContact,
} from "$lib/shared/3d/domain/performer-contact-displacement";
import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import { propContinuityCorpus } from "../../tools/prop-continuity-corpus";

describe("score seek detector", () => {
  it("treats forward playback and the loop seam as playback", () => {
    const detector = new ScoreSeekDetector();
    const key = detector.observe(0, 4, true);
    for (let frame = 1; frame < 240; frame++) {
      expect(detector.observe(frame / 60, 4, true)).toBe(key);
    }
    // 3.983 -> 0.01 wraps to a small forward step.
    expect(detector.observe(0.01, 4, true)).toBe(key);
    // Several reads in one frame agree.
    expect(detector.observe(0.01, 4, true)).toBe(key);
    expect(detector.resetKey).toBe(key);
  });

  it("treats a jump backward, or forward by more than half a step, as a seek", () => {
    const detector = new ScoreSeekDetector();
    const key = detector.observe(1, 4, true);
    expect(detector.observe(0.9, 4, true)).toBe(key + 1);
    expect(detector.observe(1.5, 4, true)).toBe(key + 2);
    expect(detector.observe(1.9, 4, true)).toBe(key + 2);
    // Without a loop, the end back to the start is a seek, not a seam.
    const once = new ScoreSeekDetector();
    const start = once.observe(3.99, 4, false);
    expect(once.observe(0.01, 4, false)).toBe(start + 1);
  });

  it("ignores a clock that is not a number", () => {
    const detector = new ScoreSeekDetector();
    const key = detector.observe(2, 4, true);
    expect(detector.observe(Number.NaN, 4, true)).toBe(key);
    expect(detector.observe(2.02, 4, true)).toBe(key);
    expect(detector.bump()).toBe(key + 1);
  });
});

function performerFor(id: string): CharacterInstanceState {
  const entry = propContinuityCorpus().find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`no corpus entry ${id}`);
  const state = createCharacterInstanceState(
    { id: `contact-${id}`, positionX: 0, persistent: false },
    makeStandaloneDeps()
  );
  state.setPlaneMode(PlaneMode.WALL);
  state.loadSequence(entry.sequence);
  return state;
}

function seek(performer: CharacterInstanceState, scoreTime: number) {
  const beat = Math.floor(scoreTime);
  performer.goToStep(beat + performer.motionStepOffset);
  performer.setProgress(scoreTime - beat);
}

describe("performer contact", () => {
  it("passes a performer without a score through untouched", () => {
    const left = { worldPosition: new Vector3(3, 4, 5), plane: Plane.WALL };
    const right = { worldPosition: new Vector3(-3, 4, 5), plane: Plane.WALL };
    const standIn = {
      leftPropState: left,
      rightPropState: right,
    } as unknown as CharacterInstanceState;
    const contact = resolvePerformerContact(standIn, { heightCm: 190.5 });
    expect(contact.track).toBeNull();
    expect(contact.planned).toBe(false);
    expect(contact.leftProp).toBe(left);
    expect(contact.rightProp).toBe(right);
    expect(contact.sample.downstageHand).toBeNull();
    expect(left.worldPosition.toArray()).toEqual([3, 4, 5]);
  });

  it("hands over displaced copies and leaves the live state alone", () => {
    const performer = performerFor("tnd-tog-opp-ekek");
    // Left hand at the far cross-body point, beyond a square reach.
    seek(performer, 2.087);
    const authored = performer.leftPropState!.worldPosition.clone();
    const contact = resolvePerformerContact(performer, { heightCm: 190.5 });
    expect(contact.track).not.toBeNull();
    expect(contact.planned).toBe(true);
    expect(contact.sample.left.radialInM).toBeGreaterThan(0.1);
    expect(contact.leftProp).not.toBe(performer.leftPropState);
    expect(contact.leftProp!.worldPosition.length()).toBeLessThan(
      authored.length()
    );
    expect(performer.leftPropState!.worldPosition.toArray()).toEqual(
      authored.toArray()
    );

    const again = resolvePerformerContact(performer, { heightCm: 190.5 });
    expect(again.track).toBe(contact.track);

    const authoredOnly = resolvePerformerContact(performer, {
      heightCm: 190.5,
      displace: false,
    });
    expect(authoredOnly.track).toBe(contact.track);
    expect(authoredOnly.planned).toBe(false);
    expect(authoredOnly.leftProp).toBe(performer.leftPropState);
  });

  it("changes the reset key on a seek or a new body, not during playback", () => {
    const performer = performerFor("tnd-split-same-aaaa");
    seek(performer, 0);
    const key = resolvePerformerContact(performer, {
      heightCm: 190.5,
    }).resetKey;
    for (let frame = 1; frame <= 90; frame++) {
      seek(performer, frame / 60);
      expect(
        resolvePerformerContact(performer, { heightCm: 190.5 }).resetKey
      ).toBe(key);
    }
    seek(performer, 0.5);
    expect(
      resolvePerformerContact(performer, { heightCm: 190.5 }).resetKey
    ).toBe(key + 1);

    const before = resolvePerformerContact(performer, { heightCm: 190.5 });
    const taller = resolvePerformerContact(performer, { heightCm: 200 });
    expect(taller.track).not.toBe(before.track);
    expect(taller.resetKey).toBe(before.resetKey + 1);
  });

  it("holds the start pose at beat 1's start, so beat 1 and the loop seam are playback", () => {
    const performer = performerFor("tnd-split-same-aaaa");
    performer.loop = true;
    expect(performer.motionStepOffset).toBe(1);
    const at = () => resolvePerformerContact(performer, { heightCm: 190.5 });

    // The clock already runs 0 to 1 over the start pose.
    performer.goToStep(0);
    performer.setProgress(0.6);
    expect(performer.scoreTime).toBeCloseTo(0.6, 9);
    const startPose = at();
    seek(performer, 0);
    const beatOne = at();
    expect(beatOne.resetKey).toBe(startPose.resetKey);
    expect(startPose.sample).toEqual(beatOne.sample);
    seek(performer, 0.01);
    expect(at().resetKey).toBe(startPose.resetKey);

    // Playback wraps from the last beat to the start pose, then into beat 1.
    seek(performer, performer.motionStepCount - 0.02);
    const lastBeat = at();
    performer.goToStep(0);
    performer.setProgress(0.4);
    expect(at().resetKey).toBe(lastBeat.resetKey);
    seek(performer, 0.01);
    expect(at().resetKey).toBe(lastBeat.resetKey);
  });

  it("replans when the effort or the path shape moves the props", () => {
    const performer = performerFor("tnd-tog-opp-ekek");
    seek(performer, 1.3);
    const at = () => resolvePerformerContact(performer, { heightCm: 190.5 });
    const base = at();
    expect(base.track).not.toBeNull();

    performer.setEffort("punch", { recordUndo: false });
    const punched = at();
    expect(punched.track).not.toBe(base.track);
    expect(punched.resetKey).toBe(base.resetKey + 1);
    expect(at().track).toBe(punched.track);

    const paths = getAnimationVisibilityManager();
    const policy = paths.getPathPolicy();
    try {
      paths.setPathShape(policy.pathShape === "linear" ? "arc" : "linear");
      const reshaped = at();
      expect(reshaped.track).not.toBe(punched.track);
      expect(reshaped.resetKey).toBe(punched.resetKey + 1);
    } finally {
      paths.setPathPolicy(policy);
    }
  });
});
