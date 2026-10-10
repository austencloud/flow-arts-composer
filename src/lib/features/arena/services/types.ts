import type {
  ArenaEntry,
  ArenaRating,
} from "../domain/models/arena-models";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

/**
 * IStabilityAnalyzer
 *
 * Analyzes convergence of the rating pool.
 */


export interface StabilityReport {
  /** Percentage of entries with phi < STABLE_PHI_THRESHOLD */
  convergencePercent: number;
  /** Number of entries still in cold-start (< COLD_START_THRESHOLD matchups) */
  coldStartCount: number;
  /** Total entries in the pool */
  totalEntries: number;
  /** Average rating deviation across all entries */
  averagePhi: number;
}

/**
 * IMatchupSelector
 *
 * Three-tier matchmaking:
 * 1. Cold-start pivot pairing (entries with < COLD_START_THRESHOLD matchups)
 * 2. UCB information-gain maximization (90% of remaining)
 * 3. Random exploration (10%)
 */


export interface MatchupCandidate {
  entry: ArenaEntry;
  rating: ArenaRating;
  data: SequenceData;
  /** Firestore path to the full sequence document (e.g., users/{uid}/sequences/{id}) */
  sourceRef?: string;
}

