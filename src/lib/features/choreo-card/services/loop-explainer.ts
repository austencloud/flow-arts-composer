/**
 * LOOP Explainer
 *
 * Takes a sequence's step data and LOOP components, then produces a
 * plain-English explanation of the LOOP pattern. Handles simple LOOPs
 * (one transformation, one sentence) and modular LOOPs (multiple patterns
 * with independent nested transformations).
 *
 * Does NOT modify the LOOPDetector - wraps its output with richer analysis.
 */

import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { LOOPExplanation, SeedInfo, SeedTransformation } from "./types";
import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";
import {
  HORIZONTAL_MIRROR_PLACEMENT_MAP,
  VERTICAL_MIRROR_PLACEMENT_MAP,
  INVERTED_LETTER_MAP,
} from "$lib/features/create/generate/circular/domain/constants/strict-loop-placement-maps";
import {
  HALF_PLACEMENT_MAP,
} from "$lib/shared/foundation/domain/models/generation/circular-placement-maps";

// Verb phrases describing what each transformation does to the sequence.
// Written so they read naturally after a subject: "The second half [verb]."
const COMPONENT_VERB: Record<string, string> = {
  rotated: "rotates placements on the grid",
  mirrored: "mirrors east and west",
  flipped: "flips north and south",
  swapped: "swaps blue and red",
  inverted: "swaps pro and anti",
  rewound: "plays the beats in reverse order",
};

// Verb forms for per-pattern descriptions: "[Pattern] [verb] each repetition."
const COMPONENT_DESCRIPTION_VERB: Record<string, string> = {
  rotated: "rotates",
  mirrored: "mirrors east/west",
  flipped: "flips north/south",
  swapped: "swaps blue and red",
  inverted: "swaps pro and anti",
  rewound: "reverses",
};

export function explainLOOP(
  sequence: SequenceData,
  loopComponents: Set<LOOPComponent>
): LOOPExplanation {
  const steps = sequence.steps;
  // Skew braces mark a span, not a letter: decompose the letters inside.
  const word = stripWordNotation(sequence.word ?? "");

  if (!steps || steps.length === 0 || loopComponents.size === 0) {
    return fallbackExplanation(loopComponents, sequence);
  }

  // Try modular decomposition - if the word has repeating sub-patterns
  // with detectable independent transformations, explain each one.
  const seeds = decomposeSeeds(word, steps);

  if (seeds.length > 1) {
    return explainModular(seeds, steps, loopComponents, sequence);
  }

  return explainSimple(steps, loopComponents, sequence);
}


function explainSimple(
  steps: readonly StepData[],
  loopComponents: Set<LOOPComponent>,
  sequence: SequenceData
): LOOPExplanation {
  const cycleCount = sequence.orientationCycleCount ?? 2;
  const parts: string[] = [];

  for (const component of loopComponents) {
    const verb = COMPONENT_VERB[component];
    if (verb) parts.push(verb);
  }

  const cycleText = cycleCount === 1
    ? "Returns to start after one pass."
    : `Repeats ${cycleCount} times to return to start.`;

  const summary = parts.length > 0
    ? `The second half ${parts.join(" and ")}. ${cycleText}`
    : `Returns to starting placement each repetition. ${cycleText}`;

  return {
    type: "simple",
    seeds: [],
    seedTransformations: [],
    cycleCount,
    summary,
  };
}

// ============================================================================
// MODULAR LOOP EXPLANATION
// ============================================================================

function explainModular(
  seeds: SeedInfo[],
  steps: readonly StepData[],
  loopComponents: Set<LOOPComponent>,
  sequence: SequenceData
): LOOPExplanation {
  const cycleCount = sequence.orientationCycleCount ?? 4;
  const seedTransformations: SeedTransformation[] = [];

  for (const seed of seeds) {
    const transformations = detectSeedTransformations(seed, steps);
    if (transformations.length > 0) {
      seedTransformations.push({ seed: seed.name, transformations });
    }
  }

  // If no per-pattern transformations found, the midpoint split was wrong.
  // Fall back to simple explanation.
  if (seedTransformations.length === 0) {
    return explainSimple(steps, loopComponents, sequence);
  }

  const summary = buildModularSummary(seeds, seedTransformations, cycleCount);

  return {
    type: "modular",
    seeds,
    seedTransformations,
    cycleCount,
    summary,
  };
}

// ============================================================================
// SEED DECOMPOSITION
// ============================================================================

