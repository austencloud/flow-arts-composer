import { describe, expect, it } from "vitest";
import {
  TITLE_LIT_DIM,
  TITLE_LIT_FADE_SECONDS,
  createTitleLitFollower,
  drawnLetterForMove,
  drawnTitleLetters,
  titleLetterStrengths,
} from "#lib/shared/media-composition/domain/title-lit-letter.js";
import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";

const OMEGA_BEATS = ["Ω", "Λ-", "X", "J"];
const repeated = (beats: string[], times: number) =>
  Array.from({ length: times }, () => beats).flat();

/** The drawn letters of the name built from these beats, as the painter draws it. */
const drawnOf = (beats: string[]) =>
  drawnTitleLetters(simplifyRepeatedWord(beats.join("")));

describe("the letter a move lights", () => {
  it("lands on the shortened name when the word repeats", () => {
    const beats = repeated(OMEGA_BEATS, 4);
    const drawn = drawnOf(beats);
    expect(drawn).toEqual(OMEGA_BEATS);
    const lit = beats.map((_, i) => drawnLetterForMove(i + 1, beats, drawn));
    expect(lit).toEqual(repeated([0, 1, 2, 3], 4));
  });

  it("reads a mirrored word back across its middle", () => {
    const beats = ["A", "B", "B", "A"];
    const drawn = drawnOf(beats);
    expect(drawn).toEqual(["A", "B"]);
    expect([1, 2, 3, 4].map((m) => drawnLetterForMove(m, beats, drawn))).toEqual(
      [0, 1, 1, 0]
    );
  });

  it("lights nothing for the opening, a letterless move, or a foreign name", () => {
    expect(drawnLetterForMove(0, OMEGA_BEATS, OMEGA_BEATS)).toBeNull();
    expect(drawnLetterForMove(5, OMEGA_BEATS, OMEGA_BEATS)).toBeNull();
    expect(
      drawnLetterForMove(2, ["A", null, "B"], ["A", "B"])
    ).toBeNull();
    expect(drawnLetterForMove(3, ["A", null, "B"], ["A", "B"])).toBe(1);
    expect(drawnLetterForMove(1, OMEGA_BEATS, ["S", "u", "n"])).toBeNull();
  });
});

describe("letter strengths", () => {
  const lit = { from: 10, to: 20 };
  const settled = { letter: 2, previous: 1, secondsSinceChange: 5 };

  it("are all full outside the span", () => {
    expect(titleLetterStrengths(4, 9.99, lit, settled)).toEqual([1, 1, 1, 1]);
    expect(
      titleLetterStrengths(4, 20.01 + TITLE_LIT_FADE_SECONDS, lit, settled)
    ).toEqual([1, 1, 1, 1]);
    expect(titleLetterStrengths(4, 15, undefined, settled)).toEqual([
      1, 1, 1, 1,
    ]);
  });

  it("light only the move's letter inside it", () => {
    const d = TITLE_LIT_DIM;
    expect(titleLetterStrengths(4, 15, lit, settled)).toEqual([d, d, 1, d]);
  });

  it("fade in from all full when the span starts mid-move", () => {
    // The move began 0.5 s before the span did.
    const midMove = { letter: 1, previous: 0, secondsSinceChange: 0.5 };
    expect(titleLetterStrengths(4, 10, lit, midMove)).toEqual([1, 1, 1, 1]);
    const halfway = titleLetterStrengths(
      4,
      10 + TITLE_LIT_FADE_SECONDS / 2,
      lit,
      { ...midMove, secondsSinceChange: 0.5 + TITLE_LIT_FADE_SECONDS / 2 }
    );
    expect(halfway[1]).toBe(1);
    expect(halfway[0]).toBeCloseTo((1 + TITLE_LIT_DIM) / 2, 9);
    expect(halfway[0]).toBe(halfway[3]);
  });

  it("hand the light from one letter to the next over the fade", () => {
    const change = { letter: 2, previous: 1, secondsSinceChange: 0 };
    const d = TITLE_LIT_DIM;
    expect(titleLetterStrengths(4, 15, lit, change)).toEqual([d, 1, d, d]);
    const half = titleLetterStrengths(4, 15, lit, {
      ...change,
      secondsSinceChange: TITLE_LIT_FADE_SECONDS / 2,
    });
    expect(half[1]).toBeCloseTo((1 + d) / 2, 9);
    expect(half[2]).toBeCloseTo((1 + d) / 2, 9);
    expect(half[0]).toBe(d);
  });
});

describe("following the clock", () => {
  it("times a change during playback and shows it settled after a seek", () => {
    const follow = createTitleLitFollower();
    expect(follow(10, 0).secondsSinceChange).toBe(Infinity);
    follow(10 + 1 / 30, 0);
    const changed = follow(10 + 2 / 30, 1);
    expect(changed).toMatchObject({ letter: 1, previous: 0 });
    expect(changed.secondsSinceChange).toBe(0);
    expect(follow(10 + 3 / 30, 1).secondsSinceChange).toBeCloseTo(1 / 30, 9);
    const sought = follow(40, 2);
    expect(sought).toMatchObject({ letter: 2, previous: 2 });
    expect(sought.secondsSinceChange).toBe(Infinity);
  });
});
