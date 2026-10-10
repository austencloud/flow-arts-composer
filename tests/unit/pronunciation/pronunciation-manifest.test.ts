import { describe, expect, it } from "vitest";

import { parsePronunciationManifest } from "#lib/shared/pronunciation/pronunciation-manifest.js";
import type {
  PronunciationPosition,
  PronunciationToken,
} from "#lib/shared/pronunciation/pronunciation-plan.js";

const baseToken: PronunciationToken = {
  path: "a/0f3a.wav",
  position: "medial",
  previousLetter: "B",
  nextLetter: "C",
  sourceWord: "BAC",
  indexInWord: 1,
  groupLength: 3,
  durationMs: 412,
  rmsDb: -19.4,
  f0StartHz: 118.2,
  f0EndHz: 121.7,
};

function makeToken(
  overrides: Partial<PronunciationToken> = {}
): PronunciationToken {
  return { ...baseToken, ...overrides };
}

function parseWithToken(token: unknown) {
  return parsePronunciationManifest({ version: 2, tokens: { a: [token] } });
}

describe("parsePronunciationManifest", () => {
  it("accepts a version 1 manifest", () => {
    const parsed = parsePronunciationManifest({
      version: 1,
      recordings: { a: { initial: "a/initial.wav" } },
    });

    expect(parsed).toEqual({
      version: 1,
      recordings: { a: { initial: "a/initial.wav" } },
    });
  });

  it("accepts a version 2 token bank", () => {
    const parsed = parsePronunciationManifest({
      version: 2,
      tokens: { a: [baseToken] },
    });

    expect(parsed?.version).toBe(2);
  });

  it("accepts an empty token bank", () => {
    expect(parsePronunciationManifest({ version: 2, tokens: {} })).toEqual({
      version: 2,
      tokens: {},
    });
  });

  it("accepts a token carrying extra unknown fields", () => {
    expect(
      parseWithToken({ ...baseToken, futureField: "reserved" })
    ).not.toBeNull();
  });

  it("rejects a token with an unknown position", () => {
    expect(
      parsePronunciationManifest({
        version: 2,
        tokens: { a: [{ ...baseToken, position: "middle" }] },
      })
    ).toBeNull();
  });

  it("rejects a token with a non-finite measurement", () => {
    expect(
      parsePronunciationManifest({
        version: 2,
        tokens: { a: [{ ...baseToken, f0StartHz: Number.NaN }] },
      })
    ).toBeNull();
  });

  it("rejects an unknown version and non-objects", () => {
    expect(parsePronunciationManifest({ version: 3, tokens: {} })).toBeNull();
    expect(parsePronunciationManifest("nope")).toBeNull();
    expect(parsePronunciationManifest(null)).toBeNull();
  });

  describe("numeric predicate tightening", () => {
    it("rejects a non-integer indexInWord", () => {
      expect(parseWithToken(makeToken({ indexInWord: 1.5 }))).toBeNull();
    });

    it("rejects a negative indexInWord", () => {
      expect(parseWithToken(makeToken({ indexInWord: -1 }))).toBeNull();
    });

    it("rejects a zero groupLength", () => {
      expect(parseWithToken(makeToken({ groupLength: 0 }))).toBeNull();
    });

    it("rejects a zero durationMs", () => {
      // A 0 ms token plays nothing, silently dropping a letter from the word.
      expect(parseWithToken(makeToken({ durationMs: 0 }))).toBeNull();
    });

    it("rejects a negative durationMs", () => {
      expect(parseWithToken(makeToken({ durationMs: -10 }))).toBeNull();
    });

    it("rejects a negative f0StartHz", () => {
      expect(parseWithToken(makeToken({ f0StartHz: -1 }))).toBeNull();
    });

    it("accepts f0StartHz and f0EndHz of 0 (the unvoiced sentinel)", () => {
      // Load-bearing: the feature-measurement task writes
      // `estimateF0Hz(...) ?? 0` for unvoiced segments. Rejecting 0 here
      // would silently drop every unvoiced token from the bank.
      expect(
        parseWithToken(makeToken({ f0StartHz: 0, f0EndHz: 0 }))
      ).not.toBeNull();
    });

    it("accepts a negative rmsDb (dBFS is legitimately negative)", () => {
      expect(parseWithToken(makeToken({ rmsDb: -40 }))).not.toBeNull();
    });
  });

  describe("neighbour letters are canonical values, not asset keys", () => {
    it("rejects an asset key where a letter value belongs", () => {
      // The natural mistake for a bank generator: asset keys are what the bank
      // is keyed by and what every token path contains. Accepting them here
      // parses and plays fine while every token of every word pays a full
      // neighbour mismatch, silently collapsing selection to length and join
      // cost.
      expect(parseWithToken(makeToken({ previousLetter: "sigma-dash" }))).toBeNull();
      expect(parseWithToken(makeToken({ nextLetter: "omega" }))).toBeNull();
    });

    it("accepts canonical Greek and dashed letter values", () => {
      expect(
        parseWithToken(makeToken({ previousLetter: "Σ-", nextLetter: "⊕" }))
      ).not.toBeNull();
    });
  });

  describe("position/neighbour coherence", () => {
    it("rejects position=initial with a non-null previousLetter", () => {
      expect(
        parseWithToken(
          makeToken({ position: "initial", previousLetter: "B", nextLetter: "C" })
        )
      ).toBeNull();
    });

    it("rejects position=medial with a null previousLetter", () => {
      expect(
        parseWithToken(
          makeToken({ position: "medial", previousLetter: null, nextLetter: "C" })
        )
      ).toBeNull();
    });

    it("rejects position=isolated with a non-null nextLetter", () => {
      expect(
        parseWithToken(
          makeToken({ position: "isolated", previousLetter: null, nextLetter: "C" })
        )
      ).toBeNull();
    });

    it.each<{
      position: PronunciationPosition;
      previousLetter: string | null;
      nextLetter: string | null;
    }>([
      { position: "initial", previousLetter: null, nextLetter: "C" },
      { position: "medial", previousLetter: "B", nextLetter: "C" },
      { position: "final", previousLetter: "B", nextLetter: null },
      { position: "isolated", previousLetter: null, nextLetter: null },
    ])(
      "accepts coherent context for position=$position",
      ({ position, previousLetter, nextLetter }) => {
        expect(
          parseWithToken(makeToken({ position, previousLetter, nextLetter }))
        ).not.toBeNull();
      }
    );
  });
});
