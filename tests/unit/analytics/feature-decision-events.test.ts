import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/shared/analytics/services/posthog-activity-logger.js", () => ({
  logActivity: vi.fn(),
}));

import { logActivity } from "#lib/shared/analytics/services/posthog-activity-logger.js";
import {
  trackArenaMatchupSkipped,
  trackArenaVoteCompleted,
} from "#lib/features/arena/analytics/arena-events.js";
import {
  trackCompositionDeleted,
  trackCompositionFavoriteChanged,
  trackCompositionSaved,
} from "#lib/features/compose/analytics/compose-events.js";
import { trackTikaQuestionSubmitted } from "#lib/features/tika/analytics/tika-events.js";
import {
  trackTrainSessionCompleted,
  trackTrainSessionStarted,
} from "#lib/features/train/analytics/train-events.js";
import { trackFeedbackSubmitted } from "#lib/shared/analytics/feedback-events.js";
import {
  trackFestivalSubmitted,
  trackFestivalTrackerChanged,
  trackFestivalTrackerRemoved,
} from "#lib/features/festivals/analytics/festival-events.js";
import {
  trackChoreoSheetDeleted,
  trackChoreoSheetExported,
  trackChoreoSheetSaved,
} from "#lib/features/write/analytics/choreo-events.js";

describe("production module decision events", () => {
  beforeEach(() => vi.mocked(logActivity).mockClear());

  it("captures completed Arena decisions after persistence", () => {
    trackArenaVoteCompleted({
      winnerSequenceId: "winner-1",
      loserSequenceId: "loser-1",
      matchupReason: "close_rating",
      sessionVoteNumber: 3,
    });
    trackArenaMatchupSkipped();

    expect(vi.mocked(logActivity).mock.calls).toEqual([
      [
        "arena_vote_completed",
        "social",
        {
          winner_sequence_id: "winner-1",
          loser_sequence_id: "loser-1",
          matchup_reason: "close_rating",
          session_vote_number: 3,
        },
      ],
      ["arena_matchup_skipped", "social"],
    ]);
  });

  it("captures Tika question intent without message content", () => {
    trackTikaQuestionSubmitted({
      mode: "compare",
      modelCount: 2,
      authenticated: true,
    });

    expect(logActivity).toHaveBeenCalledWith(
      "tika_question_submitted",
      "learn",
      { mode: "compare", model_count: 2, authenticated: true }
    );
  });

  it("captures Train start and completion aggregates", () => {
    trackTrainSessionStarted({
      sequenceId: "sequence-1",
      bpm: 90,
      detectionMethod: "hand_tracking",
      totalSteps: 16,
    });
    trackTrainSessionCompleted({
      sequenceId: "sequence-1",
      bpm: 90,
      practiceMode: "full_sequence",
      totalSteps: 16,
      totalHits: 14,
      totalMisses: 2,
      maxCombo: 8,
      score: 1400,
      accuracy: 87.53,
      grade: "A",
      durationSeconds: 45.4,
    });

    expect(vi.mocked(logActivity).mock.calls).toEqual([
      [
        "train_session_started",
        "learn",
        {
          sequenceId: "sequence-1",
          bpm: 90,
          detection_method: "hand_tracking",
          total_steps: 16,
        },
      ],
      [
        "train_session_completed",
        "learn",
        {
          sequenceId: "sequence-1",
          bpm: 90,
          practice_mode: "full_sequence",
          total_steps: 16,
          total_hits: 14,
          total_misses: 2,
          max_combo: 8,
          score: 1400,
          accuracy: 87.5,
          grade: "A",
          duration: 45400,
        },
      ],
    ]);
  });

  it("captures durable Compose mutations after the local write", () => {
    trackCompositionSaved({
      compositionId: "composition-1",
      cellCount: 4,
      rows: 2,
      columns: 2,
    });
    trackCompositionFavoriteChanged("composition-1", true);
    trackCompositionDeleted("composition-1");

    expect(vi.mocked(logActivity).mock.calls).toEqual([
      [
        "composition_saved",
        "sequence",
        {
          composition_id: "composition-1",
          cell_count: 4,
          rows: 2,
          columns: 2,
        },
      ],
      [
        "composition_favorite_changed",
        "sequence",
        { composition_id: "composition-1", favorite: true },
      ],
      ["composition_deleted", "sequence", { composition_id: "composition-1" }],
    ]);
  });

  it("captures feedback completion without feedback copy", () => {
    trackFeedbackSubmitted({
      feedbackId: "feedback-1",
      type: "bug",
      module: "browse",
      tab: "gallery",
      imageCount: 2,
    });

    expect(logActivity).toHaveBeenCalledWith("feedback_submitted", "social", {
      feedback_id: "feedback-1",
      feedback_type: "bug",
      module: "browse",
      tab: "gallery",
      image_count: 2,
    });
  });

  it("captures festival submissions and bounded tracker mutations", () => {
    trackFestivalSubmitted("submission-1");
    trackFestivalTrackerChanged({
      festivalId: "festival-1",
      status: "applying",
      changedFields: ["notes", "status"],
    });
    trackFestivalTrackerRemoved("festival-2");

    expect(vi.mocked(logActivity).mock.calls).toEqual([
      ["festival_submitted", "social", { submission_id: "submission-1" }],
      [
        "festival_tracker_changed",
        "social",
        {
          festival_id: "festival-1",
          status: "applying",
          changed_fields: ["notes", "status"],
        },
      ],
      ["festival_tracker_removed", "social", { festival_id: "festival-2" }],
    ]);
  });

  it("captures Choreo sheet save, export, and delete outcomes", () => {
    trackChoreoSheetSaved({
      sheetId: "sheet-1",
      sequenceCount: 6,
      orientation: "landscape",
      columns: 4,
    });
    trackChoreoSheetExported({
      sheetId: "sheet-1",
      pageCount: 2,
      sequenceCount: 6,
    });
    trackChoreoSheetDeleted("sheet-1");

    expect(vi.mocked(logActivity).mock.calls).toEqual([
      [
        "choreo_sheet_saved",
        "sequence",
        {
          sheet_id: "sheet-1",
          sequence_count: 6,
          orientation: "landscape",
          columns: 4,
        },
      ],
      [
        "choreo_sheet_exported",
        "share",
        {
          sheet_id: "sheet-1",
          page_count: 2,
          sequence_count: 6,
          export_format: "pdf",
        },
      ],
      ["choreo_sheet_deleted", "sequence", { sheet_id: "sheet-1" }],
    ]);
  });
});
