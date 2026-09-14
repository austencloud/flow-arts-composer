/**
 * Sequence Builder for MCP Server
 *
 * Builds valid TKA sequences by chaining pictograph variations.
 * Ensures position continuity: end position of step N = start position of step N+1.
 *
 * Key changes for parity with main app:
 * 1. Filter by position only (not orientation) during selection
 * 2. Use bridge letters when direct transitions aren't possible
 * 3. Recalculate orientations after the full sequence is built
 */

import { getLetterTransitionGraph } from "./letter-transition-graph.js";
import { recalculateAllOrientations } from "./orientation-propagation.js";
import { Period } from "@tka/sequence-engine/loop";

interface MotionData {
  hand: "left" | "right";
  startLocation: string;
  endLocation: string;
  motionType: string;
  rotationDirection: string;
  startOrientation: string; // "in" | "out" | "clock" | "counter"
  endOrientation: string; // "in" | "out" | "clock" | "counter"
  turns?: number | "fl";
}

interface PictographData {
  letter: string;
  startPosition: string;
  endPosition: string;
  timing: string;
  direction: string;
  leftMotion: MotionData;
  rightMotion: MotionData;
}

export interface SequenceStep {
  letter: string;
  variation: number;
  startPosition: string;
  endPosition: string;
  leftMotion: MotionData;
  rightMotion: MotionData;
  stepNumber: number;
  /** Counts the step holds for; the card draws an "N×" badge when it is not 1. */
  duration?: number;
  /** Whether this step is a bridge letter (interpolated, not user-requested) */
  isBridge?: boolean;
  /** Whether the left-hand motion has a reversal (direction change from previous step) */
  leftReversal?: boolean;
  /** Whether the right-hand motion has a reversal (direction change from previous step) */
  rightReversal?: boolean;
}

export interface SequenceResult {
  word: string;
  steps: SequenceStep[];
  startPosition: string;
  endPosition: string;
  isValid: boolean;
  error?: string;
  /** Information about bridge letters used in the sequence */
  bridges?: BridgeInfo[];
  /** Indices of steps that are bridge letters (from constrained builder) */
  bridgeStepIndices?: number[];
}

/**
 * Type 6 static letters - valid for starting positions
 */
const TYPE_6_LETTERS = ["α", "β", "γ"];

/**
 * Bridge selection options for sequence building.
 * Maps transition index (0-based) to preferred bridge index.
 * Example: { 0: 2 } means "for the first transition needing a bridge, use the 3rd option"
 */
export interface BridgeSelections {
  [transitionIndex: number]: number;
}

/**
 * Information about bridges used in a sequence.
 */
export interface BridgeInfo {
  /** Index of the transition (which gap between letters) */
  transitionIndex: number;
  /** The letter before the bridge */
  fromLetter: string;
  /** The letter after the bridge */
  toLetter: string;
  /** All available bridge options for this transition */
  availableOptions: string[];
  /** The bridge letter that was selected */
  selectedBridge: string;
  /** Index of the selected bridge in availableOptions */
  selectedIndex: number;
}

/**
 * Expand letters with bridge letters where direct transitions aren't possible.
 * Uses BFS via LetterTransitionGraph to find shortest bridge paths.
 * @param letters - The letters to expand
 * @param bridgeSelections - Optional map of transition index to preferred bridge index
 * @returns Object with expanded letters and bridge info
 */
function expandLettersWithBridges(
  letters: string[],
  bridgeSelections?: BridgeSelections
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

    // Check if we need bridge letters
    const availableOptions = transitionGraph.findAllBridgeOptions(
      previousLetter,
      currentLetter
    );

    if (availableOptions.length > 0) {
      // We need a bridge - select based on bridgeSelections or default to first
      const preferredIndex = bridgeSelections?.[bridgeTransitionIndex] ?? 0;
      const selectedIndex = Math.min(
        preferredIndex,
        availableOptions.length - 1
      );
      const selectedBridge = availableOptions[selectedIndex];

      if (selectedBridge) {
        // Track this index as a bridge letter
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
      // No single-letter bridge available, fall back to BFS path
      const bfsPath = transitionGraph.findBridgeLetters(
        previousLetter,
        currentLetter
      );
      for (const bridge of bfsPath) {
        // Track all BFS path letters as bridges
        bridgeIndices.add(expanded.length);
        expanded.push(bridge);
      }
      // Note: multi-letter bridges don't support selection (rare case)
    }

    // Add the target letter
    expanded.push(currentLetter);
  }

  return { expanded, bridges, bridgeIndices };
}

/**
 * Build a valid sequence from a list of letters.
 * Uses random selection with backtracking if needed.
 * Automatically inserts bridge letters and recalculates orientations.
 * @param letters - Array of letters to build sequence from
 * @param allPictographs - All available pictograph data
 * @param maxAttempts - Maximum attempts to find valid sequence
 * @param bridgeSelections - Optional map of transition index to preferred bridge index
 */
