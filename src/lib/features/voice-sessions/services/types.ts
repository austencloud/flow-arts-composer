/**
 * Co-exported types from retired interface contracts.
 */

import type {
  ResolutionTier,
} from "#lib/shared/voice-control/domain/voice-session-types.js";
import type { VoiceCommandCategory } from "#lib/shared/voice-control/domain/voice-command-types.js";


export interface FailingTranscript {
  /** Normalized transcript text (lowercased, trimmed) */
  transcript: string;
  /** How many times this transcript appeared */
  occurrences: number;
  /** Which tier it landed in each time */
  tierHistory: ResolutionTier[];
  /** Most recent session ID where it appeared */
  lastSeenSessionId: string;
}
export interface Tier2Candidate {
  /** Normalized transcript text */
  transcript: string;
  /** The command it consistently resolves to */
  resolvedCategory: VoiceCommandCategory;
  resolvedAction: string;
  resolvedTarget: string;
  /** How many times T2 resolved this the same way */
  consistentHits: number;
  /** Session IDs where this occurred */
  sessionIds: string[];
  /** Average LLM confidence across hits */
  avgConfidence: number;
}
export interface SessionSuccessPoint {
  sessionId: string;
  date: Date;
  successRate: number;
  totalEvents: number;
}
export interface LatencyByTier {
  tier: ResolutionTier;
  avgMs: number;
  minMs: number;
  maxMs: number;
  sampleCount: number;
}
export interface UnresolvedPattern {
  /** Normalized transcript */
  transcript: string;
  /** Number of occurrences across all sessions */
  occurrences: number;
  /** Module/tab context where it most commonly appears */
  primaryContext: { module: string; tab: string };
}
export interface SessionAnalysis {
  /** Sessions analyzed */
  sessionCount: number;
  /** Total events across all sessions */
  totalEvents: number;
  /** Transcripts that fail most often (sorted by occurrences desc) */
  topFailingTranscripts: FailingTranscript[];
  /** T2 transcripts that resolve consistently - candidates for T1 regex */
  tier2Candidates: Tier2Candidate[];
  /** Per-session success rate over time */
  successRateTrend: SessionSuccessPoint[];
  /** Latency statistics grouped by tier */
  latencyByTier: LatencyByTier[];
  /** Common unresolved transcript patterns */
  unresolvedPatterns: UnresolvedPattern[];
}

