/**
 * User Preview State
 *
 * Comprehensive read-only preview of another user's data for admin debugging.
 * The Firestore reads live in ../services/user-preview-fetchers.ts.
 */
import { browser } from "$app/env";
import type { AppSettings } from "#lib/shared/settings/domain/app-settings.js";
import type { NotificationPreferences } from "#lib/shared/notifications/domain/models/notification-models.js";
import {
  fetchAuthData,
  fetchCollections,
  fetchNotificationPreferences,
  fetchNotifications,
  fetchProfile,
  fetchSequences,
  fetchSettings,
} from "../services/user-preview-fetchers";

// Types

export interface PreviewUserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  username?: string;
  role?: string;
  createdAt?: string;
  lastActivityDate?: string;
}

export interface PreviewSequence {
  id: string;
  name: string;
  word?: string;
  thumbnailUrl?: string;
  createdAt?: string;
  isPublic?: boolean;
  favoriteCount?: number;
}

export interface PreviewCollection {
  id: string;
  name: string;
  description?: string;
  sequenceCount: number;
  isSystem?: boolean;
  createdAt?: string;
}

export interface PreviewNotification {
  id: string;
  type: string;
  title?: string;
  message?: string;
  read?: boolean;
  createdAt?: string;
}

export interface PreviewAuthProvider {
  providerId: string;
  uid: string;
  displayName: string | null;
  email: string | null;
  phoneNumber: string | null;
  photoURL: string | null;
}

export interface PreviewMFAFactor {
  uid: string;
  displayName: string | null;
  factorId: string;
  enrollmentTime: string | undefined;
}

export interface PreviewAuthData {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoURL: string | null;
  phoneNumber: string | null;
  disabled: boolean;
  providers: PreviewAuthProvider[];
  metadata: {
    creationTime: string | undefined;
    lastSignInTime: string | undefined;
  };
  multiFactor: {
    enrolledFactors: PreviewMFAFactor[];
  } | null;
}

export interface UserPreviewData {
  profile: PreviewUserProfile | null;
  sequences: PreviewSequence[];
  collections: PreviewCollection[];
  notifications: PreviewNotification[];
  settings: AppSettings | null;
  authData: PreviewAuthData | null;
  notificationPreferences: NotificationPreferences | null;
}

export type LazySection =
  | "sequences"
  | "collections"
  | "notifications"
  | "authData"
  | "notificationPreferences";

interface UserPreviewState {
  isActive: boolean;
  isLoading: boolean;
  loadingSection: string | null;
  error: string | null;
  data: UserPreviewData;
  loadedSections: Set<LazySection>;
}

// Persistence

const PREVIEW_USER_ID_KEY = "tka-admin-preview-uid";

function savePreviewUserId(userId: string): void {
  if (!browser) return;
  try {
    localStorage.setItem(PREVIEW_USER_ID_KEY, userId);
  } catch {
    // localStorage may be unavailable
  }
}

function clearPreviewUserId(): void {
  if (!browser) return;
  try {
    localStorage.removeItem(PREVIEW_USER_ID_KEY);
  } catch {
    // localStorage may be unavailable
  }
}

function getSavedPreviewUserId(): string | null {
  if (!browser) return null;
  try {
    return localStorage.getItem(PREVIEW_USER_ID_KEY);
  } catch {
    return null;
  }
}

// State

const initialData: UserPreviewData = {
  profile: null,
  sequences: [],
  collections: [],
  notifications: [],
  settings: null,
  authData: null,
  notificationPreferences: null,
};

export const userPreviewState = $state<UserPreviewState>({
  isActive: false,
  isLoading: false,
  loadingSection: null,
  error: null,
  data: { ...initialData },
  loadedSections: new Set(),
});

// ============================================================================
// Actions
// ============================================================================

/**
 * Load user preview - initially only loads profile (lightweight).
 * Other sections are lazy-loaded on demand via loadPreviewSection.
 */
export async function loadUserPreview(
  userId: string,
  eager = false
): Promise<void> {
  if (!browser) return;

  userPreviewState.isLoading = true;
  userPreviewState.loadingSection = "profile";
  userPreviewState.error = null;
  userPreviewState.loadedSections = new Set();

  // Persist the preview user ID for page refresh
  savePreviewUserId(userId);

  try {
    if (eager) {
      // Load all data in parallel
      const [
        profile,
        sequences,
        collections,
        notifications,
        settings,
        authData,
        notificationPreferences,
      ] = await Promise.all([
        fetchProfile(userId),
        fetchSequences(userId),
        fetchCollections(userId),
        fetchNotifications(userId),
        fetchSettings(userId),
        fetchAuthData(userId),
        fetchNotificationPreferences(userId),
      ]);

      userPreviewState.data = {
        profile,
        sequences,
        collections,
        notifications,
        settings,
        authData,
        notificationPreferences,
      };
      userPreviewState.loadedSections = new Set([
        "sequences",
        "collections",
        "notifications",
        "authData",
        "notificationPreferences",
      ]);
    } else {
      // Lazy mode: fetch profile, settings, and notification preferences initially
      // These are needed immediately for ProfileTab
      const [profile, settings, notificationPreferences] =
        await Promise.all([
          fetchProfile(userId),
          fetchSettings(userId),
          fetchNotificationPreferences(userId),
        ]);

      userPreviewState.data = {
        profile,
        sequences: [],
        collections: [],
        notifications: [],
        settings,
        authData: null,
        notificationPreferences,
      };
    }

    userPreviewState.isActive = true;
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to load user preview";
    userPreviewState.error = message;
    userPreviewState.isActive = false;
    userPreviewState.data = { ...initialData };
  } finally {
    userPreviewState.isLoading = false;
    userPreviewState.loadingSection = null;
  }
}

