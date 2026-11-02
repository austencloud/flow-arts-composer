/**
 * Activity Event Model
 *
 * Represents a single user activity event for analytics tracking.
 * Events are stored in Firestore under users/{userId}/activityLog
 */

/**
 * Categories of activity events
 */
export type ActivityCategory =
  | "session" // Login, logout, app open
  | "navigation" // Module/page views
  | "sequence" // Create, edit, save, delete sequences
  | "share" // Share actions
  | "social" // Follow, like, comment
  | "learn" // Quiz, lessons, tutorials
  | "settings" // Settings changes
  | "shop"; // Storefront configurator interactions

/**
 * Specific event types within each category
 */
export type ActivityEventType =
  // Session events
  | "session_start"
  | "session_end"
  // Navigation events
  | "module_view"
  | "panel_open"
  | "panel_close"
  // Sequence events
  | "sequence_create"
  | "sequence_save"
  | "sequence_delete"
  | "sequence_edit"
  | "sequence_view"
  | "sequence_play" // Animation playback
  | "sequence_generate" // Auto-generation
  | "sequence_remix_started"
  | "composition_saved"
  | "composition_deleted"
  | "composition_favorite_changed"
  | "choreo_sheet_saved"
  | "choreo_sheet_deleted"
  // Share events
  | "sequence_share"
  | "sequence_export"
  | "link_copy"
  | "choreo_sheet_exported"
  // Social events
  | "user_follow"
  | "user_unfollow"
  | "collection_followed"
  | "collection_unfollowed"
  | "creator_profile_opened"
  | "arena_vote_completed"
  | "arena_matchup_skipped"
  | "feedback_submitted"
  | "festival_submitted"
  | "festival_tracker_changed"
  | "festival_tracker_removed"
  | "sequence_like"
  | "sequence_unlike"
  | "sequence_favorite"
  | "sequence_unfavorite"
  // Shared viewer decision events
  | "viewer_action"
  | "viewer_export"
  | "viewer_open_timing"
  | "viewer_playback_changed"
  | "viewer_practice_changed"
  | "viewer_setting_changed"
  | "viewer_view_changed"
  // Learn events
  | "lesson_start"
  | "lesson_complete"
  | "quiz_start"
  | "quiz_complete"
  | "quiz_answer"
  | "tika_question_submitted"
  | "train_session_started"
  | "train_session_completed"
  // Settings events
  | "setting_change"
  | "prop_type_change"
  | "theme_change"
  // Shop events (usage-gated features: if nobody fires these, the feature goes)
  | "shop_loop_advanced_opened"
  | "shop_loop_advanced_customized"
  | "shop_loop_pack_selected"
  | "shop_loop_custom_entered"
  | "shop_loop_architect_opened"
  // Shop conversion funnel — ordered steps, chartable end to end in PostHog.
  // These overlap the usage-gate events above on purpose: those answer "is the
  // feature used", these answer "where does the buyer drop off". Don't collapse
  // one into the other. Spec: docs/architecture/landing-analytics-taxonomy.md
  | "shop_product_viewed"
  | "shop_variant_selected"
  | "shop_add_to_cart"
  | "shop_cart_opened"
  | "shop_checkout_started"
  | "shop_purchase_completed";

/**
 * Metadata that can be attached to events
 */
export interface ActivityMetadata {
  // Navigation context
  module?: string;
  panel?: string;
  previousModule?: string;

  // Sequence context
  sequenceId?: string;
  sequenceWord?: string;
  sequenceLength?: number;
  isPublic?: boolean;

  // Generation context
  generationType?: string;
  loopType?: string;

  // Learn context
  lessonId?: string;
  quizId?: string;
  score?: number;
  correct?: boolean;

  // Settings context
  settingKey?: string;
  oldValue?: string | number | boolean;
  newValue?: string | number | boolean;

  // Share context
  shareMethod?: string;
  exportFormat?: string;

  // Social context
  targetUserId?: string;

  // Duration tracking (ms)
  duration?: number;

  // Any additional custom data
  [key: string]: unknown;
}

/**
 * A single activity event
 */
export interface ActivityEvent {
  /** Unique event ID (auto-generated) */
  id?: string;

  /** User who performed the action */
  userId: string;

  /** Session ID for grouping events */
  sessionId?: string;

  /** Category of the event */
  category: ActivityCategory;

  /** Specific event type */
  eventType: ActivityEventType;

  /** When the event occurred */
  timestamp: Date;

  /** Additional event-specific data */
  metadata?: ActivityMetadata;

  /** Client info for debugging */
  client?: {
    userAgent?: string;
    platform?: string;
    screenWidth?: number;
    screenHeight?: number;
  };
}

/**
 * Summary of activity for a time period
 */
export interface ActivitySummary {
  /** Date of the summary (YYYY-MM-DD) */
  date: string;

  /** Number of unique active users */
  activeUsers: number;

  /** Total events logged */
  totalEvents: number;

  /** Breakdown by category */
  byCategory: Record<ActivityCategory, number>;

  /** Breakdown by event type */
  byEventType: Record<string, number>;
}
