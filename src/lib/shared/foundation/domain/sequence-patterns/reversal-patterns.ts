/**
 * Reversal Pattern Definitions
 *
 * Defines 15 reversal patterns across 5 families for use in drill generation.
 * Each pattern specifies a reversing sequence with period and minimum beat requirements.
 */

export interface ReversalPatternDef {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly family: ReversalFamily;
  readonly sequence: string;
  readonly period: number;
  readonly minBeats: number;
}

export const REVERSAL_PATTERNS = [
  // Simple family: basic prop reversal patterns
  {
    id: "continuous",
    label: "Continuous",
    description: "No reversals. Props maintain rotation direction throughout.",
    family: "simple",
    sequence: "----",
    period: 1,
    minBeats: 4,
  },
  {
    id: "book",
    label: "Book",
    description:
      'Both props reverse every step. "Opening and closing the book."',
    family: "simple",
    sequence: "PPPP",
    period: 1,
    minBeats: 4,
  },
  {
    id: "red-book",
    label: "Red Book",
    description: "Right prop reverses every step. Left stays continuous.",
    family: "simple",
    sequence: "RRRR",
    period: 1,
    minBeats: 4,
  },
  {
    id: "blue-book",
    label: "Blue Book",
    description: "Left prop reverses every step. Right stays continuous.",
    family: "simple",
    sequence: "BBBB",
    period: 1,
    minBeats: 4,
  },
  {
    id: "long-book",
    label: "Long Book",
    description: "Both props reverse every other step.",
    family: "simple",
    sequence: "P-P-",
    period: 2,
    minBeats: 4,
  },
  {
    id: "alternating",
    label: "Alternating",
    description: "Red and blue take turns reversing. Never at the same time.",
    family: "simple",
    sequence: "RBRB",
    period: 2,
    minBeats: 4,
  },

  // Solo family: single-hand reversals
  {
    id: "solo-1",
    label: "Solo 1",
    description:
      "One prop reverses per step in an 8-step rhythm. Never both, never neither.",
    family: "solo",
    sequence: "RBBRBRRB",
    period: 8,
    minBeats: 8,
  },
  {
    id: "solo-2",
    label: "Solo 2",
    description: "16-step solo rhythm. Base pattern + its red/blue mirror.",
    family: "solo",
    sequence: "RBBRBRRBBRRBRBBR",
    period: 16,
    minBeats: 16,
  },
  {
    id: "solo-3",
    label: "Solo 3",
    description: "32-step solo rhythm. Extended by chaining with complement.",
    family: "solo",
    sequence: "RBBRBRRBBRRBRBBRBRRBRBBRRBBRBRRB",
    period: 32,
    minBeats: 32,
  },

  // Dense Weave family: pair beats every other position
  {
    id: "dense-weave-1",
    label: "Dense Weave 1",
    description: "8-step weave. Solo and pair steps alternate every position.",
    family: "dense-weave",
    sequence: "RPBPRPBP",
    period: 8,
    minBeats: 8,
  },
  {
    id: "dense-weave-2",
    label: "Dense Weave 2",
    description: "16-step dense weave. Base + complement.",
    family: "dense-weave",
    sequence: "RPBPRPBPBPRPBPRP",
    period: 16,
    minBeats: 16,
  },
  {
    id: "dense-weave-3",
    label: "Dense Weave 3",
    description: "32-step dense weave. Extended by chaining with complement.",
    family: "dense-weave",
    sequence: "RPBPRPBPBPRPBPRPBPRPBPRPRPBPRPBP",
    period: 32,
    minBeats: 32,
  },

  // Sparse Weave family: pair beats every 4th position
  {
    id: "sparse-weave-1",
    label: "Sparse Weave 1",
    description:
      "8-step weave. Pair steps every 4th position, solo steps between.",
    family: "sparse-weave",
    sequence: "RBRPBRBP",
    period: 8,
    minBeats: 8,
  },
  {
    id: "sparse-weave-2",
    label: "Sparse Weave 2",
    description: "16-step sparse weave. Base + complement.",
    family: "sparse-weave",
    sequence: "RBRPBRBPBRBPRBRP",
    period: 16,
    minBeats: 16,
  },
  {
    id: "sparse-weave-3",
    label: "Sparse Weave 3",
    description: "32-step sparse weave. Extended by chaining with complement.",
    family: "sparse-weave",
    sequence: "RBRPBRBPBRBPRBRPBRBPRBRPRBRPBRBP",
    period: 32,
    minBeats: 32,
  },
] as const;

/**
 * Reversal family type derived from pattern definitions
 */
export type ReversalFamily = "simple" | "solo" | "dense-weave" | "sparse-weave";

/**
 * Ordered list of reversal families
 */
export const REVERSAL_FAMILIES: readonly ReversalFamily[] = [
  "simple",
  "solo",
  "dense-weave",
  "sparse-weave",
] as const;

/**
 * Filtered collection of simple patterns only
 */
export const SIMPLE_PATTERNS = REVERSAL_PATTERNS.filter(
  (p) => p.family === "simple"
);

/**
 * Look up a reversal pattern by its id
 */
export function getReversalPattern(id: string): ReversalPatternDef | undefined {
  return REVERSAL_PATTERNS.find((p) => p.id === id);
}

/**
 * Get all reversal patterns compatible with a given beat count.
 *
 * A pattern is compatible if:
 * 1. The beat count is divisible by the pattern's period
 * 2. The beat count meets the pattern's minimum requirement
 */
export function getCompatiblePatterns(stepCount: number): ReversalPatternDef[] {
  return REVERSAL_PATTERNS.filter(
    (p) => stepCount % p.period === 0 && stepCount >= p.minBeats
  );
}
