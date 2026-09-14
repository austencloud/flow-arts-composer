/**
 * Sequence Builder Adapter
 *
 * Provides the same API surface as the old sequence-builder.ts but delegates
 * sequence generation to the shared @tka/sequence-engine package.
 *
 * Functions that are pure MCP glue (detectReversals, parseWordToLetters,
 * generateChainableSequence, buildSequenceForLoop) live here because they
 * aren't part of the engine's public API or have MCP-specific logic.
 */

import {
  buildConstrainedSequence,
  emptyConstraintSet,
  type ConstrainedSequenceResult,
  type ConstrainedBuilderOptions,
  type PictographData,
  type ConstraintSet,
} from "@tka/sequence-engine/generation";
import { getLetterTransitionGraph } from "./letter-transition-graph.js";
import { recalculateAllOrientations } from "./orientation-propagation.js";
import type { HandSide } from "@tka/tka-types";

// Types (re-exported for consumers)

interface MotionData {
  hand?: HandSide;
  startLocation: string;
  endLocation: string;
  motionType: string;
  rotationDirection: string;
  startOrientation?: string;
  endOrientation?: string;
  turns?: number | "fl";
  plane?: string;
}

export interface SequenceStep {
  letter: string;
  variation?: number;
  startPosition: string;
  endPosition: string;
  leftMotion: MotionData;
  rightMotion: MotionData;
  /** Step index in the sequence (matches stepNumber for MCP adapter) */
  stepNumber: number;
  /** Counts the step holds for; the card draws an "N×" badge when it is not 1. */
  duration?: number;
  isBridge?: boolean;
  leftReversal?: boolean;
  rightReversal?: boolean;
}

export interface SequenceResult {
  word: string;
  steps: SequenceStep[];
  startPosition: string;
  endPosition: string;
  isValid: boolean;
  error?: string;
  bridges?: BridgeInfo[];
  bridgeStepIndices?: number[];
}

export interface BridgeSelections {
  [transitionIndex: number]: number;
}

export interface BridgeInfo {
  transitionIndex: number;
  fromLetter: string;
  toLetter: string;
  availableOptions: string[];
  selectedBridge: string;
  selectedIndex: number;
}

// Constants

const TYPE_6_LETTERS = ["α", "β", "γ"];

// Bridge expansion (uses the shared transition graph)

function expandLettersWithBridges(
  letters: string[],
  bridgeSelections?: BridgeSelections,
): { expanded: string[]; bridges: BridgeInfo[]; bridgeIndices: Set<number> } {
  if (letters.length <= 1) {
    return { expanded: letters, bridges: [], bridgeIndices: new Set() };
  }

  const transitionGraph = getLetterTransitionGraph();
  const expanded: string[] = [];
  const bridges: BridgeInfo[] = [];
  const bridgeIndices = new Set<number>();
  let bridgeTransitionIndex = 0;

  for (let i = 0; i < letters.length; i++) {
    const currentLetter = letters[i];
    if (!currentLetter) continue;

    if (i === 0) {
      expanded.push(currentLetter);
      continue;
    }

    const previousLetter = expanded[expanded.length - 1];
    if (!previousLetter) {
      expanded.push(currentLetter);
      continue;
    }

    const availableOptions = transitionGraph.findAllBridgeOptions(previousLetter, currentLetter);

    if (availableOptions.length > 0) {
      const preferredIndex = bridgeSelections?.[bridgeTransitionIndex] ?? 0;
      const selectedIndex = Math.min(preferredIndex, availableOptions.length - 1);
      const selectedBridge = availableOptions[selectedIndex];

      if (selectedBridge) {
        bridgeIndices.add(expanded.length);
        expanded.push(selectedBridge);
        bridges.push({
          transitionIndex: bridgeTransitionIndex,
          fromLetter: previousLetter,
          toLetter: currentLetter,
          availableOptions,
          selectedBridge,
          selectedIndex,
        });
      }
      bridgeTransitionIndex++;
    } else if (!transitionGraph.canFollow(previousLetter, currentLetter)) {
      const bfsPath = transitionGraph.findBridgeLetters(previousLetter, currentLetter);
      for (const bridge of bfsPath) {
        bridgeIndices.add(expanded.length);
        expanded.push(bridge);
      }
    }

    expanded.push(currentLetter);
  }

  return { expanded, bridges, bridgeIndices };
}