/**
 * Lazy-load a specific section of preview data.
 */
export async function loadPreviewSection(section: LazySection): Promise<void> {
  if (!browser || !userPreviewState.isActive || !userPreviewState.data.profile)
    return;
  if (userPreviewState.loadedSections.has(section)) return;

  const userId = userPreviewState.data.profile.uid;
  userPreviewState.loadingSection = section;

  try {
    switch (section) {
      case "sequences":
        userPreviewState.data.sequences = await fetchSequences(userId);
        break;
      case "collections":
        userPreviewState.data.collections = await fetchCollections(userId);
        break;
      case "notifications":
        userPreviewState.data.notifications = await fetchNotifications(userId);
        break;
      case "authData":
        userPreviewState.data.authData = await fetchAuthData(userId);
        break;
      case "notificationPreferences":
        userPreviewState.data.notificationPreferences =
          await fetchNotificationPreferences(userId);
        break;
    }

    userPreviewState.loadedSections.add(section);
  } catch (err) {
    console.error(`[UserPreview] Failed to load ${section}:`, err);
  } finally {
    userPreviewState.loadingSection = null;
  }
}

/**
 * Refresh a specific section of the preview data
 */
export async function refreshPreviewSection(
  section: LazySection
): Promise<void> {
  if (!browser || !userPreviewState.isActive || !userPreviewState.data.profile)
    return;

  const userId = userPreviewState.data.profile.uid;
  userPreviewState.loadingSection = section;

  try {
    switch (section) {
      case "sequences":
        userPreviewState.data.sequences = await fetchSequences(userId);
        break;
      case "collections":
        userPreviewState.data.collections = await fetchCollections(userId);
        break;
      case "notifications":
        userPreviewState.data.notifications = await fetchNotifications(userId);
        break;
      case "authData":
        userPreviewState.data.authData = await fetchAuthData(userId);
        break;
      case "notificationPreferences":
        userPreviewState.data.notificationPreferences =
          await fetchNotificationPreferences(userId);
        break;
    }
  } catch (err) {
    console.error(`[UserPreview] Failed to refresh ${section}:`, err);
  } finally {
    userPreviewState.loadingSection = null;
  }
}

/**
 * Clear the user preview
 */
export function clearUserPreview(): void {
  clearPreviewUserId();
  userPreviewState.isActive = false;
  userPreviewState.isLoading = false;
  userPreviewState.loadingSection = null;
  userPreviewState.error = null;
  userPreviewState.data = { ...initialData };
  userPreviewState.loadedSections = new Set();
}

/**
 * Check if a section has been loaded
 */
export function isSectionLoaded(section: LazySection): boolean {
  return userPreviewState.loadedSections.has(section);
}

// ============================================================================
// Derived Helpers
// ============================================================================

/**
 * Get the effective user ID (previewed or actual)
 */
export function getEffectiveUserId(actualUserId: string | null): string | null {
  if (userPreviewState.isActive && userPreviewState.data.profile) {
    return userPreviewState.data.profile.uid;
  }
  return actualUserId;
}

/**
 * Get the effective display name
 */
export function getEffectiveDisplayName(
  actualDisplayName: string | null
): string | null {
  if (userPreviewState.isActive && userPreviewState.data.profile) {
    return userPreviewState.data.profile.displayName;
  }
  return actualDisplayName;
}

/**
 * Get the effective photo URL
 */
export function getEffectivePhotoURL(
  actualPhotoURL: string | null
): string | null {
  if (userPreviewState.isActive && userPreviewState.data.profile) {
    return userPreviewState.data.profile.photoURL;
  }
  return actualPhotoURL;
}

/**
 * Check if the app is in read-only preview mode.
 */
export function isPreviewReadOnly(): boolean {
  return userPreviewState.isActive;
}

/**
 * Get the previewed user's settings (or null if not in preview mode)
 */
export function getPreviewSettings(): AppSettings | null {
  if (!userPreviewState.isActive) return null;
  return userPreviewState.data.settings;
}

/**
 * Get the previewed user's notification preferences (or null if not in preview mode)
 */
export function getPreviewNotificationPreferences(): NotificationPreferences | null {
  if (!userPreviewState.isActive) return null;
  return userPreviewState.data.notificationPreferences;
}

/**
 * Initialize user preview from persisted state (call on app mount).
 * Restores preview if one was active before page refresh.
 */
export async function initUserPreview(): Promise<void> {
  if (!browser) return;

  const savedUserId = getSavedPreviewUserId();
  if (savedUserId && !userPreviewState.isActive) {
    await loadUserPreview(savedUserId, true);
  }
}
