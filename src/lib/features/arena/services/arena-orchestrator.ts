/**
 * ArenaOrchestrator
 *
 * Coordinates the full arena flow. Manages pool, matchmaking, voting,
 * rating updates, and matchup prefetching.
 */

import type { MatchupCandidate } from "./types";
import type {
  ArenaMatchup,
  ArenaLeaderboardEntry,
  ArenaUserStats,
  ArenaRating,
} from "../domain/models/arena-models";
import {
  MIN_VOTE_INTERVAL_MS,
  RECENT_MATCHUP_BUFFER_SIZE,
} from "../domain/constants/arena-constants";
import {
  loadPool,
  loadRecentVotePairs,
  saveRatings,
  saveVote,
  loadLeaderboard,
  loadUserStats,
  loadFullSequenceData,
} from "#lib/features/arena/services/arena-repository.js";
import { computeUpdate, displayRating } from "#lib/features/arena/services/rating-calculator.js";
import { selectMatchup } from "#lib/features/arena/services/matchup-selector.js";
import {
  trackArenaMatchupSkipped,
  trackArenaVoteCompleted,
} from "#lib/features/arena/analytics/arena-events.js";

export class ArenaOrchestrator {
  private userId = "";
  private pool: MatchupCandidate[] = [];
  private currentMatchup: ArenaMatchup | null = null;
  private nextMatchup: ArenaMatchup | null = null;
  private recentPairs = new Set<string>();
  private loading = false;
  private sessionStreak = 0;
  private matchupsCompleted = 0;
  private lastVoteTime = 0;

  constructor() {}

  async initialize(userId: string): Promise<void> {
    this.userId = userId;
    this.loading = true;

    try {
      // Load pool and recent pairs in parallel
      const [pool, recentPairs] = await Promise.all([
        loadPool(),
        loadRecentVotePairs(userId, RECENT_MATCHUP_BUFFER_SIZE),
      ]);

      this.pool = pool;
      this.recentPairs = recentPairs;

      // Select first and prefetch second matchup
      await this.selectNextMatchup();
    } finally {
      this.loading = false;
    }
  }

  getCurrentMatchup(): ArenaMatchup | null {
    return this.currentMatchup;
  }

  async vote(winnerId: string): Promise<void> {
    if (!this.currentMatchup) return;

    // Spam prevention
    const now = Date.now();
    if (now - this.lastVoteTime < MIN_VOTE_INTERVAL_MS) return;
    this.lastVoteTime = now;

    const { entryA, entryB, ratingA, ratingB, reason } = this.currentMatchup;
    const isWinnerA = winnerId === entryA.id;
    const winner = isWinnerA ? ratingA : ratingB;
    const loser = isWinnerA ? ratingB : ratingA;

    // Compute new ratings
    const update = computeUpdate(
      winner.mu,
      winner.phi,
      winner.sigma,
      loser.mu,
      loser.phi,
      loser.sigma
    );

    // Build updated rating objects
    const now2 = new Date();
    const updatedWinner: ArenaRating = {
      ...winner,
      mu: update.winnerMu,
      phi: update.winnerPhi,
      sigma: update.winnerSigma,
      displayRating: displayRating(update.winnerMu, update.winnerPhi),
      totalMatchups: winner.totalMatchups + 1,
      wins: winner.wins + 1,
      lastMatchAt: now2,
      peakRating: Math.max(
        winner.peakRating,
        displayRating(update.winnerMu, update.winnerPhi)
      ),
      peakRatingDate:
        displayRating(update.winnerMu, update.winnerPhi) > winner.peakRating
          ? now2
          : winner.peakRatingDate,
    };

    const updatedLoser: ArenaRating = {
      ...loser,
      mu: update.loserMu,
      phi: update.loserPhi,
      sigma: update.loserSigma,
      displayRating: displayRating(update.loserMu, update.loserPhi),
      totalMatchups: loser.totalMatchups + 1,
      losses: loser.losses + 1,
      lastMatchAt: now2,
    };

    // Persist vote and updated ratings in parallel
    await Promise.all([
      saveRatings(updatedWinner, updatedLoser),
      saveVote({
        voterId: this.userId,
        winnerEntryId: winnerId,
        loserEntryId: isWinnerA ? entryB.id : entryA.id,
        timestamp: now2,
        matchupReason: reason,
      }),
    ]);

    // Track the pair as seen
    const pairKey =
      entryA.id < entryB.id
        ? `${entryA.id}|${entryB.id}`
        : `${entryB.id}|${entryA.id}`;
    this.recentPairs.add(pairKey);

    // Update pool cache with new ratings
    this.updatePoolRating(updatedWinner);
    this.updatePoolRating(updatedLoser);

    // Advance state
    this.sessionStreak++;
    this.matchupsCompleted++;
    trackArenaVoteCompleted({
      winnerSequenceId: winnerId,
      loserSequenceId: isWinnerA ? entryB.id : entryA.id,
      matchupReason: reason,
      sessionVoteNumber: this.matchupsCompleted,
    });

    // Promote prefetched matchup, start prefetching the next one
    await this.selectNextMatchup();
  }

