/**
 * Hall of Shame Domain Models
 *
 * Types for the age-gated adult gallery where flagged content
 * can be submitted and celebrated instead of hidden.
 */

import type { Timestamp } from 'firebase/firestore';
import type { FlaggedTerm } from '#lib/features/moderation/domain/models/content-moderation-models.js';

// Enums & Constants

export type ShameCategory = 'profanity' | 'sexual' | 'creative';

export type ShameEntryStatus = 'pending' | 'approved' | 'rejected';

export const SHAME_CATEGORIES: readonly ShameCategory[] = ['profanity', 'sexual', 'creative'] as const;

export const SHAME_CATEGORY_LABELS: Record<ShameCategory, string> = {
	profanity: 'Profanity',
	sexual: 'Crude',
	creative: 'Creative'
};

export const SHAME_CATEGORY_DESCRIPTIONS: Record<ShameCategory, string> = {
	profanity: 'Swear words and expletives',
	sexual: 'Anatomical terms and crude references',
	creative: 'Clever, cheeky, or borderline words'
};

// Core Models

/**
 * A sequence submitted to the Hall of Shame
 */
export interface HallOfShameEntry {
	id: string;

	// Source reference
	sourceSequenceId: string;
	ownerId: string;
	ownerDisplayName: string;
	ownerUsername?: string;

	// Content
	word: string;
	displayName?: string;
	thumbnails: string[];
	sequenceLength: number;
	difficulty?: number;

	// Moderation
	flaggedTerms: FlaggedTerm[];
	category: ShameCategory;

	// Lifecycle
	status: ShameEntryStatus;
	submittedAt: Timestamp;
	approvedAt?: Timestamp;
	approvedBy?: string;
	rejectedAt?: Timestamp;
	rejectedBy?: string;
	rejectionReason?: string;

	// Features
	featured: boolean;
	featuredAt?: Timestamp;
	featuredBy?: string;

	// Engagement
	voteCount: number;
	viewCount: number;

	// Safety
	reportCount: number;
	lastReportedAt?: Timestamp;
	hidden: boolean;
}

/**
 * A vote cast for a Hall of Shame entry
 */
export interface HallOfShameVote {
	voterId: string;
	sequenceId: string;
	votedAt: Timestamp;
}

// DTOs & Params

/**
 * Parameters for submitting a sequence to Hall of Shame
 */
export interface ShameSubmissionParams {
	sourceSequenceId: string;
	userId: string;
	word: string;
	thumbnails: string[];
	sequenceLength: number;
	flaggedTerms: FlaggedTerm[];
	category: ShameCategory;
	displayName?: string;
	difficulty?: number;
}

/**
 * Parameters for loading Hall of Shame entries
 */
export interface ShameLoadParams {
	category?: ShameCategory;
	sortBy: ShameSortOption;
	limit: number;
	cursor?: string;
	ownerId?: string;
}

export type ShameSortOption = 'newest' | 'mostVoted' | 'mostViewed';

/**
 * Paginated result for gallery loading
 */
export interface PaginatedShameResult {
	items: HallOfShameEntry[];
	nextCursor?: string;
	hasMore: boolean;
	totalCount?: number;
}

// Category Counts

export type ShameCategoryCounts = Record<ShameCategory, number>;

// Submission Rate Limiting

export const MAX_SUBMISSIONS_PER_DAY = 3;

/**
 * Tracks daily submission count for rate limiting
 */
export interface UserSubmissionCount {
	userId: string;
	date: string; // YYYY-MM-DD in UTC
	count: number;
}
