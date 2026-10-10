/**
 * Arena Domain Models
 *
 * Core types for the community-powered pairwise ranking system.
 * The ArenaEntry abstraction is polymorphic by design: sequences today,
 * compositions tomorrow. All rating/voting/matchmaking operates on entries,
 * not sequences directly.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

// Entry Abstraction (polymorphic: sequences now, compositions later)

export type ArenaEntryKind = "sequence" | "composition";

export interface ArenaEntry {
  id: string;
  kind: ArenaEntryKind;
  word: string;
  ownerId: string;
  ownerDisplayName?: string;
}

// Glicko-2 Rating

export interface ArenaRating {
  entryId: string;
  entryKind: ArenaEntryKind;
  /** Glicko-2 rating mean (default 1500) */
  mu: number;
  /** Rating deviation - uncertainty (default 350) */
  phi: number;
  /** Rating volatility (default 0.06) */
  sigma: number;
  /** Conservative display rating: mu - 2*phi */
  displayRating: number;
  totalMatchups: number;
  wins: number;
  losses: number;
  peakRating: number;
  peakRatingDate: Date;
  lastMatchAt: Date;
  enteredPoolAt: Date;
  // Denormalized for queries
  word: string;
  ownerId: string;
}

// Voting

export type MatchupReason = "cold_start" | "info_gain" | "random";

export interface ArenaVote {
  voterId: string;
  winnerEntryId: string;
  loserEntryId: string;
  timestamp: Date;
  matchupReason: MatchupReason;
}

// Matchup (presented to the voter)

export interface ArenaMatchup {
  entryA: ArenaEntry;
  entryB: ArenaEntry;
  ratingA: ArenaRating;
  ratingB: ArenaRating;
  /** Full sequence data for animation. Future: SequenceData | CompositionData */
  dataA: SequenceData;
  dataB: SequenceData;
  reason: MatchupReason;
}

// Leaderboard

export interface ArenaLeaderboardEntry {
  rank: number;
  rating: ArenaRating;
  entry: ArenaEntry;
  /** Rank change vs previous daily snapshot. Positive = climbed. */
  rankChange: number;
}

// User Stats

export interface ArenaUserStats {
  totalVotes: number;
  currentStreak: number;
  longestStreak: number;
  firstVoteDate: Date | null;
}

// Glicko-2 Update Result (returned by RatingCalculator)

export interface RatingUpdate {
  winnerMu: number;
  winnerPhi: number;
  winnerSigma: number;
  loserMu: number;
  loserPhi: number;
  loserSigma: number;
}