/**
 * Find repeating sub-patterns in the word. A 16-step AAKE has word "AAKE"
 * repeated 4 times. The patterns are the distinct letter groups: "AA" and "KE".
 *
 * We identify patterns by finding the shortest repeating unit of the word,
 * then grouping consecutive identical letters within that unit.
 */
function decomposeSeeds(word: string, steps: readonly StepData[]): SeedInfo[] {
  if (!word || word.length < 4) return [];

  const wordLen = word.length;
  const stepCount = steps.length;

  // The word must divide evenly into the step count
  if (stepCount % wordLen !== 0) return [];

  const repetitions = stepCount / wordLen;
  if (repetitions < 2) return [];

  // Only decompose into exactly 2 groups. The word must have an even
  // number of letters so we can split at the midpoint. Words like
  // "MOONS" (5 letters) or "ABC" (3 letters) can't cleanly decompose.
  if (wordLen % 2 !== 0) return [];

  const groups = splitIntoTwoGroups(word);
  if (groups.length !== 2) return [];

  // Build beat ranges for each group across all repetitions
  const seeds: SeedInfo[] = [];
  for (const group of groups) {
    const beatRanges: [number, number][] = [];
    for (let rep = 0; rep < repetitions; rep++) {
      const baseOffset = rep * wordLen;
      const start = baseOffset + group.startIdx + 1; // 1-based
      const end = baseOffset + group.startIdx + group.length;
      beatRanges.push([start, end]);
    }
    seeds.push({ name: group.text, beatRanges });
  }

  return seeds;
}

/**
 * Split a word into exactly 2 equal-length pattern groups at the midpoint.
 * For "AAKE": "AA" and "KE". Only splits if the two halves differ.
 * Returns empty if the word can't cleanly decompose (odd length, identical halves).
 */
function splitIntoTwoGroups(
  word: string
): { text: string; startIdx: number; length: number }[] {
  const len = word.length;
  if (len < 4 || len % 2 !== 0) return [];

  const half = len / 2;
  const first = word.slice(0, half);
  const second = word.slice(half);

  // Only worth splitting if the two halves are different
  if (first === second) return [];

  return [
    { text: first, startIdx: 0, length: half },
    { text: second, startIdx: half, length: half },
  ];
}

// ============================================================================
// PER-SEED TRANSFORMATION DETECTION
// ============================================================================

/**
 * For each pattern, compare its occurrences through each transformation map.
 * Detect inner transformations (between adjacent occurrences) and outer
 * transformations (between groups of occurrences).
 */
function detectSeedTransformations(
  seed: SeedInfo,
  steps: readonly StepData[]
): SeedTransformation["transformations"] {
  const occurrences = seed.beatRanges;
  if (occurrences.length < 2) return [];

  const transformations: SeedTransformation["transformations"] = [];

  const transformChecks: {
    component: LOOPComponent;
    check: (a: readonly StepData[], b: readonly StepData[]) => boolean;
  }[] = [
    { component: "flipped" as LOOPComponent, check: (a, b) => checkFlipped(a, b) },
    { component: "mirrored" as LOOPComponent, check: (a, b) => checkMirrored(a, b) },
    { component: "rotated" as LOOPComponent, check: (a, b) => checkRotated(a, b) },
    { component: "swapped" as LOOPComponent, check: (a, b) => checkSwapped(a, b) },
    { component: "inverted" as LOOPComponent, check: (a, b) => checkInverted(a, b) },
  ];

  for (const { component, check } of transformChecks) {
    const result = analyzeTransformationIntervals(seed, steps, check);
    const verb = COMPONENT_DESCRIPTION_VERB[component] ?? component;

    if (result.innerApplies && result.outerApplies) {
      // Nested: transformation at both inner and outer intervals
      transformations.push({
        component,
        interval: "inner",
        description: `${verb} within each pair of repetitions`,
      });
      transformations.push({
        component,
        interval: "outer",
        description: `${verb} between the first and second half`,
      });
    } else if (result.innerApplies) {
      transformations.push({
        component,
        interval: "line",
        description: `${verb} each repetition`,
      });
    } else if (result.outerApplies) {
      transformations.push({
        component,
        interval: "pair",
        description: `${verb} between the first and second half`,
      });
    }
  }

  return transformations;
}

/**
 * Test whether a transformation applies at the inner level (between ALL
 * adjacent occurrences) and/or the outer level (between groups of occurrences).
 *
 * For 4 occurrences [O1, O2, O3, O4]:
 * - Inner: O1↔O2, O2↔O3, O3↔O4 (all adjacent pairs must match)
 * - Outer: (O1+O2) ↔ (O3+O4)
 */
