/**
 * Version Domain Models
 *
 * Type definitions for app versioning and release tracking.
 */

import type { FeedbackType } from "#lib/shared/feedback/domain/models/feedback-models.js";
import type { ChangelogMedia } from "#lib/shared/versioning/domain/models/version-models.js";

/**
 * Summary counts by feedback type
 */
export interface FeedbackSummary {
  bugs: number;
  features: number;
  general: number;
}

/**
 * Category for changelog entries
 */
export type ChangelogCategory = "fixed" | "added" | "improved";

/**
 * A single user-facing changelog entry
 */
export interface ChangelogEntry {
  category: ChangelogCategory;
  text: string; // User-friendly description of what changed
  feedbackId?: string; // Original feedback ID for linking to details
  contributorIds?: string[]; // References to contributor doc IDs
  media?: ChangelogMedia; // An example of the change: a picture, or a clip with its poster
  /** What "Show me" opens. "global" or absent renders no button. */
  surface?: ChangelogSurface;
  /** A highlight leads the notes; only a highlight carries anchor or callout. */
  highlight?: boolean;
  /** Matches a `data-release-anchor` in the DOM; the arrival pulses it. */
  anchor?: string;
  /** One sentence shown on arrival when there is no anchor to pulse. */
  callout?: string;
}

/** A module, optionally one of its tabs, or "global" for app-wide changes. */
export type ChangelogSurface = { module: string; tab?: string } | "global";

/**
 * App version record stored in Firestore
 */
export interface AppVersion {
  version: string; // Semver format: "0.1.0", "0.2.0"
  releasedAt: Date;
  releaseNotes?: string; // Optional - legacy field for backwards compatibility
  feedbackCount: number; // Denormalized total count
  feedbackSummary: FeedbackSummary;
  changelogEntries?: ChangelogEntry[]; // Curated user-facing changelog (primary display)
  highlights?: string[]; // Optional curated highlights for this release (shown prominently in What's New)
  contributorIds?: string[]; // Version-level summary (union of all entry contributors)
}

/**
 * Lightweight feedback item for version lists
 */
export interface VersionFeedbackItem {
  id: string;
  type: FeedbackType;
  title: string;
  description: string; // May be truncated for display
}

/**
 * Form data for preparing a release
 */
export interface PrepareReleaseFormData {
  version: string;
}

/**
 * Validation errors for release form
 */
export interface PrepareReleaseFormErrors {
  version?: string;
}

/**
 * Pre-release version for existing archived feedback
 */
export const PRE_RELEASE_VERSION = "0.0.0";