export function buildSequenceFromLetters(
  letters: string[],
  allPictographs: PictographData[],
  maxAttempts: number = 500,
  bridgeSelections?: BridgeSelections,
  skipBridges: boolean = false
): SequenceResult {
  if (letters.length === 0) {
    return {
      word: "",
      steps: [],
      startPosition: "",
      endPosition: "",
      isValid: false,
      error: "No letters provided",
    };
  }

  // Expand letters with bridges for position continuity (unless skipped)
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

  // Try multiple times to find a valid sequence
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = attemptSequenceBuild(
      expandedLetters,
      allPictographs,
      letters.join(""),
      bridgeIndices
    );
    if (result.isValid) {
      // CRITICAL: Recalculate orientations after successful build
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

function attemptSequenceBuild(
  letters: string[],
  allPictographs: PictographData[],
  originalWord?: string,
  bridgeIndices?: Set<number>
): SequenceResult {
  const word = originalWord || letters.join("");
  const steps: SequenceStep[] = [];

  // Step 1: Pick a random variation of the first letter
  const firstLetter = letters[0];
  if (!firstLetter) {
    return {
      word,
      steps: [],
      startPosition: "",
      endPosition: "",
      isValid: false,
      error: "No first letter",
    };
  }

  const firstLetterVariations = allPictographs.filter(
    (p) => p.letter === firstLetter
  );

  if (firstLetterVariations.length === 0) {
    return {
      word,
      steps: [],
      startPosition: "",
      endPosition: "",
      isValid: false,
      error: `No variations found for letter "${firstLetter}"`,
    };
  }

  const firstVariation = pickRandom(firstLetterVariations);
  if (!firstVariation) {
    return {
      word,
      steps: [],
      startPosition: "",
      endPosition: "",
      isValid: false,
      error: "Failed to pick first variation",
    };
  }

  // Find the variation index
  const firstVariationIndex = firstLetterVariations.indexOf(firstVariation);

  // Add start position step (Type 6 static letter)
  const startPosition = firstVariation.startPosition;

  // Find a valid start position (Type 6 static letter at the required position)
  // Filter by position only - orientations will be recalculated after sequence build
  const validStartPositions = allPictographs.filter((p) => {
    // Must be a Type 6 static letter at the same position
    return (
      TYPE_6_LETTERS.includes(p.letter) &&
      p.startPosition === startPosition &&
      p.endPosition === startPosition
    );
  });

  if (validStartPositions.length === 0) {
    return {
      word,
      steps: [],
      startPosition: "",
      endPosition: "",
      isValid: false,
      error: `No Type 6 static letter found at position ${startPosition}`,
    };
  }

  const startPictograph = pickRandom(validStartPositions);
  if (!startPictograph) {
    return {
      word,
      steps: [],
      startPosition: "",
      endPosition: "",
      isValid: false,
      error: "Failed to pick start position",
    };
  }

  // Add start position as step 0
  steps.push({
    letter: startPictograph.letter,
    variation: 0,
    startPosition: startPictograph.startPosition,
    endPosition: startPictograph.endPosition,
    leftMotion: startPictograph.leftMotion,
    rightMotion: startPictograph.rightMotion,
    stepNumber: 0,
  });

  // Add first letter as step 1 (first letter is never a bridge)
  steps.push({
    letter: firstVariation.letter,
    variation: firstVariationIndex,
    startPosition: firstVariation.startPosition,
    endPosition: firstVariation.endPosition,
    leftMotion: firstVariation.leftMotion,
    rightMotion: firstVariation.rightMotion,
    stepNumber: 1,
    isBridge: false,
  });

  // Walk through remaining letters
  // Track position only - orientations will be recalculated after sequence build
  let currentEndPosition = firstVariation.endPosition;

  for (let i = 1; i < letters.length; i++) {
    const letter = letters[i];
    if (!letter) continue;

    // Find variations that start where we currently are (position only)
    const variations = allPictographs.filter(
      (p) => p.letter === letter && p.startPosition === currentEndPosition
    );

    if (variations.length === 0) {
      return {
        word,
        steps: [],
        startPosition: "",
        endPosition: "",
        isValid: false,
        error: `No valid continuation for letter "${letter}" from position ${currentEndPosition}`,
      };
    }

    const chosenVariation = pickRandom(variations);
    if (!chosenVariation) {
      return {
        word,
        steps: [],
        startPosition: "",
        endPosition: "",
        isValid: false,
        error: `Failed to pick variation for letter "${letter}"`,
      };
    }

    // Find variation index
    const allLetterVariations = allPictographs.filter(
      (p) => p.letter === letter
    );
    const variationIndex = allLetterVariations.indexOf(chosenVariation);

    steps.push({
      letter: chosenVariation.letter,
      variation: variationIndex >= 0 ? variationIndex : 0,
      startPosition: chosenVariation.startPosition,
      endPosition: chosenVariation.endPosition,
      leftMotion: chosenVariation.leftMotion,
      rightMotion: chosenVariation.rightMotion,
      stepNumber: i + 1,
      isBridge: bridgeIndices?.has(i) ?? false,
    });

    // Update current position for next iteration
    currentEndPosition = chosenVariation.endPosition;
  }

  return {
    word,
    steps,
    startPosition: startPosition,
    endPosition: currentEndPosition,
    isValid: true,
  };
}

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * items.length);
  return items[randomIndex] ?? null;
}

/**
 * Build a sequence that ends at one of the specified target positions.
 * Used for LOOP-constrained generation where the end position must be
 * compatible with the LOOP transformation.
 *
 * Strategy:
 * 1. Build all letters except the last one normally
 * 2. For the last letter, only pick variations that end at a target position
 * 3. If no variation of the last letter works, backtrack and try different
 *    variations of earlier letters
 * @param letters - Array of letters to build sequence from
 * @param allPictographs - All available pictograph data
 * @param targetEndPositions - Valid end positions for LOOP compatibility
 * @param maxAttempts - Maximum attempts to find valid sequence
 */
