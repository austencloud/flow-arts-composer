/**
 * User Preview Context
 *
 * Provides a way for components throughout the app to access previewed user data.
 * When preview mode is active, components can use this to display the previewed
 * user's data instead of the actual logged-in user's data.
 *
 * Usage:
 * - Import `useUserPreview()` in any component that displays user-specific data
 * - Check `preview.isActive` to see if preview mode is on
 * - Use `preview.getEffective*()` helpers to get the right value automatically
 */

import { getContext, setContext } from "svelte";
import {
  userPreviewState,
  loadPreviewSection,
  isSectionLoaded,
  type PreviewUserProfile,
  type PreviewSequence,
  type PreviewCollection,
  type PreviewNotification,
  type LazySection,
} from "../state/user-preview-state.svelte";

const PREVIEW_CONTEXT_KEY = Symbol("user-preview");

// Types

export interface UserPreviewContext {
  /** Whether preview mode is active */
  readonly isActive: boolean;

  /** Whether the app should be in read-only mode (same as isActive, but clearer intent) */
  readonly isReadOnly: boolean;

  /** Whether preview data is loading */
  readonly isLoading: boolean;

  /** Current loading section (if any) */
  readonly loadingSection: string | null;

  /** Error message (if any) */
  readonly error: string | null;

  /** The previewed user's profile (or null if not previewing) */
  readonly profile: PreviewUserProfile | null;

  /** The previewed user's sequences */
  readonly sequences: PreviewSequence[];

  /** The previewed user's collections */
  readonly collections: PreviewCollection[];

  /** The previewed user's notifications */
  readonly notifications: PreviewNotification[];

  /** Get the effective user ID (previewed or actual) */
  getEffectiveUserId(actualUserId: string | null): string | null;

  /** Get the effective display name (previewed or actual) */
  getEffectiveDisplayName(actualDisplayName: string | null): string | null;

  /** Get the effective photo URL (previewed or actual) */
  getEffectivePhotoURL(actualPhotoURL: string | null): string | null;

  /** Get the effective email (previewed or actual) */
  getEffectiveEmail(actualEmail: string | null): string | null;

  /** Get effective sequences (previewed or actual) */
  getEffectiveSequences<T>(actual: T[]): T[] | PreviewSequence[];

  /** Get effective collections (previewed or actual) */
  getEffectiveCollections<T>(actual: T[]): T[] | PreviewCollection[];

  /** Check if a lazy section has been loaded */
  isSectionLoaded(section: LazySection): boolean;

  /** Lazy-load a specific section (sequences, collections, etc.) */
  loadSection(section: LazySection): Promise<void>;
}

// Context Implementation

function createPreviewContext(): UserPreviewContext {
  return {
    get isActive() {
      return userPreviewState.isActive;
    },

    get isReadOnly() {
      return userPreviewState.isActive;
    },

    get isLoading() {
      return userPreviewState.isLoading;
    },

    get loadingSection() {
      return userPreviewState.loadingSection;
    },

    get error() {
      return userPreviewState.error;
    },

    get profile() {
      return userPreviewState.data.profile;
    },

    get sequences() {
      return userPreviewState.data.sequences;
    },

    get collections() {
      return userPreviewState.data.collections;
    },

    get notifications() {
      return userPreviewState.data.notifications;
    },

    getEffectiveUserId(actualUserId: string | null): string | null {
      if (userPreviewState.isActive && userPreviewState.data.profile) {
        return userPreviewState.data.profile.uid;
      }
      return actualUserId;
    },

    getEffectiveDisplayName(actualDisplayName: string | null): string | null {
      if (userPreviewState.isActive && userPreviewState.data.profile) {
        return userPreviewState.data.profile.displayName;
      }
      return actualDisplayName;
    },

    getEffectivePhotoURL(actualPhotoURL: string | null): string | null {
      if (userPreviewState.isActive && userPreviewState.data.profile) {
        return userPreviewState.data.profile.photoURL;
      }
      return actualPhotoURL;
    },

    getEffectiveEmail(actualEmail: string | null): string | null {
      if (userPreviewState.isActive && userPreviewState.data.profile) {
        return userPreviewState.data.profile.email;
      }
      return actualEmail;
    },

    getEffectiveSequences<T>(actual: T[]): T[] | PreviewSequence[] {
      if (userPreviewState.isActive) {
        return userPreviewState.data.sequences;
      }
      return actual;
    },

    getEffectiveCollections<T>(actual: T[]): T[] | PreviewCollection[] {
      if (userPreviewState.isActive) {
        return userPreviewState.data.collections;
      }
      return actual;
    },

    isSectionLoaded(section: LazySection): boolean {
      return isSectionLoaded(section);
    },

    loadSection(section: LazySection): Promise<void> {
      return loadPreviewSection(section);
    },
  };
}

// Context Hooks

/**
 * Initialize the user preview context.
 * Call this once at the app root level.
 */
export function initUserPreviewContext(): UserPreviewContext {
  const context = createPreviewContext();
  setContext(PREVIEW_CONTEXT_KEY, context);
  return context;
}

/**
 * Get the user preview context.
 * Use this in components to check if preview mode is active and get preview data.
 *
 * @example
 * ```svelte
 * <script>
 *   import { useUserPreview } from "#lib/shared/debug/context/user-preview-context.js";
 *   import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
 *
 *   const preview = useUserPreview();
 *
 *   // Get the effective display name (previewed or actual)
 *   const displayName = $derived(
 *     preview.getEffectiveDisplayName(authState.user?.displayName ?? null)
 *   );
 * </script>
 * ```
 */
export function useUserPreview(): UserPreviewContext {
  const context = getContext<UserPreviewContext>(PREVIEW_CONTEXT_KEY);

  // If context not found, return a safe fallback that always returns actual values
  if (!context) {
    return createPreviewContext();
  }

  return context;
}

/**
 * Direct access to preview state (for use outside of components).
 * Prefer useUserPreview() in components.
 */
export { userPreviewState };

// Re-export lazy loading functions for non-component code
export { loadPreviewSection, isSectionLoaded };
export type { LazySection };
