import { logActivity } from "#lib/shared/analytics/services/posthog-activity-logger.js";

export function trackArenaVoteCompleted(properties: {
  winnerSequenceId: string;
  loserSequenceId: string;
  matchupReason: string;
  sessionVoteNumber: number;
}): void {
  void logActivity("arena_vote_completed", "social", {
    winner_sequence_id: properties.winnerSequenceId,
    loser_sequence_id: properties.loserSequenceId,
    matchup_reason: properties.matchupReason,
    session_vote_number: properties.sessionVoteNumber,
  });
}

export function trackArenaMatchupSkipped(): void {
  void logActivity("arena_matchup_skipped", "social");
}