export function buildSequenceWithEndConstraint(
  letters: string[],
  allPictographs: PictographData[],
  targetEndPositions: string[],
  maxAttempts: number = 500
): SequenceResult {
  if (letters.length === 0) {
    return {
      word: "",
      steps: [],
      startPosition: "",
      endPosition: "",
      isValid: false,
      error: "No letters provided",
    };
  }

  if (targetEndPositions.length === 0) {
    return {
      word: letters.join(""),
      steps: [],
      startPosition: "",
      endPosition: "",
      isValid: false,
      error: "No target end positions specified",
    };
  }

  const targetSet = new Set(targetEndPositions);

  // Expand letters with bridges for position continuity
  const {
    expanded: expandedLetters,
    bridges,
    bridgeIndices,
  } = expandLettersWithBridges(letters);

  // Try multiple times to find a valid sequence ending at a target position
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = attemptSequenceBuildWithEndConstraint(
      expandedLetters,
      allPictographs,
      targetSet,
      letters.join(""),
      bridgeIndices
    );
    if (result.isValid) {
      // CRITICAL: Recalculate orientations after successful build
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

function attemptSequenceBuildWithEndConstraint(
  letters: string[],
  allPictographs: PictographData[],
  targetEndPositions: Set<string>,
  originalWord?: string,
  bridgeIndices?: Set<number>
): SequenceResult {
  const word = originalWord || letters.join("");

  // For single letter, we need to find a variation that ends at a target position
  if (letters.length === 1) {
    const letter = letters[0]!;
    const validVariations = allPictographs.filter(
      (p) => p.letter === letter && targetEndPositions.has(p.endPosition)
    );

    if (validVariations.length === 0) {
      return {
        word,
        steps: [],
        startPosition: "",
        endPosition: "",
        isValid: false,
        error: `No variation of "${letter}" ends at target positions`,
      };
    }

    const chosen = pickRandom(validVariations)!;
    const startPosition = chosen.startPosition;

    // Find start position step
    const validStartPositions = allPictographs.filter((p) => {
      return (
        TYPE_6_LETTERS.includes(p.letter) &&
        p.startPosition === startPosition &&
        p.endPosition === startPosition
      );
    });

    if (validStartPositions.length === 0) {
      return {
        word,
        steps: [],
        startPosition: "",
        endPosition: "",
        isValid: false,
        error: `No Type 6 static letter found at position ${startPosition}`,
      };
    }

    const startPictograph = pickRandom(validStartPositions)!;
    const allLetterVariations = allPictographs.filter(
      (p) => p.letter === letter
    );
    const variationIndex = allLetterVariations.indexOf(chosen);

    return {
      word,
      steps: [
        {
          letter: startPictograph.letter,
          variation: 0,
          startPosition: startPictograph.startPosition,
          endPosition: startPictograph.endPosition,
          leftMotion: startPictograph.leftMotion,
          rightMotion: startPictograph.rightMotion,
          stepNumber: 0,
        },
        {
          letter: chosen.letter,
          variation: variationIndex >= 0 ? variationIndex : 0,
          startPosition: chosen.startPosition,
          endPosition: chosen.endPosition,
          leftMotion: chosen.leftMotion,
          rightMotion: chosen.rightMotion,
          stepNumber: 1,
          isBridge: false,
        },
      ],
      startPosition,
      endPosition: chosen.endPosition,
      isValid: true,
    };
  }

  // For multiple letters, build all but last normally, then constrain the last
  const steps: SequenceStep[] = [];

  // Step 1: Pick a random variation of the first letter
  const firstLetter = letters[0]!;
  const firstLetterVariations = allPictographs.filter(
    (p) => p.letter === firstLetter
  );

  if (firstLetterVariations.length === 0) {
    return {
      word,
      steps: [],
      startPosition: "",
      endPosition: "",
      isValid: false,
      error: `No variations found for letter "${firstLetter}"`,
    };
  }

  const firstVariation = pickRandom(firstLetterVariations)!;
  const firstVariationIndex = firstLetterVariations.indexOf(firstVariation);
  const startPosition = firstVariation.startPosition;

  // Find valid start position
  const validStartPositions = allPictographs.filter((p) => {
    return (
      TYPE_6_LETTERS.includes(p.letter) &&
      p.startPosition === startPosition &&
      p.endPosition === startPosition
    );
  });

  if (validStartPositions.length === 0) {
    return {
      word,
      steps: [],
      startPosition: "",
      endPosition: "",
      isValid: false,
      error: `No Type 6 static letter found at position ${startPosition}`,
    };
  }

  const startPictograph = pickRandom(validStartPositions)!;

  // Add start position as step 0
  steps.push({
    letter: startPictograph.letter,
    variation: 0,
    startPosition: startPictograph.startPosition,
    endPosition: startPictograph.endPosition,
    leftMotion: startPictograph.leftMotion,
    rightMotion: startPictograph.rightMotion,
    stepNumber: 0,
  });

  // Add first letter as step 1
  steps.push({
    letter: firstVariation.letter,
    variation: firstVariationIndex,
    startPosition: firstVariation.startPosition,
    endPosition: firstVariation.endPosition,
    leftMotion: firstVariation.leftMotion,
    rightMotion: firstVariation.rightMotion,
    stepNumber: 1,
    isBridge: false,
  });

  let currentEndPosition = firstVariation.endPosition;

  // Build middle letters (all except last) normally
  for (let i = 1; i < letters.length - 1; i++) {
    const letter = letters[i]!;
    const variations = allPictographs.filter(
      (p) => p.letter === letter && p.startPosition === currentEndPosition
    );

    if (variations.length === 0) {
      return {
        word,
        steps: [],
        startPosition: "",
        endPosition: "",
        isValid: false,
        error: `No valid continuation for letter "${letter}" from position ${currentEndPosition}`,
      };
    }

    const chosenVariation = pickRandom(variations)!;
    const allLetterVariations = allPictographs.filter(
      (p) => p.letter === letter
    );
    const variationIndex = allLetterVariations.indexOf(chosenVariation);

    steps.push({
      letter: chosenVariation.letter,
      variation: variationIndex >= 0 ? variationIndex : 0,
      startPosition: chosenVariation.startPosition,
      endPosition: chosenVariation.endPosition,
      leftMotion: chosenVariation.leftMotion,
      rightMotion: chosenVariation.rightMotion,
      stepNumber: i + 1,
      isBridge: bridgeIndices?.has(i) ?? false,
    });

    currentEndPosition = chosenVariation.endPosition;
  }

  // CRITICAL: For the last letter, only pick variations that end at a target position
  const lastLetter = letters[letters.length - 1]!;
  const lastLetterValidVariations = allPictographs.filter(
    (p) =>
      p.letter === lastLetter &&
      p.startPosition === currentEndPosition &&
      targetEndPositions.has(p.endPosition)
  );

  if (lastLetterValidVariations.length === 0) {
    return {
      word,
      steps: [],
      startPosition: "",
      endPosition: "",
      isValid: false,
      error: `No variation of "${lastLetter}" from ${currentEndPosition} ends at target positions`,
    };
  }

  const lastVariation = pickRandom(lastLetterValidVariations)!;
  const allLastLetterVariations = allPictographs.filter(
    (p) => p.letter === lastLetter
  );
  const lastVariationIndex = allLastLetterVariations.indexOf(lastVariation);

  steps.push({
    letter: lastVariation.letter,
    variation: lastVariationIndex >= 0 ? lastVariationIndex : 0,
    startPosition: lastVariation.startPosition,
    endPosition: lastVariation.endPosition,
    leftMotion: lastVariation.leftMotion,
    rightMotion: lastVariation.rightMotion,
    stepNumber: letters.length,
    isBridge: bridgeIndices?.has(letters.length - 1) ?? false,
  });

  return {
    word,
    steps,
    startPosition,
    endPosition: lastVariation.endPosition,
    isValid: true,
  };
}

/**
 * Parameters for LOOP-constrained sequence building
 */
export interface LoopConstraint {
  loopType: string;
  period: Period;
  /** If true, don't add bridge letters - just fail if not naturally compatible */
  noBridges?: boolean;
}

/**
 * Build a sequence that is compatible with a LOOP transformation.
 *
 * For REWOUND: Any sequence works, so this just calls buildSequenceFromLetters.
 * For ROTATED: The end position must be at a rotation of the start position.
 *   If the natural sequence doesn't end at a valid position, a bridge letter is added.
 * @param letters - Array of letters to build sequence from
 * @param allPictographs - All available pictograph data
 * @param loopConstraint - LOOP type and period
 * @param maxAttempts - Maximum attempts to find valid sequence
 */
export function buildSequenceForLoop(
  letters: string[],
  allPictographs: PictographData[],
  loopConstraint: LoopConstraint,
  maxAttempts: number = 500
): SequenceResult {
  // Rewound works with any sequence
  if (loopConstraint.loopType === "rewound") {
    return buildSequenceFromLetters(letters, allPictographs, maxAttempts);
  }

  // For rotated: build the sequence normally, then add a bridge if needed
  if (letters.length === 0) {
    return {
      word: "",
      steps: [],
      startPosition: "",
      endPosition: "",
      isValid: false,
      error: "No letters provided",
    };
  }

  // Try multiple times to find a sequence that's naturally LOOP-compatible
  // Each attempt builds a different random variation selection
  let lastValidResult: SequenceResult | null = null;
  let lastStartPosition = "";
  let lastEndPosition = "";
  let lastValidEndPositions: string[] = [];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Build a sequence with random variation selection (1 attempt per call to force different selection each time)
    // If noBridges is set, skip bridge expansion to preserve exact beat count
    const baseResult = buildSequenceFromLetters(
      letters,
      allPictographs,
      1,
      undefined,
      loopConstraint.noBridges
    );
    if (!baseResult.isValid) {
      continue; // Try again with different random selections
    }

    // Check if it's LOOP-compatible
    const startPosition = baseResult.startPosition;
    const endPosition = baseResult.endPosition;
    const validEndPositions = computeValidEndPositionsForRotatedLoop(
      startPosition,
      loopConstraint.period
    );

    // Store for error message
    lastValidResult = baseResult;
    lastStartPosition = startPosition;
    lastEndPosition = endPosition;
    lastValidEndPositions = validEndPositions;

    if (validEndPositions.includes(endPosition)) {
      // Found a LOOP-compatible sequence!
      // Verify the positions match what we computed
      const actualFirstStepStart = baseResult.steps[0]?.startPosition;
      const actualLastStepEnd =
        baseResult.steps[baseResult.steps.length - 1]?.endPosition;
      if (
        actualFirstStepStart !== startPosition ||
        actualLastStepEnd !== endPosition
      ) {
        console.error(
          `[LOOP BUG] Position mismatch! result.start=${startPosition} vs actual=${actualFirstStepStart}, result.end=${endPosition} vs actual=${actualLastStepEnd}`
        );
        continue; // Skip this invalid result
      }
      console.error(
        `[LOOP DEBUG] Found compatible sequence: ${startPosition} → ${endPosition} (valid: ${validEndPositions.join(", ")})`
      );
      return baseResult;
    }
  }

  // If noBridges option is set, fail after trying all attempts
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

  // If we get here, no naturally compatible sequence was found, but bridges are allowed
  // Use the last valid result and add bridges
  if (!lastValidResult) {
    return {
      word: letters.join(""),
      steps: [],
      startPosition: "",
      endPosition: "",
      isValid: false,
      error: `Could not build any valid sequence from letters ${letters.join("")}`,
    };
  }

  const baseResult = lastValidResult;
  const startPosition = lastStartPosition;
  const endPosition = lastEndPosition;
  const validEndPositions = lastValidEndPositions;

  // Debug info stored for error messages
  const debugInfo: string[] = [];
  debugInfo.push(
    `Start: ${startPosition}, End: ${endPosition}, Valid ends: ${validEndPositions.join(", ")}`
  );

  // CRITICAL: Verify endPosition matches actual last step
  const actualLastStepEnd =
    baseResult.steps[baseResult.steps.length - 1]?.endPosition;
  if (actualLastStepEnd !== endPosition) {
    return {
      word: baseResult.word,
      steps: [],
      startPosition: "",
      endPosition: "",
      isValid: false,
      error: `BUG: baseResult.endPosition (${endPosition}) doesn't match last step endPosition (${actualLastStepEnd})`,
    };
  }

  // Need to add a bridge letter to reach a valid end position
  // Find letters that can bridge from current end position to any valid end position
  const bridgeCandidates: Array<{
    letter: PictographData;
    targetPosition: string;
  }> = [];

  for (const targetPos of validEndPositions) {
    // Find pictographs that start at our current end and end at the target
    const bridges = allPictographs.filter(
      (p) => p.startPosition === endPosition && p.endPosition === targetPos
    );
    debugInfo.push(
      `Direct bridges ${endPosition}→${targetPos}: ${bridges.length} [${bridges.map((b) => b.letter).join(",")}]`
    );
    for (const bridge of bridges) {
      bridgeCandidates.push({ letter: bridge, targetPosition: targetPos });
    }
  }

  debugInfo.push(`Total candidates: ${bridgeCandidates.length}`);

  if (bridgeCandidates.length === 0) {
    // No direct bridge available - try a 2-step bridge
    // Find intermediate positions we can reach, then find paths to valid end positions
    const intermediateLetters = allPictographs.filter(
      (p) => p.startPosition === endPosition
    );

    for (const intermediate of intermediateLetters) {
      for (const targetPos of validEndPositions) {
        const secondBridges = allPictographs.filter(
          (p) =>
            p.startPosition === intermediate.endPosition &&
            p.endPosition === targetPos
        );
        if (secondBridges.length > 0) {
          // Found a 2-step path! Add both letters
          const secondBridge =
            secondBridges[Math.floor(Math.random() * secondBridges.length)]!;

          const steps = [...baseResult.steps];
          const nextStepNum = steps.length;

          // Add first bridge letter
          const allIntermediateVariations = allPictographs.filter(
            (p) => p.letter === intermediate.letter
          );
          const intermediateIndex =
            allIntermediateVariations.indexOf(intermediate);
          steps.push({
            letter: intermediate.letter,
            variation: intermediateIndex >= 0 ? intermediateIndex : 0,
            startPosition: intermediate.startPosition,
            endPosition: intermediate.endPosition,
            leftMotion: intermediate.leftMotion,
            rightMotion: intermediate.rightMotion,
            stepNumber: nextStepNum,
            isBridge: true,
          });

          // Add second bridge letter
          const allSecondVariations = allPictographs.filter(
            (p) => p.letter === secondBridge.letter
          );
          const secondIndex = allSecondVariations.indexOf(secondBridge);
          steps.push({
            letter: secondBridge.letter,
            variation: secondIndex >= 0 ? secondIndex : 0,
            startPosition: secondBridge.startPosition,
            endPosition: secondBridge.endPosition,
            leftMotion: secondBridge.leftMotion,
            rightMotion: secondBridge.rightMotion,
            stepNumber: nextStepNum + 1,
            isBridge: true,
          });

          const extendedWord =
            baseResult.word + intermediate.letter + secondBridge.letter;
          const lastStepEnd = steps[steps.length - 1]?.endPosition || "???";
          if (lastStepEnd !== targetPos) {
            // SANITY CHECK: The last step's endPosition should match targetPos
            // If not, there's a bug in our bridge logic
            console.error(
              `[LOOP BUG] Last step ends at ${lastStepEnd} but expected ${targetPos}`
            );
          }
          const result: SequenceResult = {
            word: extendedWord,
            steps,
            startPosition,
            endPosition: lastStepEnd, // Use actual step end, not targetPos
            isValid: true,
            bridges: [
              ...(baseResult.bridges || []),
              {
                transitionIndex: baseResult.bridges?.length || 0,
                fromLetter:
                  baseResult.steps[baseResult.steps.length - 1]?.letter || "",
                toLetter: "(LOOP)",
                availableOptions: [intermediate.letter, secondBridge.letter],
                selectedBridge: intermediate.letter + secondBridge.letter,
                selectedIndex: 0,
              },
            ],
          };

          return recalculateAllOrientations(result);
        }
      }
    }

    return {
      word: baseResult.word,
      steps: [],
      startPosition: "",
      endPosition: "",
      isValid: false,
      error: `Cannot find bridge from ${endPosition} to any valid LOOP end position (${validEndPositions.join(", ")}). Debug: ${debugInfo.join(" | ")}`,
      bridges: baseResult.bridges,
    };
  }

  // Pick a random bridge candidate
  const chosen =
    bridgeCandidates[Math.floor(Math.random() * bridgeCandidates.length)]!;
  const bridgeLetter = chosen.letter;

  // SANITY CHECK: Verify the bridge actually ends at a valid position
  if (!validEndPositions.includes(bridgeLetter.endPosition)) {
    // This should never happen - filter should have ensured this
    return {
      word: baseResult.word,
      steps: [],
      startPosition: "",
      endPosition: "",
      isValid: false,
      error: `BUG: Bridge letter ${bridgeLetter.letter} ends at ${bridgeLetter.endPosition} which is not in valid positions ${validEndPositions.join(", ")}`,
    };
  }

  // Add the bridge letter to the sequence
  const steps = [...baseResult.steps];
  const allBridgeVariations = allPictographs.filter(
    (p) => p.letter === bridgeLetter.letter
  );
  const bridgeIndex = allBridgeVariations.indexOf(bridgeLetter);

  steps.push({
    letter: bridgeLetter.letter,
    variation: bridgeIndex >= 0 ? bridgeIndex : 0,
    startPosition: bridgeLetter.startPosition,
    endPosition: bridgeLetter.endPosition,
    leftMotion: bridgeLetter.leftMotion,
    rightMotion: bridgeLetter.rightMotion,
    stepNumber: steps.length,
    isBridge: true,
  });

  const extendedWord = baseResult.word + bridgeLetter.letter;
  const actualEndPosition = steps[steps.length - 1]!.endPosition;

  // FINAL SANITY CHECK: Verify we're returning with a valid end position
  if (!validEndPositions.includes(actualEndPosition)) {
    return {
      word: baseResult.word,
      steps: [],
      startPosition: "",
      endPosition: "",
      isValid: false,
      error: `BUG: Final end position ${actualEndPosition} not in valid positions ${validEndPositions.join(", ")} (bridge: ${bridgeLetter.letter} ends at ${bridgeLetter.endPosition})`,
    };
  }

  const result: SequenceResult = {
    word: extendedWord,
    steps,
    startPosition,
    endPosition: actualEndPosition, // Use actual step's endPosition, not targetPosition
    isValid: true,
    bridges: [
      ...(baseResult.bridges || []),
      {
        transitionIndex: baseResult.bridges?.length || 0,
        fromLetter: baseResult.steps[baseResult.steps.length - 1]?.letter || "",
        toLetter: "(LOOP)",
        availableOptions: bridgeCandidates.map((c) => c.letter.letter),
        selectedBridge: bridgeLetter.letter,
        selectedIndex: 0,
      },
    ],
  };

  return recalculateAllOrientations(result);
}

function extractPositionGroup(position: string): string {
  const match = position.match(/^([a-z]+)\d+$/);
  return match?.[1] || "";
}

function computeValidEndPositionsForRotatedLoop(
  startPosition: string,
  period: Period
): string[] {
  // Extract position group and number (e.g., "alpha1" -> "alpha", 1)
  const match = startPosition.match(/^([a-z]+)(\d+)$/);
  if (!match) return [];

  const [, group, numStr] = match;
  const num = parseInt(numStr!, 10);

  // Determine group size (alpha/beta have 8, gamma has 16 split into two groups)
  let groupSize = 8;
  let baseOffset = 0;

  if (group === "gamma" || group === "zeta" || group === "eta") {
    // Gamma/zeta/eta 1-8 and 9-16 are separate rotation groups
    if (num > 8) {
      baseOffset = 8;
      groupSize = 8;
    }
  }

  const normalizedNum = num - baseOffset;
  const validEndPositions: string[] = [];

  if (period === Period.HALVED) {
    // 180° rotation: +4 positions (mod 8)
    const halfRotated = ((normalizedNum - 1 + 4) % groupSize) + 1 + baseOffset;
    validEndPositions.push(`${group}${halfRotated}`);
  } else {
    // 90° rotation: +2 positions (CW) and +6 positions (CCW, same as -2)
    const cwRotated = ((normalizedNum - 1 + 2) % groupSize) + 1 + baseOffset;
    const ccwRotated = ((normalizedNum - 1 + 6) % groupSize) + 1 + baseOffset;
    validEndPositions.push(`${group}${cwRotated}`);
    if (cwRotated !== ccwRotated) {
      validEndPositions.push(`${group}${ccwRotated}`);
    }
  }

  return validEndPositions;
}

function attemptSequenceBuildForLoop(
  letters: string[],
  allPictographs: PictographData[],
  firstVariation: PictographData,
  targetEndPositions: Set<string>,
  originalWord: string,
  bridgeIndices?: Set<number>
): SequenceResult {
  const steps: SequenceStep[] = [];
  const startPosition = firstVariation.startPosition;

  // Find valid start position (Type 6 static letter)
  const validStartPositions = allPictographs.filter((p) => {
    return (
      TYPE_6_LETTERS.includes(p.letter) &&
      p.startPosition === startPosition &&
      p.endPosition === startPosition
    );
  });

  if (validStartPositions.length === 0) {
    return {
      word: originalWord,
      steps: [],
      startPosition: "",
      endPosition: "",
      isValid: false,
      error: `No Type 6 static letter found at position ${startPosition}`,
    };
  }

  const startPictograph = pickRandom(validStartPositions)!;
  const firstLetterVariations = allPictographs.filter(
    (p) => p.letter === firstVariation.letter
  );
  const firstVariationIndex = firstLetterVariations.indexOf(firstVariation);

  // Add start position as step 0
  steps.push({
    letter: startPictograph.letter,
    variation: 0,
    startPosition: startPictograph.startPosition,
    endPosition: startPictograph.endPosition,
    leftMotion: startPictograph.leftMotion,
    rightMotion: startPictograph.rightMotion,
    stepNumber: 0,
  });

  // Add first letter as step 1
  steps.push({
    letter: firstVariation.letter,
    variation: firstVariationIndex >= 0 ? firstVariationIndex : 0,
    startPosition: firstVariation.startPosition,
    endPosition: firstVariation.endPosition,
    leftMotion: firstVariation.leftMotion,
    rightMotion: firstVariation.rightMotion,
    stepNumber: 1,
    isBridge: false,
  });

  let currentEndPosition = firstVariation.endPosition;
  const requiredGroup = extractPositionGroup(startPosition);

  // Build middle letters (all except last)
  // CRITICAL: Prefer variations that stay in the same position group to enable LOOP closure
  for (let i = 1; i < letters.length - 1; i++) {
    const letter = letters[i]!;
    const allVariations = allPictographs.filter(
      (p) => p.letter === letter && p.startPosition === currentEndPosition
    );

    if (allVariations.length === 0) {
      return {
        word: originalWord,
        steps: [],
        startPosition: "",
        endPosition: "",
        isValid: false,
        error: `No valid continuation for letter "${letter}" from position ${currentEndPosition}`,
      };
    }

    // Prefer variations that stay in the required position group
    const sameGroupVariations = allVariations.filter(
      (p) => extractPositionGroup(p.endPosition) === requiredGroup
    );

    const variations =
      sameGroupVariations.length > 0 ? sameGroupVariations : allVariations;
    const chosenVariation = pickRandom(variations)!;
    const allLetterVariations = allPictographs.filter(
      (p) => p.letter === letter
    );
    const variationIndex = allLetterVariations.indexOf(chosenVariation);

    steps.push({
      letter: chosenVariation.letter,
      variation: variationIndex >= 0 ? variationIndex : 0,
      startPosition: chosenVariation.startPosition,
      endPosition: chosenVariation.endPosition,
      leftMotion: chosenVariation.leftMotion,
      rightMotion: chosenVariation.rightMotion,
      stepNumber: i + 1,
      isBridge: bridgeIndices?.has(i) ?? false,
    });

    currentEndPosition = chosenVariation.endPosition;
  }

  // For the last letter, constrain to target end positions
  if (letters.length > 1) {
    const lastLetter = letters[letters.length - 1]!;
    const lastLetterValidVariations = allPictographs.filter(
      (p) =>
        p.letter === lastLetter &&
        p.startPosition === currentEndPosition &&
        targetEndPositions.has(p.endPosition)
    );

    if (lastLetterValidVariations.length === 0) {
      return {
        word: originalWord,
        steps: [],
        startPosition: "",
        endPosition: "",
        isValid: false,
        error: `No variation of "${lastLetter}" from ${currentEndPosition} ends at LOOP-compatible positions`,
      };
    }

    const lastVariation = pickRandom(lastLetterValidVariations)!;
    const allLastLetterVariations = allPictographs.filter(
      (p) => p.letter === lastLetter
    );
    const lastVariationIndex = allLastLetterVariations.indexOf(lastVariation);

    steps.push({
      letter: lastVariation.letter,
      variation: lastVariationIndex >= 0 ? lastVariationIndex : 0,
      startPosition: lastVariation.startPosition,
      endPosition: lastVariation.endPosition,
      leftMotion: lastVariation.leftMotion,
      rightMotion: lastVariation.rightMotion,
      stepNumber: letters.length,
      isBridge: bridgeIndices?.has(letters.length - 1) ?? false,
    });

    currentEndPosition = lastVariation.endPosition;
  }

  return {
    word: originalWord,
    steps,
    startPosition,
    endPosition: currentEndPosition,
    isValid: true,
  };
}

/**
 * Handles Greek letters (α, β, γ, etc.) and dash suffixes (W-, Σ-, etc.).
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

    // Check if next char is a dash (for Type 3/5 letters)
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
 * Uses the transition graph to ensure each letter can follow the previous one
 * without needing bridge letters inserted.
 * @param length - Number of letters in the sequence
 * @param excludeLetters - Letters to exclude from selection (e.g., Type 6 static letters)
 * @returns Array of letters that can chain together without bridges
 */
export function generateChainableSequence(
  length: number,
  excludeLetters: string[] = ["α", "β", "γ"]
): string[] {
  if (length <= 0) return [];

  const transitionGraph = getLetterTransitionGraph();
  const excludeSet = new Set(excludeLetters);

  // Get all available letters (excluding the ones we want to skip)
  const allLetters = transitionGraph.getAllLetters(excludeSet);

  if (allLetters.length === 0) {
    console.error("[generateChainableSequence] No letters available!");
    return [];
  }

  const result: string[] = [];

  // Pick a random first letter
  const firstLetter =
    allLetters[Math.floor(Math.random() * allLetters.length)]!;
  result.push(firstLetter);

  // For each subsequent letter, pick from valid successors
  for (let i = 1; i < length; i++) {
    const prevLetter = result[i - 1]!;
    const validSuccessors = transitionGraph
      .getValidSuccessors(prevLetter)
      .filter((letter) => !excludeSet.has(letter));

    if (validSuccessors.length === 0) {
      // No valid successors - start over with a different letter
      // This is a fallback; in practice, most letters have successors
      console.error(
        `[generateChainableSequence] No successors for "${prevLetter}", retrying...`
      );
      return generateChainableSequence(length, excludeLetters);
    }

    const nextLetter =
      validSuccessors[Math.floor(Math.random() * validSuccessors.length)]!;
    result.push(nextLetter);
  }

  return result;
}

/**
 * Detect reversals for all steps in a sequence.
 * A reversal occurs when the rotation direction changes between consecutive steps.
 *
 * For loop sequences, beat 1 wraps around — its previous context is the tail
 * of the sequence, since loops repeat continuously.
 * @param steps - The sequence steps to analyze
 * @param isLoop - Whether this is a circular/loop sequence
 * @returns The same steps with leftReversal/rightReversal flags set
 */
export function detectReversals(
  steps: SequenceStep[],
  isLoop = false
): SequenceStep[] {
  if (steps.length === 0) return steps;

  return steps.map((step, index) => {
    if (index === 0) {
      if (!isLoop) {
        return { ...step, leftReversal: false, rightReversal: false };
      }
      // Loop wrapping: beat 1's previous context is the full sequence
      const lastLeftRotDir = getLastValidRotationDirection(steps, "left");
      const lastRightRotDir = getLastValidRotationDirection(steps, "right");
      const currentLeftRotDir = getRotationDirection(step, "left");
      const currentRightRotDir = getRotationDirection(step, "right");
      const leftReversal = isReversal(lastLeftRotDir, currentLeftRotDir);
      const rightReversal = isReversal(lastRightRotDir, currentRightRotDir);
      return { ...step, leftReversal, rightReversal };
    }

    const previousSteps = steps.slice(0, index);

    // Get the last valid rotation direction for each hand.
    const lastLeftRotDir = getLastValidRotationDirection(previousSteps, "left");
    const lastRightRotDir = getLastValidRotationDirection(
      previousSteps,
      "right"
    );

    // Get current rotation directions
    const currentLeftRotDir = getRotationDirection(step, "left");
    const currentRightRotDir = getRotationDirection(step, "right");

    // Check for reversals
    const leftReversal = isReversal(lastLeftRotDir, currentLeftRotDir);
    const rightReversal = isReversal(lastRightRotDir, currentRightRotDir);

    return { ...step, leftReversal, rightReversal };
  });
}

function getLastValidRotationDirection(
  steps: SequenceStep[],
  hand: "left" | "right"
): string | null {
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

function getRotationDirection(
  step: SequenceStep,
  hand: "left" | "right"
): string | null {
  const motion = hand === "left" ? step.leftMotion : step.rightMotion;
  if (!motion) return null;

  // Static motions have no rotation
  if (motion.motionType === "static") {
    return "no_rotation";
  }

  return motion.rotationDirection || null;
}

/**
 * A reversal occurs when direction changes (cw -> ccw or ccw -> cw).
 */
function isReversal(
  lastRotDir: string | null,
  currentRotDir: string | null
): boolean {
  // No reversal if either is null or no_rotation
  if (!lastRotDir || !currentRotDir) return false;
  if (lastRotDir === "no_rotation" || lastRotDir === "noRotation") return false;
  if (currentRotDir === "no_rotation" || currentRotDir === "noRotation")
    return false;

  // Normalize rotation directions
  const normalizedLast = normalizeRotationDirection(lastRotDir);
  const normalizedCurrent = normalizeRotationDirection(currentRotDir);

  // Reversal if directions are different
  return normalizedLast !== normalizedCurrent;
}

function normalizeRotationDirection(rotDir: string): string {
  const lower = rotDir.toLowerCase();
  if (lower === "cw" || lower === "clockwise") return "cw";
  if (
    lower === "ccw" ||
    lower === "counterclockwise" ||
    lower === "counter-clockwise"
  )
    return "ccw";
  return lower;
}
