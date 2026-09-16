import * as TkaDomain from "@tka/domain";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
import type { BridgeTask } from "../../../domain/arcade-types";

export interface WordBridgeGraphLetterInfo {
  startPlacementGroup: string;
  endPlacementGroup: string;
}

/** The narrow transition-graph surface needed by this game. */
export interface WordBridgeGraph {
  canFollow(from: string, to: string): boolean;
  getLetterPlacementInfo(letter: string): WordBridgeGraphLetterInfo | null;
  findAllBridgeOptions(from: string, to: string): string[];
  findBridgeLetters(from: string, to: string): string[];
}

export interface BridgeLetterInfo extends WordBridgeGraphLetterInfo {
  letter: string;
}

export interface WordBridgeGap {
  index: number;
  from: string;
  to: string;
  direct: boolean;
  fromEndPlacementGroup: string;
  toStartPlacementGroup: string;
  /** Every canonical one-letter answer. Empty for direct or multi-letter paths. */
  bridgeOptions: BridgeLetterInfo[];
  /** One shortest path for explanation and bridge counting. */
  shortestBridgePath: BridgeLetterInfo[];
  /** Null means the graph could not connect this pair. */
  bridgeCount: number | null;
}

export interface WordBridgeAnalysis {
  word: string;
  letters: string[];
  canRunAsWritten: boolean;
  isSpellable: boolean;
  requiredBridgeCount: number;
  invalidLetters: string[];
  gaps: WordBridgeGap[];
}

interface BaseBridgeQuestion {
  id: string;
  task: BridgeTask;
  analysis: WordBridgeAnalysis;
}

export interface BridgeValidityQuestion extends BaseBridgeQuestion {
  task: "validity";
  correctAnswer: boolean;
}

export interface BridgeCountQuestion extends BaseBridgeQuestion {
  task: "count";
  correctAnswer: number;
  options: number[];
}

export interface RepairChoice extends BridgeLetterInfo {
  isCorrect: boolean;
  leftConnects: boolean;
  rightConnects: boolean;
}

export interface BridgeRepairQuestion extends BaseBridgeQuestion {
  task: "repair";
  gap: WordBridgeGap;
  choices: RepairChoice[];
  /** Complete canonical answer set, including valid answers not shown this round. */
  validBridges: BridgeLetterInfo[];
}

export type WordBridgeQuestion =
  BridgeValidityQuestion | BridgeCountQuestion | BridgeRepairQuestion;

export interface BuildWordBridgeDeckOptions {
  task: BridgeTask;
  questionCount: number;
  optionCount?: number;
  graph: WordBridgeGraph;
  availableLetters: ReadonlySet<string>;
  parseWord: (word: string) => readonly string[] | null;
  words?: readonly string[];
  random?: () => number;
}

export interface PositionedPictograph {
  readonly startPlacement?: string | null;
  readonly endPlacement?: string | null;
}

const COMMON_WORD_SEEDS = [
  "ALPHA",
  "BACK",
  "BEAT",
  "BOOK",
  "BRIDGE",
  "CARD",
  "CATCH",
  "CLUB",
  "DANCE",
  "DASH",
  "DOG",
  "FIRE",
  "FAKE",
  "FLIP",
  "FLOW",
  "FOCUS",
  "GAME",
  "GLOW",
  "GRID",
  "HAND",
  "LIGHT",
  "LOOP",
  "MOVE",
  "MOON",
  "MOTOR",
  "MOUNT",
  "MUSIC",
  "PATH",
  "PLAY",
  "POI",
  "PROP",
  "PROMPT",
  "PUMP",
  "RAIN",
  "RHYTHM",
  "ROPE",
  "ROOM",
  "ROOT",
  "SHIFT",
  "SPELL",
  "SPIN",
  "SPORT",
  "STAFF",
  "STAGE",
  "STORM",
  "SOUP",
  "SWING",
  "THROW",
  "TWIRL",
  "TROUT",
  "TRUST",
  "WAVE",
  "WIND",
  "WORD",
] as const;

// `@tka/domain` is a built workspace package. The runtime guard keeps this
// source-compatible with a checkout whose shared node_modules junction still
// points at an older package build; the common catalog still fills each challenge.
const exportedBridgeFreeShort = Reflect.get(
  TkaDomain,
  "BRIDGE_FREE_SHORT"
) as unknown;
const bridgeFreeSeeds = Array.isArray(exportedBridgeFreeShort)
  ? exportedBridgeFreeShort.filter(
      (word): word is string => typeof word === "string"
    )
  : [];