function analyzeTransformationIntervals(
  seed: SeedInfo,
  steps: readonly StepData[],
  check: (a: readonly StepData[], b: readonly StepData[]) => boolean
): { innerApplies: boolean; outerApplies: boolean } {
  const ranges = seed.beatRanges;
  const getSteps = (range: [number, number]) =>
    extractStepsForRange(steps, range);

  let innerApplies = false;
  let outerApplies = false;

  // Inner: check ALL adjacent pairs (not just non-overlapping pairs)
  if (ranges.length >= 2) {
    let allInnerMatch = true;
    for (let i = 0; i < ranges.length - 1; i++) {
      const a = getSteps(ranges[i]!);
      const b = getSteps(ranges[i + 1]!);
      if (a.length > 0 && b.length > 0 && !check(a, b)) {
        allInnerMatch = false;
        break;
      }
    }
    innerApplies = allInnerMatch;
  }

  // Outer: compare first half of occurrences vs second half
  // For 4 occurrences: concatenated [O1,O2] vs [O3,O4]
  if (ranges.length >= 4) {
    const halfCount = Math.floor(ranges.length / 2);
    const firstGroupSteps: StepData[] = [];
    const secondGroupSteps: StepData[] = [];

    for (let i = 0; i < halfCount; i++) {
      firstGroupSteps.push(...getSteps(ranges[i]!));
    }
    for (let i = halfCount; i < ranges.length; i++) {
      secondGroupSteps.push(...getSteps(ranges[i]!));
    }

    if (firstGroupSteps.length > 0 && secondGroupSteps.length > 0) {
      outerApplies = check(firstGroupSteps, secondGroupSteps);
    }
  }

  return { innerApplies, outerApplies };
}

function extractStepsForRange(
  steps: readonly StepData[],
  range: [number, number]
): StepData[] {
  // Beat ranges are 1-based, steps array is 0-based
  const [start, end] = range;
  return steps.slice(start - 1, end);
}

// ============================================================================
// TRANSFORMATION CHECKS
// ============================================================================

/**
 * Check if beat group B is a horizontal flip (N↔S) of beat group A.
 * Compares end placements through HORIZONTAL_MIRROR_PLACEMENT_MAP.
 */
function checkFlipped(a: readonly StepData[], b: readonly StepData[]): boolean {
  return checkPlacementTransform(a, b, HORIZONTAL_MIRROR_PLACEMENT_MAP);
}

/**
 * Check if beat group B is a vertical mirror (E↔W) of beat group A.
 */
function checkMirrored(a: readonly StepData[], b: readonly StepData[]): boolean {
  return checkPlacementTransform(a, b, VERTICAL_MIRROR_PLACEMENT_MAP);
}

/**
 * Check if beat group B is a 180° rotation of beat group A.
 */
function checkRotated(a: readonly StepData[], b: readonly StepData[]): boolean {
  return checkPlacementTransform(a, b, HALF_PLACEMENT_MAP);
}

/**
 * Check if beat group B has swapped blue/red compared to A.
 * Blue's motion type in A should match red's in B and vice versa.
 */
function checkSwapped(a: readonly StepData[], b: readonly StepData[]): boolean {
  const len = Math.min(a.length, b.length);
  if (len === 0) return false;

  let matchCount = 0;
  let checkCount = 0;

  for (let i = 0; i < len; i++) {
    const stepA = a[i]!;
    const stepB = b[i]!;
    const aLeft = stepA.motions?.left;
    const aRight = stepA.motions?.right;
    const bLeft = stepB.motions?.left;
    const bRight = stepB.motions?.right;

    // Invisible placeholder = hand not really there (both-required Step shape).
    if (
      isVisibleMotion(aLeft) &&
      isVisibleMotion(aRight) &&
      isVisibleMotion(bLeft) &&
      isVisibleMotion(bRight)
    ) {
      if (aLeft.motionType === aRight.motionType) continue;
      checkCount++;
      if (
        bLeft.motionType === aRight.motionType &&
        bRight.motionType === aLeft.motionType
      ) {
        matchCount++;
      }
    }
  }

  // Require exact match for printed card text accuracy
  return checkCount > 0 && matchCount === checkCount;
}

/**
 * Check if beat group B has inverted motion types (pro↔anti) compared to A.
 */