// Legacy builder: random walk (no constraints)

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

function makeStep(fields: SequenceStep): SequenceStep {
  return fields;
}

function attemptSequenceBuild(
  letters: string[],
  allPictographs: PictographData[],
  originalWord?: string,
  bridgeIndices?: Set<number>,
): SequenceResult {
  const word = originalWord || letters.join("");
  const steps: SequenceStep[] = [];

  const firstLetter = letters[0];
  if (!firstLetter) {
    return { word, steps: [], startPosition: "", endPosition: "", isValid: false, error: "No first letter" };
  }

  const firstLetterVariations = allPictographs.filter((p) => p.letter === firstLetter);
  if (firstLetterVariations.length === 0) {
    return { word, steps: [], startPosition: "", endPosition: "", isValid: false, error: `No variations found for letter "${firstLetter}"` };
  }

  const firstVariation = pickRandom(firstLetterVariations);
  if (!firstVariation) {
    return { word, steps: [], startPosition: "", endPosition: "", isValid: false, error: "Failed to pick first variation" };
  }

  const firstVariationIndex = firstLetterVariations.indexOf(firstVariation);
  const startPosition = firstVariation.startPosition;

  const validStartPositions = allPictographs.filter(
    (p) => TYPE_6_LETTERS.includes(p.letter) && p.startPosition === startPosition && p.endPosition === startPosition,
  );

  if (validStartPositions.length === 0) {
    return { word, steps: [], startPosition: "", endPosition: "", isValid: false, error: `No Type 6 static letter found at position ${startPosition}` };
  }

  const startPictograph = pickRandom(validStartPositions);
  if (!startPictograph) {
    return { word, steps: [], startPosition: "", endPosition: "", isValid: false, error: "Failed to pick start position" };
  }

  steps.push(makeStep({
    letter: startPictograph.letter,
    variation: 0,
    startPosition: startPictograph.startPosition,
    endPosition: startPictograph.endPosition,
    leftMotion: startPictograph.leftMotion,
    rightMotion: startPictograph.rightMotion,
    stepNumber: 0,
  }));

  steps.push(makeStep({
    letter: firstVariation.letter,
    variation: firstVariationIndex,
    startPosition: firstVariation.startPosition,
    endPosition: firstVariation.endPosition,
    leftMotion: firstVariation.leftMotion,
    rightMotion: firstVariation.rightMotion,
    stepNumber: 1,
    isBridge: false,
  }));

  let currentEndPosition = firstVariation.endPosition;

  for (let i = 1; i < letters.length; i++) {
    const letter = letters[i];
    if (!letter) continue;

    const variations = allPictographs.filter(
      (p) => p.letter === letter && p.startPosition === currentEndPosition,
    );

    if (variations.length === 0) {
      return { word, steps: [], startPosition: "", endPosition: "", isValid: false, error: `No valid continuation for letter "${letter}" from position ${currentEndPosition}` };
    }

    const chosenVariation = pickRandom(variations);
    if (!chosenVariation) {
      return { word, steps: [], startPosition: "", endPosition: "", isValid: false, error: `Failed to pick variation for letter "${letter}"` };
    }

    const allLetterVariations = allPictographs.filter((p) => p.letter === letter);
    const variationIndex = allLetterVariations.indexOf(chosenVariation);

    steps.push(makeStep({
      letter: chosenVariation.letter,
      variation: variationIndex >= 0 ? variationIndex : 0,
      startPosition: chosenVariation.startPosition,
      endPosition: chosenVariation.endPosition,
      leftMotion: chosenVariation.leftMotion,
      rightMotion: chosenVariation.rightMotion,
      stepNumber: i + 1,
      isBridge: bridgeIndices?.has(i) ?? false,
    }));

    currentEndPosition = chosenVariation.endPosition;
  }

  return { word, steps, startPosition, endPosition: currentEndPosition, isValid: true };
}