/** English seeds only. Every bridge fact is calculated from the live graph. */
export const DEFAULT_WORD_BRIDGE_SEEDS: readonly string[] = Array.from(
  new Set([...bridgeFreeSeeds, "CAKE", ...COMMON_WORD_SEEDS])
);

function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

function asBridgeInfo(
  letter: string,
  graph: WordBridgeGraph
): BridgeLetterInfo | null {
  const info = graph.getLetterPlacementInfo(letter);
  return info ? { letter, ...info } : null;
}

function pathConnects(
  from: string,
  path: readonly string[],
  to: string,
  graph: WordBridgeGraph
): boolean {
  const chain = [from, ...path, to];
  return chain
    .slice(0, -1)
    .every((letter, index) => graph.canFollow(letter, chain[index + 1]!));
}

/**
 * Analyze one parsed word against the canonical transition graph.
 * Invalid letters and unreachable pairs remain distinct from bridge-needed
 * pairs so Challenge 1 never teaches "unavailable" as a false answer.
 */
export function analyzeWordTransitions(
  word: string,
  letters: readonly string[],
  graph: WordBridgeGraph
): WordBridgeAnalysis {
  const normalizedLetters = [...letters];
  const invalidLetters = unique(
    normalizedLetters.filter((letter) => !graph.getLetterPlacementInfo(letter))
  );

  if (invalidLetters.length > 0) {
    return {
      word,
      letters: normalizedLetters,
      canRunAsWritten: false,
      isSpellable: false,
      requiredBridgeCount: 0,
      invalidLetters,
      gaps: [],
    };
  }

  const gaps: WordBridgeGap[] = [];

  for (let index = 0; index < normalizedLetters.length - 1; index++) {
    const from = normalizedLetters[index]!;
    const to = normalizedLetters[index + 1]!;
    const fromInfo = graph.getLetterPlacementInfo(from)!;
    const toInfo = graph.getLetterPlacementInfo(to)!;
    const direct = graph.canFollow(from, to);

    if (direct) {
      gaps.push({
        index,
        from,
        to,
        direct: true,
        fromEndPlacementGroup: fromInfo.endPlacementGroup,
        toStartPlacementGroup: toInfo.startPlacementGroup,
        bridgeOptions: [],
        shortestBridgePath: [],
        bridgeCount: 0,
      });
      continue;
    }

    const bridgeOptions = unique(graph.findAllBridgeOptions(from, to))
      .filter((bridge) => pathConnects(from, [bridge], to, graph))
      .map((bridge) => asBridgeInfo(bridge, graph))
      .filter((info): info is BridgeLetterInfo => info !== null);

    let shortestBridgePath = bridgeOptions[0] ? [bridgeOptions[0]] : [];

    if (shortestBridgePath.length === 0) {
      const path = graph.findBridgeLetters(from, to);
      if (path.length > 0 && pathConnects(from, path, to, graph)) {
        shortestBridgePath = path
          .map((bridge) => asBridgeInfo(bridge, graph))
          .filter((info): info is BridgeLetterInfo => info !== null);
      }
    }

    gaps.push({
      index,
      from,
      to,
      direct: false,
      fromEndPlacementGroup: fromInfo.endPlacementGroup,
      toStartPlacementGroup: toInfo.startPlacementGroup,
      bridgeOptions,
      shortestBridgePath,
      bridgeCount:
        shortestBridgePath.length > 0 ? shortestBridgePath.length : null,
    });
  }

  const isSpellable = gaps.every((gap) => gap.bridgeCount !== null);
  const requiredBridgeCount = gaps.reduce(
    (sum, gap) => sum + (gap.bridgeCount ?? 0),
    0
  );

  return {
    word,
    letters: normalizedLetters,
    canRunAsWritten: isSpellable && gaps.every((gap) => gap.direct),
    isSpellable,
    requiredBridgeCount,
    invalidLetters: [],
    gaps,
  };
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!];
  }
  return copy;
}

