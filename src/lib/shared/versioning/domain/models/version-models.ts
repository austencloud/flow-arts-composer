/**
 * Version Domain Models
 *
 * Type definitions for app versioning and release tracking.
 */

import type { FeedbackType } from "./feedback-type";

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
}

/**
 * A picture or short clip showing a changelog entry. `image` is the still
 * (or GIF, for email); `video` is the clip the app plays instead when present,
 * over `poster` while it loads (the `image` when there is no poster).
 * The size is the file's own, so the frame can be reserved before it loads.
 */
export interface ChangelogMedia {
  image: string;
  video?: string;
  poster?: string;
  alt: string;
  width: number;
  height: number;
}

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

/**
 * Compare two semver-ish version strings numerically.
 *
 * Returns -1 if `a < b`, 1 if `a > b`, 0 if equal.
 *
 * Numeric-aware (so "0.9.0" < "0.10.0", which a plain string compare gets
 * wrong). A bare release outranks a pre-release of the same core
 * ("0.24.0" > "0.24.0-beta"); two pre-releases fall back to string order.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): { nums: number[]; pre: string | null } => {
    const [core = "0", pre = null] = v.trim().split("-", 2);
    const nums = core.split(".").map((n) => parseInt(n, 10) || 0);
    while (nums.length < 3) nums.push(0);
    return { nums, pre };
  };

  const pa = parse(a);
  const pb = parse(b);

  for (let i = 0; i < 3; i++) {
    if (pa.nums[i] !== pb.nums[i]) return pa.nums[i]! < pb.nums[i]! ? -1 : 1;
  }

  // Cores equal: a release (no pre-release) outranks a pre-release.
  if (pa.pre === pb.pre) return 0;
  if (pa.pre === null) return 1;
  if (pb.pre === null) return -1;
  return pa.pre < pb.pre ? -1 : pa.pre > pb.pre ? 1 : 0;
}
