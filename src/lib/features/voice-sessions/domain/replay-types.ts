import type {
  VoiceSessionEvent,
  ResolutionTier,
} from "#lib/shared/voice-control/domain/voice-session-types.js";
import type { VoiceCommand } from "#lib/shared/voice-control/domain/voice-command-types.js";

/**
 * How the current interpretation differs from what was originally recorded:
 * - SAME: Identical tier and command
 * - IMPROVED: Was unresolved/failed, now resolves correctly
 * - REGRESSED: Was resolved, now unresolved or different command
 * - CHANGED: Different interpretation (neither clearly better nor worse)
 */
export type ReplayDiffType = "SAME" | "IMPROVED" | "REGRESSED" | "CHANGED";

/** Side-by-side comparison of one event's original vs current interpretation */
export interface ReplayEventComparison {
  /** Index within the session */
  eventIndex: number;
  /** The original transcript text */
  transcript: string;
  /** Original tier from the recorded session */
  originalTier: ResolutionTier;
  /** Current tier from re-running through the interpreter */
  currentTier: ResolutionTier;
  /** Original interpreted command (null if was unresolved) */
  originalCommand: VoiceCommand | null;
  /** Current interpreted command (null if now unresolved) */
  currentCommand: VoiceCommand | null;
  /** Classification of the difference */
  diff: ReplayDiffType;
  /** The original event for full context */
  originalEvent: VoiceSessionEvent;
}

/** Aggregate counts across all events in a replayed session */
export interface ReplaySessionSummary {
  /** Events with identical interpretation */
  sameCount: number;
  /** Events that improved (were broken, now work) */
  improvedCount: number;
  /** Events that regressed (were working, now broken) */
  regressedCount: number;
  /** Events with changed interpretation (unclear if better/worse) */
  changedCount: number;
  /** Total events compared */
  totalCount: number;
}

/** Full result of replaying a session through the current pipeline */
export interface ReplayResult {
  /** The session ID that was replayed */
  sessionId: string;
  /** Per-event comparisons */
  comparisons: ReplayEventComparison[];
  /** Aggregate summary */
  summary: ReplaySessionSummary;
}
