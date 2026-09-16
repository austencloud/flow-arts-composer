import { describe, expect, it } from "vitest";
import {
  TransitionGraph,
  type ISequenceDataProvider,
  type LetterMappingsJson,
} from "@tka/sequence-engine";
import letterMappings from "../../../static/data/learn/letter-mappings.json";
import {
  analyzeWordTransitions,
  buildWordBridgeDeck,
  findExactPictographChain,
  isRepairAnswerCorrect,
  type WordBridgeGraph,
} from "$lib/features/learn/play/games/word-bridges/domain/word-bridge-questions";

const LETTERS = {
  A: { startPlacementGroup: "alpha", endPlacementGroup: "alpha" },
  B: { startPlacementGroup: "alpha", endPlacementGroup: "beta" },
  C: { startPlacementGroup: "beta", endPlacementGroup: "alpha" },
  D: { startPlacementGroup: "beta", endPlacementGroup: "beta" },
  E: { startPlacementGroup: "beta", endPlacementGroup: "alpha" },
} as const;

const graph: WordBridgeGraph = {
  canFollow(from, to) {
    const left = LETTERS[from as keyof typeof LETTERS];
    const right = LETTERS[to as keyof typeof LETTERS];
    return (
      !!left && !!right && left.endPlacementGroup === right.startPlacementGroup
    );
  },
  getLetterPlacementInfo(letter) {
    return LETTERS[letter as keyof typeof LETTERS] ?? null;
  },
  findAllBridgeOptions(from, to) {
    if (this.canFollow(from, to)) return [];
    return Object.keys(LETTERS).filter(
      (letter) => this.canFollow(from, letter) && this.canFollow(letter, to)
    );
  },
  findBridgeLetters(from, to) {
    return this.findAllBridgeOptions(from, to).slice(0, 1);
  },
};

const available = new Set(Object.keys(LETTERS));
const parseWord = (word: string) => Array.from(word);
const noShuffle = () => 0;
const canonicalProvider: ISequenceDataProvider = {
  async loadLetterMappings() {
    return letterMappings as unknown as LetterMappingsJson;
  },
  async loadLetterVariations() {
    return [];
  },
  isInitialized() {
    return true;
  },
};

describe("analyzeWordTransitions", () => {
  it("distinguishes direct words from words that remain spellable with bridges", () => {
    const direct = analyzeWordTransitions("AB", ["A", "B"], graph);
    const bridged = analyzeWordTransitions("BA", ["B", "A"], graph);

    expect(direct.canRunAsWritten).toBe(true);
    expect(direct.requiredBridgeCount).toBe(0);
    expect(bridged.canRunAsWritten).toBe(false);
    expect(bridged.isSpellable).toBe(true);
    expect(bridged.requiredBridgeCount).toBe(1);
    expect(
      bridged.gaps[0]?.bridgeOptions.map((option) => option.letter)
    ).toEqual(["C", "E"]);
  });

  it("keeps unknown letters unavailable instead of grading them false", () => {
    const analysis = analyzeWordTransitions("AZ", ["A", "Z"], graph);

    expect(analysis.isSpellable).toBe(false);
    expect(analysis.canRunAsWritten).toBe(false);
    expect(analysis.invalidLetters).toEqual(["Z"]);
  });

  it("accepts a one-letter word without inventing a bridge", () => {
    const analysis = analyzeWordTransitions("A", ["A"], graph);

    expect(analysis.isSpellable).toBe(true);
    expect(analysis.canRunAsWritten).toBe(true);
    expect(analysis.requiredBridgeCount).toBe(0);
  });

  it("counts a validated multi-letter fallback path", () => {
    const infos = {
      X: { startPlacementGroup: "alpha", endPlacementGroup: "beta" },
      P: { startPlacementGroup: "beta", endPlacementGroup: "delta" },
      Q: { startPlacementGroup: "delta", endPlacementGroup: "gamma" },
      Y: { startPlacementGroup: "gamma", endPlacementGroup: "alpha" },
    } as const;
    const fallbackGraph: WordBridgeGraph = {
      canFollow(from, to) {
        const left = infos[from as keyof typeof infos];
        const right = infos[to as keyof typeof infos];
        return (
          !!left &&
          !!right &&
          left.endPlacementGroup === right.startPlacementGroup
        );
      },
      getLetterPlacementInfo(letter) {
        return infos[letter as keyof typeof infos] ?? null;
      },
      findAllBridgeOptions() {
        return [];
      },
      findBridgeLetters() {
        return ["P", "Q"];
      },
    };

    const analysis = analyzeWordTransitions("XY", ["X", "Y"], fallbackGraph);

    expect(analysis.isSpellable).toBe(true);
    expect(analysis.requiredBridgeCount).toBe(2);
    expect(
      analysis.gaps[0]?.shortestBridgePath.map((bridge) => bridge.letter)
    ).toEqual(["P", "Q"]);
  });
});