function buildAnalyses(
  options: BuildWordBridgeDeckOptions
): WordBridgeAnalysis[] {
  const seen = new Set<string>();
  const analyses: WordBridgeAnalysis[] = [];

  for (const seed of options.words ?? DEFAULT_WORD_BRIDGE_SEEDS) {
    const word = simplifyRepeatedWord(seed.trim().toUpperCase());
    if (!word || seen.has(word)) continue;
    seen.add(word);

    const parsed = options.parseWord(word);
    if (!parsed || parsed.length < 2) continue;

    const analysis = analyzeWordTransitions(word, parsed, options.graph);
    const visualLetters = [
      ...analysis.letters,
      ...analysis.gaps.flatMap((gap) =>
        gap.shortestBridgePath.map((bridge) => bridge.letter)
      ),
    ];

    if (
      analysis.isSpellable &&
      visualLetters.every((letter) => options.availableLetters.has(letter))
    ) {
      analyses.push(analysis);
    }
  }

  return analyses;
}

function buildValidityDeck(
  analyses: readonly WordBridgeAnalysis[],
  questionCount: number,
  random: () => number
): BridgeValidityQuestion[] {
  const direct = shuffled(
    analyses.filter((analysis) => analysis.canRunAsWritten),
    random
  );
  const bridged = shuffled(
    analyses.filter((analysis) => !analysis.canRunAsWritten),
    random
  );
  const directNeeded = Math.ceil(questionCount / 2);
  const bridgedNeeded = Math.floor(questionCount / 2);

  if (direct.length < directNeeded || bridged.length < bridgedNeeded) {
    throw new Error("The word catalog cannot build a balanced bridge check.");
  }

  const questions: BridgeValidityQuestion[] = [];
  for (let index = 0; index < questionCount; index++) {
    const useDirect = index % 2 === 0;
    const analysis = useDirect ? direct.shift() : bridged.shift();
    if (!analysis) break;
    questions.push({
      id: `validity-${analysis.word}`,
      task: "validity",
      analysis,
      correctAnswer: analysis.canRunAsWritten,
    });
  }

  return shuffled(questions, random);
}

function buildCountDeck(
  analyses: readonly WordBridgeAnalysis[],
  questionCount: number,
  random: () => number
): BridgeCountQuestion[] {
  const buckets = new Map<number, WordBridgeAnalysis[]>();
  for (let count = 0; count <= 3; count++) {
    buckets.set(
      count,
      shuffled(
        analyses.filter(
          (analysis) =>
            analysis.letters.length <= 4 &&
            analysis.requiredBridgeCount === count
        ),
        random
      )
    );
  }

  const questions: BridgeCountQuestion[] = [];
  const countOrder = shuffled([0, 1, 2, 3], random);
  while (questions.length < questionCount) {
    let added = false;
    for (const count of countOrder) {
      const analysis = buckets.get(count)?.shift();
      if (!analysis) continue;
      questions.push({
        id: `count-${analysis.word}`,
        task: "count",
        analysis,
        correctAnswer: count,
        options: [0, 1, 2, 3],
      });
      added = true;
      if (questions.length === questionCount) break;
    }
    if (!added) break;
  }

  if (
    questions.length < questionCount ||
    new Set(questions.map((question) => question.correctAnswer)).size < 3
  ) {
    throw new Error("The word catalog cannot build a varied bridge count.");
  }

  // Keep the words fresh inside each band, but let the concept build from
  // direct transitions toward words with several repairs.
  return questions.sort(
    (left, right) => left.correctAnswer - right.correctAnswer
  );
}