function checkInverted(a: readonly StepData[], b: readonly StepData[]): boolean {
  const len = Math.min(a.length, b.length);
  if (len === 0) return false;

  let validComparisons = 0;

  for (let i = 0; i < len; i++) {
    const stepA = a[i]!;
    const stepB = b[i]!;

    if (stepA.letter && stepB.letter) {
      validComparisons++;
      const expected = INVERTED_LETTER_MAP[stepA.letter];
      if (expected && stepB.letter !== expected) return false;
    }

    const aLeft = stepA.motions?.left;
    const bLeft = stepB.motions?.left;
    if (isVisibleMotion(aLeft) && isVisibleMotion(bLeft)) {
      validComparisons++;
      if (!isMotionTypeInverted(aLeft.motionType, bLeft.motionType)) return false;
    }

    const aRight = stepA.motions?.right;
    const bRight = stepB.motions?.right;
    if (isVisibleMotion(aRight) && isVisibleMotion(bRight)) {
      validComparisons++;
      if (!isMotionTypeInverted(aRight.motionType, bRight.motionType)) return false;
    }
  }

  return validComparisons > 0;
}

/**
 * Compare end placements of two beat groups through a placement map.
 * Requires all comparable beats to match (exact, no threshold)
 * because this text appears on a printed card.
 */
function checkPlacementTransform(
  a: readonly StepData[],
  b: readonly StepData[],
  placementMap: Record<string, string>
): boolean {
  const len = Math.min(a.length, b.length);
  if (len === 0) return false;

  let checkCount = 0;

  for (let i = 0; i < len; i++) {
    const endA = a[i]?.endPlacement;
    const endB = b[i]?.endPlacement;
    if (!endA || !endB) continue;

    checkCount++;
    const expected = placementMap[endA as string];
    if (expected !== (endB as string)) {
      return false;
    }
  }

  return checkCount > 0;
}

function isMotionTypeInverted(type1: string, type2: string): boolean {
  const t1 = type1.toLowerCase();
  const t2 = type2.toLowerCase();

  if ((t1 === "pro" && t2 === "anti") || (t1 === "anti" && t2 === "pro")) return true;
  if (t1 === t2) return ["static", "float", "dash"].includes(t1);
  return false;
}

// ============================================================================
// SUMMARY GENERATION
// ============================================================================

function buildModularSummary(
  seeds: SeedInfo[],
  seedTransformations: SeedTransformation[],
  cycleCount: number
): string {
  const parts: string[] = [];

  // Name the patterns
  const seedNames = seeds.map((s) => s.name).join(" and ");
  parts.push(`Two patterns: ${seedNames}.`);

  // Describe each pattern's transformations
  for (const st of seedTransformations) {
    const descriptions = st.transformations.map((t) => t.description);
    if (descriptions.length === 0) continue;

    if (descriptions.length === 1) {
      parts.push(`${st.seed} ${descriptions[0]}.`);
    } else {
      const innerDescs = st.transformations.filter((t) => t.interval === "inner");
      const outerDescs = st.transformations.filter((t) => t.interval === "outer");

      if (innerDescs.length > 0 && outerDescs.length > 0) {
        // Nested: describe inner, then note the outer layer
        const innerText = innerDescs.map((t) => t.description).join(" and ");
        parts.push(`${st.seed} ${innerText}, and again between halves.`);
      } else {
        parts.push(`${st.seed} ${descriptions.join(" and ")}.`);
      }
    }
  }

  // Cycle count
  if (cycleCount === 1) {
    parts.push("Returns to start after one pass.");
  } else {
    parts.push(`Repeats ${cycleCount} times to return to start.`);
  }

  return parts.join(" ");
}

function fallbackExplanation(
  loopComponents: Set<LOOPComponent>,
  sequence: SequenceData
): LOOPExplanation {
  const cycleCount = sequence.orientationCycleCount ?? 2;
  const parts: string[] = [];

  for (const c of loopComponents) {
    const verb = COMPONENT_VERB[c];
    if (verb) parts.push(verb);
  }

  let summary: string;
  if (parts.length > 0) {
    const cycleText = cycleCount === 1
      ? "Returns to start after one pass."
      : `Repeats ${cycleCount} times to return to start.`;
    summary = `Each time through, the sequence ${parts.join(" and ")}. ${cycleText}`;
  } else {
    summary = "Returns to starting placement after each repetition.";
  }

  return {
    type: "simple",
    seeds: [],
    seedTransformations: [],
    cycleCount,
    summary,
  };
}