  async skip(): Promise<void> {
    this.sessionStreak = 0;
    await this.selectNextMatchup();
    trackArenaMatchupSkipped();
  }

  async loadLeaderboard(limit = 50): Promise<ArenaLeaderboardEntry[]> {
    return loadLeaderboard(limit);
  }

  async loadUserStats(): Promise<ArenaUserStats> {
    return loadUserStats(this.userId);
  }

  isLoading(): boolean {
    return this.loading;
  }

  getSessionStreak(): number {
    return this.sessionStreak;
  }

  getMatchupsCompleted(): number {
    return this.matchupsCompleted;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async selectNextMatchup(): Promise<void> {
    if (this.nextMatchup) {
      this.currentMatchup = this.nextMatchup;
      this.nextMatchup = null;
      // Prefetch in background
      this.prefetchNextMatchup();
    } else {
      const raw = this.buildMatchup();
      this.currentMatchup = raw ? await this.enrichMatchup(raw) : null;
      this.prefetchNextMatchup();
    }
  }

  private prefetchNextMatchup(): void {
    // Run async without blocking - enrich with full data so it's ready
    Promise.resolve().then(async () => {
      const raw = this.buildMatchup();
      this.nextMatchup = raw ? await this.enrichMatchup(raw) : null;
    });
  }

  private buildMatchup(): ArenaMatchup | null {
    const result = selectMatchup(
      this.pool,
      this.userId,
      this.recentPairs
    );
    if (!result) return null;

    return {
      entryA: result.a.entry,
      entryB: result.b.entry,
      ratingA: result.a.rating,
      ratingB: result.b.rating,
      dataA: result.a.data,
      dataB: result.b.data,
      reason: result.reason,
    };
  }

  /**
   * Enrich a matchup with full sequence data fetched from sourceRef.
   * The pool stores lightweight index metadata (no steps); this fetches
   * the complete step data needed for animation playback.
   */
  private async enrichMatchup(matchup: ArenaMatchup): Promise<ArenaMatchup> {
    const refA = this.pool.find((c) => c.entry.id === matchup.entryA.id)?.sourceRef;
    const refB = this.pool.find((c) => c.entry.id === matchup.entryB.id)?.sourceRef;

    const [fullA, fullB] = await Promise.all([
      refA ? loadFullSequenceData(refA) : null,
      refB ? loadFullSequenceData(refB) : null,
    ]);

    return {
      ...matchup,
      dataA: fullA ?? matchup.dataA,
      dataB: fullB ?? matchup.dataB,
    };
  }

  private updatePoolRating(updated: ArenaRating): void {
    const idx = this.pool.findIndex((c) => c.entry.id === updated.entryId);
    const existing = this.pool[idx];
    if (idx !== -1 && existing) {
      this.pool[idx] = { entry: existing.entry, data: existing.data, rating: updated };
    }
  }
}
