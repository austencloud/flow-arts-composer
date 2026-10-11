import type { DocumentSnapshot } from "firebase/firestore";
import type {
  CreatorSortCriteria,
  EnhancedUserProfile,
} from "../domain/models/enhanced-user-profile";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { Timestamp } from 'firebase/firestore';

/**
 * IUserRepository
 * Service contract for user profiles with social features (follow/unfollow)
 */


/**
 * Result from paginated user queries
 */
export interface PaginatedUsersResult {
  users: EnhancedUserProfile[];
  lastDocSnapshot: DocumentSnapshot | null;
  hasMore: boolean;
}

/**
 * Options for paginated user queries
 */
export interface PaginatedQueryOptions {
  sortBy: CreatorSortCriteria;
  sortDirection: "asc" | "desc";
  limit: number;
  cursor?: DocumentSnapshot | null;
}


export interface ConnectionDocument {
  notes?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface MutualFollowInfo {
  isMutual: boolean;
  iFollowThem: boolean;
  theyFollowMe: boolean;
  mutualSince?: Date;
  iFollowedAt?: Date;
  theyFollowedAt?: Date;
}

export interface SharedSequenceSummary {
  canonicalSignature: string;
  mySequence: {
    id: string;
    name: string;
    word: string;
    thumbnailUrl?: string;
  };
  theirSequence: {
    id: string;
    name: string;
    word: string;
    thumbnailUrl?: string;
  };
}

export interface ConnectionInfo {
  notes: string;
  notesCreatedAt?: Date;
  notesUpdatedAt?: Date;
  mutualFollow: MutualFollowInfo;
  sharedSequences: SharedSequenceSummary[];
  sharedSequenceCount: number;
}


export interface CatdogCombo {
  leftPropType: PropType;
  rightPropType: PropType;
}

export interface PropPreferences {
  propsISpinWith: PropType[];
  favoriteProp: PropType | null;
  favoriteCatdog: CatdogCombo | null;
}