describe("buildWordBridgeDeck", () => {
  it("balances true and false questions from graph-calculated words", () => {
    const deck = buildWordBridgeDeck({
      task: "validity",
      questionCount: 4,
      graph,
      availableLetters: available,
      parseWord,
      words: ["AB", "CB", "DC", "BD", "BA", "AC", "DA", "CD"],
      random: noShuffle,
    });

    expect(deck).toHaveLength(4);
    expect(
      deck.filter((question) => question.analysis.canRunAsWritten)
    ).toHaveLength(2);
    expect(
      deck.filter((question) => !question.analysis.canRunAsWritten)
    ).toHaveLength(2);
  });

  it("builds a varied count deck without hand-authored answers", () => {
    const deck = buildWordBridgeDeck({
      task: "count",
      questionCount: 4,
      graph,
      availableLetters: available,
      parseWord,
      words: ["AB", "BA", "BAC", "BACD"],
      random: noShuffle,
    });

    expect(
      deck
        .map((question) =>
          question.task === "count" ? question.correctAnswer : -1
        )
        .sort()
    ).toEqual([0, 1, 2, 3]);
    expect(
      deck.map((question) =>
        question.task === "count" ? question.correctAnswer : -1
      )
    ).toEqual([0, 1, 2, 3]);
  });

  it("accepts every valid repair and includes distinct failure modes", () => {
    const [question] = buildWordBridgeDeck({
      task: "repair",
      questionCount: 1,
      optionCount: 4,
      graph,
      availableLetters: available,
      parseWord,
      words: ["BA"],
      random: noShuffle,
    });

    if (!question || question.task !== "repair") {
      throw new Error("Expected a repair question");
    }

    expect(isRepairAnswerCorrect(question, "C")).toBe(true);
    expect(isRepairAnswerCorrect(question, "E")).toBe(true);
    expect(isRepairAnswerCorrect(question, "A")).toBe(false);
    expect(
      question.choices.some(
        (choice) => choice.leftConnects && !choice.rightConnects
      )
    ).toBe(true);
    expect(
      question.choices.some(
        (choice) => !choice.leftConnects && choice.rightConnects
      )
    ).toBe(true);
  });
});

describe("findExactPictographChain", () => {
  it("skips first variations when only a later combination connects exactly", () => {
    const pool = new Map([
      [
        "A",
        [
          { id: "a-wrong", startPlacement: "alpha1", endPlacement: "alpha3" },
          { id: "a-right", startPlacement: "alpha1", endPlacement: "beta1" },
        ],
      ],
      [
        "C",
        [
          { id: "c-wrong", startPlacement: "alpha3", endPlacement: "gamma1" },
          { id: "c-right", startPlacement: "beta1", endPlacement: "gamma3" },
        ],
      ],
      ["B", [{ id: "b-right", startPlacement: "gamma3", endPlacement: "beta3" }]],
    ]);

    const chain = findExactPictographChain(["A", "C", "B"], pool);

    expect(chain?.map((pictograph) => pictograph.id)).toEqual([
      "a-right",
      "c-right",
      "b-right",
    ]);
  });
});

describe("canonical transition data", () => {
  it("matches verified bridge fixtures and can fill all three level decks", async () => {
    const canonicalGraph = new TransitionGraph(canonicalProvider);
    await canonicalGraph.initialize();

    const fixtures = [
      ["CAKE", 0],
      ["BO", 1],
      ["DOG", 2],
      ["GAME", 3],
    ] as const;

    for (const [word, expectedCount] of fixtures) {
      const analysis = analyzeWordTransitions(
        word,
        Array.from(word),
        canonicalGraph
      );
      expect(analysis.isSpellable).toBe(true);
      expect(analysis.requiredBridgeCount).toBe(expectedCount);
    }

    expect(canonicalGraph.findAllBridgeOptions("B", "O")).toEqual([
      "Σ",
      "Δ",
      "Θ-",
      "Ω-",
    ]);

    const availableLetters = new Set(canonicalGraph.getAllLetters());
    for (const task of ["validity", "count", "repair"] as const) {
      expect(
        buildWordBridgeDeck({
          task,
          questionCount: 8,
          optionCount: task === "validity" ? 2 : 4,
          graph: canonicalGraph,
          availableLetters,
          parseWord,
          random: noShuffle,
        })
      ).toHaveLength(8);
    }
  });
});