function createRepairChoices(
  gap: WordBridgeGap,
  optionCount: number,
  graph: WordBridgeGraph,
  availableLetters: ReadonlySet<string>,
  random: () => number
): { choices: RepairChoice[]; validBridges: BridgeLetterInfo[] } | null {
  const validBridges = gap.bridgeOptions.filter((bridge) =>
    availableLetters.has(bridge.letter)
  );
  if (validBridges.length === 0) return null;

  const validSet = new Set(validBridges.map((bridge) => bridge.letter));
  const validChoiceCount = Math.min(
    validBridges.length,
    Math.max(1, Math.min(2, optionCount - 1))
  );
  const correctChoices: RepairChoice[] = shuffled(validBridges, random)
    .slice(0, validChoiceCount)
    .map((bridge) => ({
      ...bridge,
      isCorrect: true,
      leftConnects: true,
      rightConnects: true,
    }));

  const distractors = shuffled(
    [...availableLetters]
      .filter((letter) => !validSet.has(letter))
      .map((letter) => asBridgeInfo(letter, graph))
      .filter((info): info is BridgeLetterInfo => info !== null)
      .map<RepairChoice>((info) => ({
        ...info,
        isCorrect: false,
        leftConnects: info.startPlacementGroup === gap.fromEndPlacementGroup,
        rightConnects: info.endPlacementGroup === gap.toStartPlacementGroup,
      }))
      .filter((choice) => !choice.leftConnects || !choice.rightConnects),
    random
  );

  const pickedDistractors: RepairChoice[] = [];
  const failureKinds = [
    (choice: RepairChoice) => choice.leftConnects && !choice.rightConnects,
    (choice: RepairChoice) => !choice.leftConnects && choice.rightConnects,
    (choice: RepairChoice) => !choice.leftConnects && !choice.rightConnects,
  ];

  for (const matches of failureKinds) {
    const candidate = distractors.find(
      (choice) =>
        matches(choice) &&
        !pickedDistractors.some((picked) => picked.letter === choice.letter)
    );
    if (candidate) pickedDistractors.push(candidate);
    if (correctChoices.length + pickedDistractors.length >= optionCount) break;
  }

  for (const candidate of distractors) {
    if (correctChoices.length + pickedDistractors.length >= optionCount) break;
    if (
      !pickedDistractors.some((picked) => picked.letter === candidate.letter)
    ) {
      pickedDistractors.push(candidate);
    }
  }

  if (correctChoices.length + pickedDistractors.length < optionCount)
    return null;

  return {
    choices: shuffled(
      [...correctChoices, ...pickedDistractors].slice(0, optionCount),
      random
    ),
    validBridges,
  };
}

function buildRepairDeck(
  analyses: readonly WordBridgeAnalysis[],
  questionCount: number,
  optionCount: number,
  graph: WordBridgeGraph,
  availableLetters: ReadonlySet<string>,
  random: () => number
): BridgeRepairQuestion[] {
  const candidates = shuffled(
    analyses.flatMap((analysis) =>
      analysis.gaps
        .filter((gap) => !gap.direct && gap.bridgeOptions.length > 0)
        .map((gap) => ({ analysis, gap }))
    ),
    random
  );

  const questions: BridgeRepairQuestion[] = [];
  const usedPairs = new Set<string>();
  for (const { analysis, gap } of candidates) {
    const pairKey = `${gap.from}:${gap.to}`;
    if (usedPairs.has(pairKey)) continue;

    const repair = createRepairChoices(
      gap,
      optionCount,
      graph,
      availableLetters,
      random
    );
    if (!repair) continue;

    usedPairs.add(pairKey);
    questions.push({
      id: `repair-${analysis.word}-${gap.index}`,
      task: "repair",
      analysis,
      gap,
      ...repair,
    });
    if (questions.length === questionCount) break;
  }

  if (questions.length < questionCount) {
    throw new Error("The word catalog cannot build enough bridge repairs.");
  }

  return questions;
}

export function buildWordBridgeDeck(
  options: BuildWordBridgeDeckOptions
): WordBridgeQuestion[] {
  if (options.questionCount < 1) {
    throw new Error("A bridge deck needs at least one question.");
  }

  const random = options.random ?? Math.random;
  const analyses = buildAnalyses(options);

  switch (options.task) {
    case "validity":
      return buildValidityDeck(analyses, options.questionCount, random);
    case "count":
      return buildCountDeck(analyses, options.questionCount, random);
    case "repair":
      return buildRepairDeck(
        analyses,
        options.questionCount,
        Math.max(2, options.optionCount ?? 4),
        options.graph,
        options.availableLetters,
        random
      );
  }
}

export function isRepairAnswerCorrect(
  question: BridgeRepairQuestion,
  letter: string
): boolean {
  return question.validBridges.some((bridge) => bridge.letter === letter);
}

/**
 * Pick real pictograph variations whose numbered placements connect exactly.
 * Returns null instead of showing an independently selected, misleading chain.
 */
export function findExactPictographChain<T extends PositionedPictograph>(
  letters: readonly string[],
  pool: ReadonlyMap<string, readonly T[]>
): T[] | null {
  if (letters.length === 0) return [];

  function visit(index: number, chain: T[]): T[] | null {
    if (index >= letters.length) return chain;

    const candidates = pool.get(letters[index]!) ?? [];
    for (const candidate of candidates) {
      if (!candidate.startPlacement || !candidate.endPlacement) continue;

      const previous = chain.at(-1);
      if (previous && previous.endPlacement !== candidate.startPlacement) {
        continue;
      }

      const result = visit(index + 1, [...chain, candidate]);
      if (result) return result;
    }

    return null;
  }

  return visit(0, []);
}
