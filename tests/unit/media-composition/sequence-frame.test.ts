import { describe, expect, it } from "vitest";
import {
  arrowOpacity,
  sequenceArrowLayers,
  sequenceFrameAt,
} from "$lib/shared/media-composition/domain/sequence-frame";

const DCK = [1, 1, 2, 1, 1, 1, 1, 1];

describe("sequenceArrowLayers", () => {
  it("never borrows the final arrow for the opening pose or first move", () => {
    for (const arrival of [0, 0.001, 0.025, 0.5]) {
      expect(
        sequenceArrowLayers(sequenceFrameAt(arrival, DCK), DCK.length)
      ).toMatchObject({ previousMove: null, previousOpacity: 0 });
    }
  });

  it("keeps the completed arrow at the landing and fades it briefly as the next move starts", () => {
    expect(
      sequenceArrowLayers(sequenceFrameAt(1, DCK), DCK.length)
    ).toMatchObject({ currentOpacity: 1, previousOpacity: 0 });
    const justStarted = sequenceArrowLayers(
      sequenceFrameAt(1.001, DCK),
      DCK.length
    );
    expect(justStarted.previousMove).toBe(1);
    expect(justStarted.previousOpacity).toBeCloseTo(0.98);
    const middle = sequenceArrowLayers(sequenceFrameAt(1.025, DCK), DCK.length);
    expect(middle.currentOpacity).toBeCloseTo(0.025);
    expect(middle.previousOpacity).toBeCloseTo(0.5);
    expect(
      sequenceArrowLayers(sequenceFrameAt(1.05, DCK), DCK.length)
        .previousOpacity
    ).toBeCloseTo(0);
    expect(
      sequenceArrowLayers(sequenceFrameAt(1.5, DCK), DCK.length).currentOpacity
    ).toBe(0.5);
  });

  it("uses the actual final move at a repeated pass boundary", () => {
    const layers = sequenceArrowLayers(sequenceFrameAt(8.025, DCK), DCK.length);
    expect(layers.previousMove).toBe(8);
    expect(layers.previousOpacity).toBeCloseTo(0.5);
    expect(layers.currentOpacity).toBeCloseTo(0.025);
  });

  it("reproduces the same arrows when seeking backward and holds the final arrow", () => {
    const sample = () =>
      sequenceArrowLayers(sequenceFrameAt(2.025, DCK), DCK.length);
    const before = sample();
    sequenceArrowLayers(sequenceFrameAt(8.025, DCK), DCK.length);
    expect(sample()).toEqual(before);
    expect(
      sequenceArrowLayers(
        sequenceFrameAt(2.025, DCK, { endArrival: 2.025 }),
        DCK.length
      )
    ).toMatchObject({ currentOpacity: 1, previousOpacity: 0 });
  });
});

describe("sequenceFrameAt", () => {
  it("shows the opening pose before anything moves", () => {
    for (const arrival of [-2, 0, Number.NaN]) {
      expect(sequenceFrameAt(arrival, DCK)).toMatchObject({
        phase: "opening",
        absoluteMove: 0,
        move: 0,
        moveProgress: 0,
        pass: 0,
        enginePosition: 1,
      });
    }
  });

  it("names the move in flight and how far through it the performer is", () => {
    expect(sequenceFrameAt(2.5, DCK)).toMatchObject({
      move: 3,
      moveProgress: 0.5,
      pass: 0,
      passArrival: 2.5,
      enginePosition: 3.5,
    });
  });

  it("keeps a landing with the move that just finished", () => {
    expect(sequenceFrameAt(3, DCK)).toMatchObject({
      move: 3,
      moveProgress: 1,
      pass: 0,
    });
    // The landing that closes a pass stays in that pass.
    expect(sequenceFrameAt(8, DCK)).toMatchObject({
      move: 8,
      moveProgress: 1,
      pass: 0,
      enginePosition: 9,
      passBeatProgress: 1,
    });
    expect(sequenceFrameAt(16, DCK)).toMatchObject({ move: 8, pass: 1 });
    // Float dust from interpolation lands on the landing, not just short.
    expect(sequenceFrameAt(7.9999999999, DCK)).toMatchObject({
      move: 8,
      moveProgress: 1,
    });
  });

  it("starts the next pass just after its landing", () => {
    const frame = sequenceFrameAt(8.25, DCK);
    expect(frame).toMatchObject({ move: 1, pass: 1, passArrival: 0.25 });
    expect(frame.moveProgress).toBeCloseTo(0.25, 9);
    expect(frame.enginePosition).toBeCloseTo(1.25, 9);
  });

  it("measures pass progress in beats, so a two-beat move takes twice as long", () => {
    // Nine beats per pass; halfway through move 3 is two beats in.
    expect(sequenceFrameAt(2.5, DCK).passBeatProgress).toBeCloseTo(3 / 9, 9);
    expect(sequenceFrameAt(3, DCK).passBeatProgress).toBeCloseTo(4 / 9, 9);
  });

  it("holds each landed pose in step playback", () => {
    expect(sequenceFrameAt(2.7, DCK, { holdLandings: true })).toMatchObject({
      move: 2,
      moveProgress: 1,
    });
    expect(sequenceFrameAt(0.7, DCK, { holdLandings: true }).phase).toBe(
      "opening"
    );
  });

  it("counts moves and beats on across passes", () => {
    const frame = sequenceFrameAt(10.5, DCK);
    expect(frame).toMatchObject({ absoluteMove: 11, move: 3, pass: 1 });
    // A pass is nine beats; move 3 is the two-beat one, half done.
    expect(frame.beatsElapsed).toBeCloseTo(9 + 2 + 1, 9);
    expect(sequenceFrameAt(8, DCK).beatsElapsed).toBeCloseTo(9, 9);
  });

  it("holds the last landing once the performer stops", () => {
    expect(sequenceFrameAt(11.5, DCK, { endArrival: 12 })).toMatchObject({
      phase: "moving",
      move: 4,
    });
    for (const arrival of [12, 13.7, 40]) {
      expect(
        sequenceFrameAt(arrival, DCK, { endArrival: 12 })
      ).toMatchObject({
        phase: "holding",
        arrival: 12,
        absoluteMove: 12,
        move: 4,
        moveProgress: 1,
        pass: 1,
      });
    }
  });
});

describe("arrowOpacity", () => {
  it("fades the arrow in with the move and keeps it once the pose holds", () => {
    expect(arrowOpacity(sequenceFrameAt(0, DCK))).toBe(0);
    expect(arrowOpacity(sequenceFrameAt(2.25, DCK))).toBeCloseTo(0.25, 9);
    expect(arrowOpacity(sequenceFrameAt(3, DCK))).toBe(1);
    // Past the last landing the pose holds with its arrow whole.
    expect(
      arrowOpacity(sequenceFrameAt(20, DCK, { endArrival: 16 }))
    ).toBe(1);
  });
});
