import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  LEARNING_LETTERS_CORE_WORDS,
  LEARNING_LETTERS_SCHEMA_VERSION,
  LEARNING_LETTERS_TOTAL_STEPS,
  normalizeLearningLettersProgress,
} from "#lib/features/learn/components/interactive/words/learning-letters-progress.js";
import {
  LEARNING_LETTERS_DECK_WORDS,
  LEARNING_LETTER_TEACHING_CONTENT,
} from "#lib/features/learn/components/interactive/words/learning-letter-teaching-content.js";

const { canonicalPool, loadCanonicalTnDBaseSequences } = vi.hoisted(() => ({
  canonicalPool: [] as SequenceData[],
  loadCanonicalTnDBaseSequences: vi.fn(),
}));

vi.mock("#lib/features/browse/gallery-home/canonical-tnd-pool.js", () => ({
  CANONICAL_TND_AUTHOR: "T&D Alphabet",
  loadCanonicalTnDBaseSequences,
  loadCanonicalTnDSequences: vi.fn(async () => []),
  loadCanonicalBookVariations: vi.fn(async () => []),
}));

import { loadFoundingCollectionSequences } from "#lib/features/browse/collections/config/founding-collections.js";

const WORDS_BY_FAMILY: Readonly<Record<string, readonly string[]>> = {
  "split-same": ["AAAA", "BBBB", "CCCC"],
  "tog-same": ["GGGG", "HHHH", "IIII"],
  "quarter-same": ["SSSS", "TTTT", "UUUU", "VVVV"],
  "split-opp": ["JDJD", "KEKE", "LFLF"],
  "tog-opp": ["DJDJ", "EKEK", "FLFL"],
  "quarter-opp": ["MPMP", "NQNQ", "OROR"],
};

function sequence(word: string, familyId: string): SequenceData {
  return {
    id: `tnd-${familyId}-${word.toLowerCase()}`,
    name: word,
    word,
    author: "T&D Alphabet",
    level: 1,
    steps: [],
    thumbnails: [],
    isFavorite: false,
    isCircular: true,
    tags: ["tnd-deck", familyId],
    metadata: { familyId },
  } as SequenceData;
}

describe("Learning Letters founding deck loader", () => {
  beforeEach(() => {
    canonicalPool.splice(
      0,
      canonicalPool.length,
      ...Object.entries(WORDS_BY_FAMILY).flatMap(([familyId, words]) =>
        words.map((word) => sequence(word, familyId))
      )
    );
    loadCanonicalTnDBaseSequences.mockResolvedValue(canonicalPool);
  });

  it("resolves TKA 1 through the founding collection rule", async () => {
    const cards = await loadFoundingCollectionSequences("founding_tka-1");

    expect(cards.map((card) => card.word)).toEqual([
      "AAAA",
      "BBBB",
      "CCCC",
      "GGGG",
      "HHHH",
      "IIII",
      "SSSS",
      "TTTT",
      "UUUU",
      "VVVV",
      "JDJD",
      "KEKE",
      "LFLF",
      "DJDJ",
      "EKEK",
      "FLFL",
      "MPMP",
      "NQNQ",
      "OROR",
    ]);
    expect(new Set(cards.map((card) => card.id)).size).toBe(19);
    expect(loadCanonicalTnDBaseSequences).toHaveBeenCalledOnce();
  });

  it("rejects deck drift instead of presenting a partial lesson", async () => {
    canonicalPool.pop();
    await expect(
      loadFoundingCollectionSequences("founding_tka-1")
    ).rejects.toThrow("resolved 18 cards instead of 19");
  });
});

describe("Learning Letters lesson steps", () => {
  it("walks the guide's six words between the intro and six-word recap", () => {
    expect(LEARNING_LETTERS_CORE_WORDS).toEqual([
      "AAAA",
      "BBBB",
      "CCCC",
      "GGGG",
      "HHHH",
      "IIII",
    ]);
    expect(LEARNING_LETTERS_TOTAL_STEPS).toBe(8);
  });

  it("reserves video and approved-explanation slots for all 19 deck words", () => {
    expect(LEARNING_LETTERS_DECK_WORDS).toEqual(
      Object.values(WORDS_BY_FAMILY).flat()
    );
    expect(LEARNING_LETTER_TEACHING_CONTENT).toHaveLength(19);
    expect(
      LEARNING_LETTER_TEACHING_CONTENT.every(
        (content) => content.video === null && content.explanation === null
      )
    ).toBe(true);
  });
});

describe("Learning Letters progress migration", () => {
  it("resets the rejected quiz-phase shape to the intro step", () => {
    const normalized = normalizeLearningLettersProgress({
      step: 3,
      phaseData: { questionIndex: 2 },
    });

    expect(normalized.migrated).toBe(true);
    expect(normalized.progress).toEqual({
      schemaVersion: LEARNING_LETTERS_SCHEMA_VERSION,
      stepIndex: 0,
    });
  });

  it("resets the superseded v2 deck-browser shape to the intro step", () => {
    const normalized = normalizeLearningLettersProgress({
      step: 1,
      phaseData: {
        schemaVersion: 2,
        selectedSequenceId: "b",
        visitedSequenceIds: ["a", "b"],
      },
    });

    expect(normalized.migrated).toBe(true);
    expect(normalized.progress.stepIndex).toBe(0);
  });

  it("preserves the current step while removing v3 deck-selection state", () => {
    const normalized = normalizeLearningLettersProgress({
      step: 4,
      phaseData: {
        schemaVersion: 3,
        selectedSequenceId: "b",
        visitedSequenceIds: ["a", "stale", "b", "a"],
      },
    });

    expect(normalized.progress).toEqual({
      schemaVersion: LEARNING_LETTERS_SCHEMA_VERSION,
      stepIndex: 3,
    });
    expect(normalized.migrated).toBe(true);
  });

  it("keeps a clean v4 shape without flagging a migration", () => {
    const normalized = normalizeLearningLettersProgress({
      step: 2,
      phaseData: {
        schemaVersion: LEARNING_LETTERS_SCHEMA_VERSION,
      },
    });

    expect(normalized.migrated).toBe(false);
    expect(normalized.progress.stepIndex).toBe(1);
  });

  it("clamps an out-of-range step to the recap", () => {
    const normalized = normalizeLearningLettersProgress({
      step: 99,
      phaseData: {
        schemaVersion: LEARNING_LETTERS_SCHEMA_VERSION,
        selectedSequenceId: "a",
        visitedSequenceIds: ["a"],
      },
    });

    expect(normalized.progress.stepIndex).toBe(
      LEARNING_LETTERS_TOTAL_STEPS - 1
    );
    expect(normalized.migrated).toBe(true);
  });

  it("flags rejected-build residue stored alongside a valid v4 shape", () => {
    const normalized = normalizeLearningLettersProgress({
      step: 1,
      phaseData: {
        schemaVersion: LEARNING_LETTERS_SCHEMA_VERSION,
        questionIndex: 2,
      },
    });

    expect(normalized.migrated).toBe(true);
    expect(normalized.progress.stepIndex).toBe(0);
  });
});
