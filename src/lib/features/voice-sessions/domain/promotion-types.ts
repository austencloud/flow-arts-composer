import type { VoiceCommandCategory } from "#lib/shared/voice-control/domain/voice-command-types.js";

/**
 * Lifecycle of a promotion candidate:
 * - pending: Newly identified, awaiting review
 * - approved: Accepted by human/Claude, ready to implement
 * - rejected: Dismissed (false positive, edge case, etc.)
 * - applied: Regex added to the appropriate sub-interpreter
 */
export type PromotionStatus = "pending" | "approved" | "rejected" | "applied";

/** One occurrence of a T2 hit that supports the promotion */
export interface PromotionEvidence {
  /** Session ID where this occurred */
  sessionId: string;
  /** Exact transcript text */
  transcript: string;
  /** LLM confidence for this resolution */
  confidence: number;
}

/** A T2 transcript pattern that should become a T1 regex */
export interface PromotionCandidate {
  /** Normalized transcript pattern (lowercased, trimmed) */
  transcriptPattern: string;
  /** All transcript variants seen (preserving original casing) */
  transcriptVariants: string[];
  /** Suggested regex pattern string */
  suggestedRegex: string;
  /** Target command this should resolve to */
  targetCategory: VoiceCommandCategory;
  targetAction: string;
  targetTarget: string;
  /** Which sub-interpreter file should receive this pattern */
  suggestedInterpreter: string;
  /** How many times this pattern was seen */
  hitCount: number;
  /** Evidence from individual sessions */
  evidence: PromotionEvidence[];
  /** Average LLM confidence across all hits */
  avgConfidence: number;
  /** Current status */
  status: PromotionStatus;
}
