import { describe, expect, it } from "vitest";

import { isPronunciationTokenBank } from "#lib/shared/pronunciation/pronunciation-manifest.js";
import { assembleBank, type PartialToken } from "../../../scripts/build-token-bank";

const PARTIAL: PartialToken[] = [
  {
    letter: "α",
    path: "tokens/001-0.wav",
    position: "initial",
    previousLetter: null,
    nextLetter: "Σ-",
    sourceWord: "αΣ-",
    indexInWord: 0,
    groupLength: 2,
    startSeconds: 0.25,
    endSeconds: 0.7,
  },
  {
    letter: "Σ-",
    path: "tokens/001-1.wav",
    position: "final",
    previousLetter: "α",
    nextLetter: null,
    sourceWord: "αΣ-",
    indexInWord: 1,
    groupLength: 2,
    startSeconds: 0.7,
    endSeconds: 1.2,
  },
];

function voiced(seconds: number): Float32Array {
  const rate = 48_000;
  const samples = new Float32Array(Math.round(rate * seconds));
  for (let index = 0; index < samples.length; index++) {
    samples[index] = 0.3 * Math.sin((2 * Math.PI * 150 * index) / rate);
  }
  return samples;
}

describe("assembleBank", () => {
  it("produces a bank the app's own parser accepts", () => {
    // If this fails, playback silently falls through to speech synthesis for
    // every word — parsePronunciationManifest returns null and says nothing.
    const bank = assembleBank(PARTIAL, () => ({ samples: voiced(0.45), sampleRate: 48_000 }));

    expect(isPronunciationTokenBank(bank)).toBe(true);
    // measureTokenFeatures returns two edge-level fields the token type does not
    // carry. The parser ignores them, so nothing fails — the bank just doubles
    // its per-token field count for values nothing ever reads.
    expect(Object.keys(bank.tokens["alpha"]![0]!).sort()).toEqual([
      "durationMs", "f0EndHz", "f0StartHz", "groupLength", "indexInWord",
      "nextLetter", "path", "position", "previousLetter", "rmsDb", "sourceWord",
    ]);
  });

  it("keys tokens by asset key, and neighbours by letter value", () => {
    // The two namespaces are the trap: the bank is keyed "sigma-dash" while the
    // selector compares neighbours against "Σ-". Writing asset keys into the
    // neighbour fields parses and then mismatches on every single join.
    const bank = assembleBank(PARTIAL, () => ({ samples: voiced(0.45), sampleRate: 48_000 }));

    expect(Object.keys(bank.tokens).sort()).toEqual(["alpha", "sigma-dash"]);
    expect(bank.tokens["alpha"]![0]!.nextLetter).toBe("Σ-");
  });

  it("measures each token rather than copying one duration onto all of them", () => {
    const bank = assembleBank(PARTIAL, (token) => ({
      samples: voiced(token.endSeconds - token.startSeconds),
      sampleRate: 48_000,
    }));

    expect(bank.tokens["alpha"]![0]!.durationMs).toBeCloseTo(450, 0);
    expect(bank.tokens["sigma-dash"]![0]!.durationMs).toBeCloseTo(500, 0);
    expect(bank.tokens["alpha"]![0]!.f0StartHz).toBeGreaterThan(140);
  });
});
