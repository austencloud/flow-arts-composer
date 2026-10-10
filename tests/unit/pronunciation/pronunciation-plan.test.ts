import { describe, expect, it } from "vitest";

import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import {
  createPronunciationPlan,
  getLetterPronunciation,
  resolveRecordedCuePaths,
  type PronunciationManifest,
} from "#lib/shared/pronunciation/pronunciation-plan.js";

describe("createPronunciationPlan", () => {
  it("keeps dash letters whole and assigns phrase positions", () => {
    const plan = createPronunciationPlan("AΣ-⊕");

    expect(plan).not.toBeNull();
    expect(plan!.spokenText).toBe("A, Sigma dash, Terra.");
    expect(plan!.cues).toMatchObject([
      {
        letter: Letter.A,
        spokenName: "A",
        assetKey: "a",
        position: "initial",
        pauseAfterMs: 80,
      },
      {
        letter: Letter.SIGMA_DASH,
        spokenName: "Sigma dash",
        assetKey: "sigma-dash",
        position: "medial",
        pauseAfterMs: 80,
      },
      {
        letter: Letter.TERRA,
        spokenName: "Terra",
        assetKey: "terra",
        position: "final",
        pauseAfterMs: 0,
      },
    ]);
  });

  it("resets prosody at compressed-word group boundaries", () => {
    const plan = createPronunciationPlan("HΨ- · GΨ-");

    expect(plan).not.toBeNull();
    expect(plan!.spokenText).toBe("H, Psi dash. G, Psi dash.");
    expect(plan!.cues.map((cue) => cue.position)).toEqual([
      "initial",
      "final",
      "initial",
      "final",
    ]);
    expect(plan!.cues.map((cue) => cue.pauseAfterMs)).toEqual([80, 260, 80, 0]);
  });

  it("normalizes the historical uppercase gamma alias", () => {
    const plan = createPronunciationPlan("Γ");

    expect(plan?.cues).toMatchObject([
      {
        letter: Letter.GAMMA,
        spokenName: "Gamma",
        assetKey: "gamma",
        position: "isolated",
      },
    ]);
  });

  it("rejects an unknown token instead of reading a partial word", () => {
    expect(createPronunciationPlan("A?B")).toBeNull();
    expect(createPronunciationPlan("  ")).toBeNull();
  });

  it("provides unique recording metadata for every canonical letter", () => {
    const metadata = Object.values(Letter).map((letter) => ({
      letter,
      pronunciation: getLetterPronunciation(letter),
    }));

    expect(metadata.every(({ pronunciation }) => pronunciation !== null)).toBe(
      true
    );
    const assetKeys = metadata.map(
      ({ pronunciation }) => pronunciation!.assetKey
    );
    expect(new Set(assetKeys).size).toBe(Object.values(Letter).length);
  });

  it("carries each cue's place inside its group", () => {
    const plan = createPronunciationPlan("AB·C");

    expect(plan).not.toBeNull();
    expect(plan!.cues).toMatchObject([
      { assetKey: "a", position: "initial", indexInGroup: 0, groupLength: 2 },
      { assetKey: "b", position: "final", indexInGroup: 1, groupLength: 2 },
      { assetKey: "c", position: "isolated", indexInGroup: 0, groupLength: 1 },
    ]);
  });
});

describe("resolveRecordedCuePaths", () => {
  const plan = createPronunciationPlan("AΣ-")!;

  it("returns contextual files only when the complete phrase is covered", () => {
    const completeManifest: PronunciationManifest = {
      version: 1,
      recordings: {
        a: { initial: "a/initial.wav" },
        "sigma-dash": { final: "sigma-dash/final.wav" },
      },
    };

    expect(resolveRecordedCuePaths(plan.cues, completeManifest)).toEqual([
      "a/initial.wav",
      "sigma-dash/final.wav",
    ]);
  });

  it("rejects the recorded phrase when one contextual file is missing", () => {
    const partialManifest: PronunciationManifest = {
      version: 1,
      recordings: {
        a: { initial: "a/initial.wav" },
        "sigma-dash": { isolated: "sigma-dash/isolated.wav" },
      },
    };

    expect(resolveRecordedCuePaths(plan.cues, partialManifest)).toBeNull();
  });
});
