/**
 * Global Feature Flag Persister Interface
 *
 * Persists admin-set global feature flag overrides to Firestore
 * so they apply across all users and devices, not just the admin's browser.
 */

import type { UserRole } from "../domain/models/user-role";

export interface GlobalFlagOverrides {
  globalFlagOverrides: Record<string, boolean>;
  globalRoleOverrides: Record<string, UserRole>;
}

/**
 * Impersonation Service Interface
 *
 * Provides admin "View As" functionality for support/debugging.
 */

export interface ImpersonatedUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
}

/**
 * ProfilePictureManager
 *
 * Contract for managing user profile pictures from OAuth providers.
 * Handles provider-specific logic for Facebook and Google profile pictures.
 */

import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

export interface GeneratedAvatarData {
  gradientId: string;
  gradient: string;
  propType: PropType;
}