/**
 * Build a valid sequence from a list of letters using the legacy random-walk builder.
 * Automatically inserts bridge letters and recalculates orientations.
 */
export function buildSequenceFromLetters(
  letters: string[],
  allPictographs: PictographData[],
  maxAttempts: number = 500,
  bridgeSelections?: BridgeSelections,
  skipBridges: boolean = false,
): SequenceResult {
  if (letters.length === 0) {
    return { word: "", steps: [], startPosition: "", endPosition: "", isValid: false, error: "No letters provided" };
  }

  let expandedLetters: string[];
  let bridges: BridgeInfo[] = [];
  let bridgeIndices = new Set<number>();

  if (skipBridges) {
    expandedLetters = letters;
  } else {
    const expansion = expandLettersWithBridges(letters, bridgeSelections);
    expandedLetters = expansion.expanded;
    bridges = expansion.bridges;
    bridgeIndices = expansion.bridgeIndices;
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = attemptSequenceBuild(expandedLetters, allPictographs, letters.join(""), bridgeIndices);
    if (result.isValid) {
      const finalResult = recalculateAllOrientations(result);
      finalResult.bridges = bridges;
      return finalResult;
    }
  }

  return {
    word: letters.join(""),
    steps: [],
    startPosition: "",
    endPosition: "",
    isValid: false,
    error: `Failed to generate valid sequence after ${maxAttempts} attempts`,
    bridges,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// End-constrained builder (for LOOP compatibility)
// ─────────────────────────────────────────────────────────────────────────────

function attemptSequenceBuildWithEndConstraint(
  letters: string[],
  allPictographs: PictographData[],
  targetEndPositions: Set<string>,
  originalWord?: string,
  bridgeIndices?: Set<number>,
): SequenceResult {
  const word = originalWord || letters.join("");

  if (letters.length === 1) {
    const letter = letters[0]!;
    const validVariations = allPictographs.filter(
      (p) => p.letter === letter && targetEndPositions.has(p.endPosition),
    );
    if (validVariations.length === 0) {
      return { word, steps: [], startPosition: "", endPosition: "", isValid: false, error: `No variation of "${letter}" ends at target positions` };
    }
    const chosen = pickRandom(validVariations)!;
    const startPosition = chosen.startPosition;
    const validStartPositions = allPictographs.filter(
      (p) => TYPE_6_LETTERS.includes(p.letter) && p.startPosition === startPosition && p.endPosition === startPosition,
    );
    if (validStartPositions.length === 0) {
      return { word, steps: [], startPosition: "", endPosition: "", isValid: false, error: `No Type 6 static letter found at position ${startPosition}` };
    }
    const startPictograph = pickRandom(validStartPositions)!;
    const allLetterVariations = allPictographs.filter((p) => p.letter === letter);
    const variationIndex = allLetterVariations.indexOf(chosen);
    return {
      word,
      steps: [
        makeStep({ letter: startPictograph.letter, variation: 0, startPosition: startPictograph.startPosition, endPosition: startPictograph.endPosition, leftMotion: startPictograph.leftMotion, rightMotion: startPictograph.rightMotion, stepNumber: 0 }),
        makeStep({ letter: chosen.letter, variation: variationIndex >= 0 ? variationIndex : 0, startPosition: chosen.startPosition, endPosition: chosen.endPosition, leftMotion: chosen.leftMotion, rightMotion: chosen.rightMotion, stepNumber: 1, isBridge: false }),
      ],
      startPosition,
      endPosition: chosen.endPosition,
      isValid: true,
    };
  }

  const steps: SequenceStep[] = [];
  const firstLetter = letters[0]!;
  const firstLetterVariations = allPictographs.filter((p) => p.letter === firstLetter);
  if (firstLetterVariations.length === 0) {
    return { word, steps: [], startPosition: "", endPosition: "", isValid: false, error: `No variations found for letter "${firstLetter}"` };
  }

  const firstVariation = pickRandom(firstLetterVariations)!;
  const firstVariationIndex = firstLetterVariations.indexOf(firstVariation);
  const startPosition = firstVariation.startPosition;

  const validStartPositions = allPictographs.filter(
    (p) => TYPE_6_LETTERS.includes(p.letter) && p.startPosition === startPosition && p.endPosition === startPosition,
  );
  if (validStartPositions.length === 0) {
    return { word, steps: [], startPosition: "", endPosition: "", isValid: false, error: `No Type 6 static letter found at position ${startPosition}` };
  }

  const startPictograph = pickRandom(validStartPositions)!;
  steps.push(makeStep({ letter: startPictograph.letter, variation: 0, startPosition: startPictograph.startPosition, endPosition: startPictograph.endPosition, leftMotion: startPictograph.leftMotion, rightMotion: startPictograph.rightMotion, stepNumber: 0 }));
  steps.push(makeStep({ letter: firstVariation.letter, variation: firstVariationIndex, startPosition: firstVariation.startPosition, endPosition: firstVariation.endPosition, leftMotion: firstVariation.leftMotion, rightMotion: firstVariation.rightMotion, stepNumber: 1, isBridge: false }));

  let currentEndPosition = firstVariation.endPosition;

  for (let i = 1; i < letters.length - 1; i++) {
    const letter = letters[i]!;
    const variations = allPictographs.filter(
      (p) => p.letter === letter && p.startPosition === currentEndPosition,
    );
    if (variations.length === 0) {
      return { word, steps: [], startPosition: "", endPosition: "", isValid: false, error: `No valid continuation for letter "${letter}" from position ${currentEndPosition}` };
    }
    const chosenVariation = pickRandom(variations)!;
    const allLetterVariations = allPictographs.filter((p) => p.letter === letter);
    const variationIndex = allLetterVariations.indexOf(chosenVariation);
    steps.push(makeStep({
      letter: chosenVariation.letter,
      variation: variationIndex >= 0 ? variationIndex : 0,
      startPosition: chosenVariation.startPosition,
      endPosition: chosenVariation.endPosition,
      leftMotion: chosenVariation.leftMotion,
      rightMotion: chosenVariation.rightMotion,
      stepNumber: i + 1,
      isBridge: bridgeIndices?.has(i) ?? false,
    }));
    currentEndPosition = chosenVariation.endPosition;
  }

  const lastLetter = letters[letters.length - 1]!;
  const lastLetterValidVariations = allPictographs.filter(
    (p) => p.letter === lastLetter && p.startPosition === currentEndPosition && targetEndPositions.has(p.endPosition),
  );
  if (lastLetterValidVariations.length === 0) {
    return { word, steps: [], startPosition: "", endPosition: "", isValid: false, error: `No variation of "${lastLetter}" from ${currentEndPosition} ends at target positions` };
  }

  const lastVariation = pickRandom(lastLetterValidVariations)!;
  const allLastLetterVariations = allPictographs.filter((p) => p.letter === lastLetter);
  const lastVariationIndex = allLastLetterVariations.indexOf(lastVariation);
  steps.push(makeStep({
    letter: lastVariation.letter,
    variation: lastVariationIndex >= 0 ? lastVariationIndex : 0,
    startPosition: lastVariation.startPosition,
    endPosition: lastVariation.endPosition,
    leftMotion: lastVariation.leftMotion,
    rightMotion: lastVariation.rightMotion,
    stepNumber: letters.length,
    isBridge: bridgeIndices?.has(letters.length - 1) ?? false,
  }));

  return { word, steps, startPosition, endPosition: lastVariation.endPosition, isValid: true };
}

export function buildSequenceWithEndConstraint(
  letters: string[],
  allPictographs: PictographData[],
  targetEndPositions: string[],
  maxAttempts: number = 500,
): SequenceResult {
  if (letters.length === 0) {
    return { word: "", steps: [], startPosition: "", endPosition: "", isValid: false, error: "No letters provided" };
  }
  if (targetEndPositions.length === 0) {
    return { word: letters.join(""), steps: [], startPosition: "", endPosition: "", isValid: false, error: "No target end positions specified" };
  }

  const targetSet = new Set(targetEndPositions);
  const { expanded: expandedLetters, bridges, bridgeIndices } = expandLettersWithBridges(letters);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = attemptSequenceBuildWithEndConstraint(expandedLetters, allPictographs, targetSet, letters.join(""), bridgeIndices);
    if (result.isValid) {
      const finalResult = recalculateAllOrientations(result);
      finalResult.bridges = bridges;
      return finalResult;
    }
  }

  return {
    word: letters.join(""),
    steps: [],
    startPosition: "",
    endPosition: "",
    isValid: false,
    error: `Failed to generate sequence ending at target positions (${targetEndPositions.join(", ")}) after ${maxAttempts} attempts`,
    bridges,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LOOP-constrained builder
// ─────────────────────────────────────────────────────────────────────────────

export interface LoopConstraint {
  loopType: "rewound" | "rotated";
  period: "halved" | "quartered";
  noBridges?: boolean;
}

function extractPositionGroup(position: string): string {
  const match = position.match(/^([a-z]+)\d+$/);
  return match?.[1] || "";
}

function computeValidEndPositionsForRotatedLoop(
  startPosition: string,
  period: "halved" | "quartered",
): string[] {
  const match = startPosition.match(/^([a-z]+)(\d+)$/);
  if (!match) return [];

  const [, group, numStr] = match;
  const num = parseInt(numStr!, 10);

  let groupSize = 8;
  let baseOffset = 0;

  if (group === "gamma" || group === "zeta" || group === "eta") {
    if (num > 8) {
      baseOffset = 8;
      groupSize = 8;
    }
  }

  const normalizedNum = num - baseOffset;
  const validEndPositions: string[] = [];

  if (period === "halved") {
    const halfRotated = ((normalizedNum - 1 + 4) % groupSize) + 1 + baseOffset;
    validEndPositions.push(`${group}${halfRotated}`);
  } else {
    const cwRotated = ((normalizedNum - 1 + 2) % groupSize) + 1 + baseOffset;
    const ccwRotated = ((normalizedNum - 1 + 6) % groupSize) + 1 + baseOffset;
    validEndPositions.push(`${group}${cwRotated}`);
    if (cwRotated !== ccwRotated) {
      validEndPositions.push(`${group}${ccwRotated}`);
    }
  }

  return validEndPositions;
}

export function buildSequenceForLoop(
  letters: string[],
  allPictographs: PictographData[],
  loopConstraint: LoopConstraint,
  maxAttempts: number = 500,
): SequenceResult {
  if (loopConstraint.loopType === "rewound") {
    return buildSequenceFromLetters(letters, allPictographs, maxAttempts);
  }

  if (letters.length === 0) {
    return { word: "", steps: [], startPosition: "", endPosition: "", isValid: false, error: "No letters provided" };
  }

  let lastEndPosition = "";
  let lastValidEndPositions: string[] = [];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const baseResult = buildSequenceFromLetters(letters, allPictographs, 1, undefined, loopConstraint.noBridges);
    if (!baseResult.isValid) continue;

    const startPosition = baseResult.startPosition;
    const endPosition = baseResult.endPosition;
    const validEndPositions = computeValidEndPositionsForRotatedLoop(startPosition, loopConstraint.period);

    lastEndPosition = endPosition;
    lastValidEndPositions = validEndPositions;

    if (validEndPositions.includes(endPosition)) {
      const actualFirstStepStart = baseResult.steps[0]?.startPosition;
      const actualLastStepEnd = baseResult.steps[baseResult.steps.length - 1]?.endPosition;
      if (actualFirstStepStart !== startPosition || actualLastStepEnd !== endPosition) {
        continue;
      }
      return baseResult;
    }
  }

  if (loopConstraint.noBridges) {
    return {
      word: letters.join(""),
      steps: [],
      startPosition: "",
      endPosition: "",
      isValid: false,
      error: `After ${maxAttempts} attempts, sequence ends at ${lastEndPosition} but needs ${lastValidEndPositions.join(" or ")} for LOOP`,
    };
  }

  // Fallback: try with end-position constraint
  const lastResult = buildSequenceFromLetters(letters, allPictographs, 1);
  if (lastResult.isValid) {
    const validEnds = computeValidEndPositionsForRotatedLoop(lastResult.startPosition, loopConstraint.period);
    if (validEnds.length > 0) {
      // Try to add bridge letters to reach a valid end position
      const bridgeCandidates: Array<{ letter: PictographData; targetPosition: string }> = [];
      for (const targetPos of validEnds) {
        const bridges = allPictographs.filter(
          (p) => p.startPosition === lastResult.endPosition && p.endPosition === targetPos,
        );
        for (const bridge of bridges) {
          bridgeCandidates.push({ letter: bridge, targetPosition: targetPos });
        }
      }

      if (bridgeCandidates.length > 0) {
        const chosen = bridgeCandidates[Math.floor(Math.random() * bridgeCandidates.length)]!;
        const bridgeLetter = chosen.letter;
        const steps = [...lastResult.steps];
        const allBridgeVariations = allPictographs.filter((p) => p.letter === bridgeLetter.letter);
        const bridgeIndex = allBridgeVariations.indexOf(bridgeLetter);

        steps.push(makeStep({
          letter: bridgeLetter.letter,
          variation: bridgeIndex >= 0 ? bridgeIndex : 0,
          startPosition: bridgeLetter.startPosition,
          endPosition: bridgeLetter.endPosition,
          leftMotion: bridgeLetter.leftMotion,
          rightMotion: bridgeLetter.rightMotion,
          stepNumber: steps.length,
          isBridge: true,
        }));

        const result: SequenceResult = {
          word: lastResult.word + bridgeLetter.letter,
          steps,
          startPosition: lastResult.startPosition,
          endPosition: bridgeLetter.endPosition,
          isValid: true,
          bridges: [
            ...(lastResult.bridges || []),
            {
              transitionIndex: (lastResult.bridges?.length || 0),
              fromLetter: lastResult.steps[lastResult.steps.length - 1]?.letter || "",
              toLetter: "(LOOP)",
              availableOptions: bridgeCandidates.map((c) => c.letter.letter),
              selectedBridge: bridgeLetter.letter,
              selectedIndex: 0,
            },
          ],
        };

        return recalculateAllOrientations(result);
      }
    }
  }

  return {
    word: letters.join(""),
    steps: [],
    startPosition: "",
    endPosition: "",
    isValid: false,
    error: `Could not build any LOOP-compatible sequence for ${letters.join("")}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a word string into individual letters.
 * Handles Greek letters and dash suffixes (W-, Σ-, etc.).
 */
export function parseWordToLetters(word: string): string[] {
  const letters: string[] = [];
  let i = 0;

  while (i < word.length) {
    const char = word[i];
    if (!char) {
      i++;
      continue;
    }

    const nextChar = word[i + 1];
    if (nextChar === "-") {
      letters.push(char + "-");
      i += 2;
    } else {
      letters.push(char);
      i++;
    }
  }

  return letters;
}

/**
 * Generate a random sequence of letters that naturally chain together.
 * Uses the transition graph so no bridge letters are needed.
 */
export function generateChainableSequence(
  length: number,
  excludeLetters: string[] = ["α", "β", "γ"],
): string[] {
  if (length <= 0) return [];

  const transitionGraph = getLetterTransitionGraph();
  const excludeSet = new Set(excludeLetters);
  const allLetters = transitionGraph.getAllLetters(excludeSet);

  if (allLetters.length === 0) {
    console.error("[generateChainableSequence] No letters available!");
    return [];
  }

  const result: string[] = [];
  const firstLetter = allLetters[Math.floor(Math.random() * allLetters.length)]!;
  result.push(firstLetter);

  for (let i = 1; i < length; i++) {
    const prevLetter = result[i - 1]!;
    const validSuccessors = transitionGraph
      .getValidSuccessors(prevLetter)
      .filter((letter) => !excludeSet.has(letter));

    if (validSuccessors.length === 0) {
      console.error(`[generateChainableSequence] No successors for "${prevLetter}", retrying...`);
      return generateChainableSequence(length, excludeLetters);
    }

    const nextLetter = validSuccessors[Math.floor(Math.random() * validSuccessors.length)]!;
    result.push(nextLetter);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reversal detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect reversals for all steps in a sequence.
 * A reversal occurs when the rotation direction changes between consecutive steps.
 */
export function detectReversals(steps: SequenceStep[]): SequenceStep[] {
  if (steps.length === 0) return steps;

  return steps.map((step, index) => {
    if (index === 0) {
      return { ...step, leftReversal: false, rightReversal: false };
    }

    const previousSteps = steps.slice(0, index);
    const lastLeftRotDir = getLastValidRotationDirection(previousSteps, "left");
    const lastRightRotDir = getLastValidRotationDirection(previousSteps, "right");
    const currentLeftRotDir = getRotationDirection(step, "left");
    const currentRightRotDir = getRotationDirection(step, "right");
    const leftReversal = isReversal(lastLeftRotDir, currentLeftRotDir);
    const rightReversal = isReversal(lastRightRotDir, currentRightRotDir);

    return { ...step, leftReversal, rightReversal };
  });
}

function getLastValidRotationDirection(steps: SequenceStep[], hand: HandSide): string | null {
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (!step) continue;
    const rotDir = getRotationDirection(step, hand);
    if (rotDir && rotDir !== "no_rotation" && rotDir !== "noRotation") {
      return rotDir;
    }
  }
  return null;
}

function getRotationDirection(step: SequenceStep, hand: HandSide): string | null {
  const motion = hand === "left" ? step.leftMotion : step.rightMotion;
  if (!motion) return null;
  if (motion.motionType === "static") return "no_rotation";
  return motion.rotationDirection || null;
}

function isReversal(lastRotDir: string | null, currentRotDir: string | null): boolean {
  if (!lastRotDir || !currentRotDir) return false;
  if (lastRotDir === "no_rotation" || lastRotDir === "noRotation") return false;
  if (currentRotDir === "no_rotation" || currentRotDir === "noRotation") return false;
  return normalizeRotationDirection(lastRotDir) !== normalizeRotationDirection(currentRotDir);
}

function normalizeRotationDirection(rotDir: string): string {
  const lower = rotDir.toLowerCase();
  if (lower === "cw" || lower === "clockwise") return "cw";
  if (lower === "ccw" || lower === "counterclockwise" || lower === "counter-clockwise") return "ccw";
  return lower;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type bridge: MCP SequenceStep ↔ engine Step
//
// The engine uses `motions: { left, right }` while MCP's SequenceStep uses
// flat `leftMotion`/`rightMotion`. These converters bridge the two at
// function-call boundaries.
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mcpStepsToEngineSteps(steps: SequenceStep[]): any[] {
  return steps.map((s, i) => ({
    id: `mcp-${i}`,
    letter: s.letter || null,
    startPosition: s.startPosition || null,
    endPosition: s.endPosition || null,
    motions: { left: s.leftMotion, right: s.rightMotion },
    stepNumber: s.stepNumber ?? i,
    duration: s.duration ?? 1,
    isBridge: s.isBridge,
    variation: s.variation,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function engineStepsToMcpSteps(steps: any[]): SequenceStep[] {
  return steps.map((s: any, i: number) => ({
    letter: String(s.letter ?? ""),
    startPosition: String(s.startPosition ?? ""),
    endPosition: String(s.endPosition ?? ""),
    leftMotion: (s.motions?.left ?? s.leftMotion) as SequenceStep["leftMotion"],
    rightMotion: (s.motions?.right ?? s.rightMotion) as SequenceStep["rightMotion"],
    stepNumber: s.stepNumber ?? i,
    duration: s.duration,
    isBridge: s.isBridge,
    variation: s.variation,
  }));
}
