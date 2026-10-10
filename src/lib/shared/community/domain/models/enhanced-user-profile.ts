/**
 * Enhanced User Profile Models
 * Extends base UserProfile with gamification and social data
 */

import type { UserRole } from "#lib/shared/auth/domain/models/user-role.js";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { PinnedItem } from "./pinned-item";

/**
 * Base User Profile
 * Used by IEnhancedUserService and community components
 */
export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
  // NOTE: Email deliberately omitted - user documents are publicly readable
  // Email is available via Firebase Auth for the user themselves
  sequenceCount: number;
  collectionCount: number;
  followerCount: number;
  joinedDate: Date;
  lastActiveAt?: Date;
  isFollowing?: boolean;

  // Social links
  instagramUsername?: string;
  pronouns?: string;

  // Prop preferences
  /** Props this creator uses (e.g. ["staff", "fan", "club"]) */
  propsISpinWith?: PropType[];
  /** Their single primary identity prop */
  favoriteProp?: PropType | null;
  /** Mirrored from settings: the prop they most recently selected to render
   * with. Inferred identity — display via getEffectiveProp(), which prefers
   * the explicit favoriteProp when set. */
  activeProp?: PropType | null;
  /** Optional catdog combo favorite */
  favoriteCatdog?: {
    leftPropType: PropType;
    rightPropType: PropType;
  } | null;

  // Profile accent color (hex, e.g. "#8b5cf6") for avatar ring and cards
  profileColor?: string;

  /** Pinned showcase items (1-6, any content type) */
  pinnedItems?: PinnedItem[];

  // Admin-related fields
  role?: UserRole;
  isDisabled?: boolean;
  isHidden?: boolean;

}

export interface EnhancedUserProfile extends UserProfile {
  // Base UserProfile fields:
  // id, username, displayName, avatar, email, sequenceCount, collectionCount, followerCount, joinedDate, isFollowing

  // Social additions
  isFeatured: boolean;
  bio?: string;
  followingCount: number;
}

export type CreatorFilterType =
  | "all"
  | "featured"
  | "most-sequences"
  | "most-followers"
  | "newest";

export type CreatorSortCriteria =
  | "lastActive"
  | "joinedDate"
  | "sequenceCount"
  | "followerCount"
  | "favoriteProp";

export interface CreatorQueryOptions {
  filter?: CreatorFilterType;
  sortBy?: CreatorSortCriteria;
  limit?: number;
  offset?: number;
}
