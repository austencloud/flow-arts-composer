/**
 * One open profile: its load, its failure, and the viewer's follow press.
 *
 * Lives apart from UserProfilePanel so these paths can be tested without a DOM.
 * A failed follow must never touch `failure`: that used to swap the whole page
 * for "Profile Not Found" when a follow was refused.
 */
import type { EnhancedUserProfile } from "#lib/shared/community/domain/models/enhanced-user-profile.js";
import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";
import {
  classifyLoadFailure,
  type LoadFailure,
} from "../domain/profile-viewer";

export type ProfileFailure = "not-found" | LoadFailure;

export interface ProfileSessionDeps {
  fetchProfile(
    userId: string,
    viewerId: string | undefined
  ): Promise<EnhancedUserProfile | null>;
  fetchSequences(userId: string, isOwn: boolean): Promise<LibrarySequence[]>;
  /** The repository shows the failure toast and rethrows. */
  follow(viewerId: string, targetId: string): Promise<void>;
  unfollow(viewerId: string, targetId: string): Promise<void>;
  setDisabled(userId: string, disabled: boolean): Promise<void>;
  /** Saved art is owner-only; only ever started for the viewer's own uid. */
  startOwnStores(userId: string): void;
}

export function createProfileSession(
  userId: string,
  deps: ProfileSessionDeps
) {
  let profile = $state<EnhancedUserProfile | null>(null);
  let sequences = $state<LibrarySequence[]>([]);
  let isLoading = $state(true);
  let failure = $state<ProfileFailure | null>(null);
  let followInProgress = $state(false);
  // The viewer the shown profile was loaded for. A later viewer (auth restored
  // after the shell rendered, sign-out, account switch) loads it again so
  // isFollowing and own-profile are right for them.
  let loadedFor: { viewerId: string | undefined } | null = null;
  // Only the newest load may write; an older one that lands late is dropped.
  let latestRequest = 0;

  async function load(viewerId: string | undefined): Promise<void> {
    loadedFor = { viewerId };
    const request = ++latestRequest;
    const isCurrent = () => request === latestRequest;
    const isOwn = viewerId === userId;
    try {
      const loaded = await deps.fetchProfile(userId, viewerId);
      if (!isCurrent()) return;
      if (!loaded) {
        profile = null;
        failure = "not-found";
        return;
      }
      profile = loaded;
      failure = null;

      // Started here, not only in the stage, because the layout decision needs
      // these counts and the stage does not mount until that decision is made;
      // leaving it to the stage would deadlock an own profile whose only
      // content is saved art. Idempotent, so the stage's own call is free.
      if (isOwn) deps.startOwnStores(userId);

      const loadedSequences = await deps.fetchSequences(userId, isOwn);
      if (!isCurrent()) return;
      sequences = loadedSequences;
      if (loaded.sequenceCount !== loadedSequences.length) {
        profile = { ...loaded, sequenceCount: loadedSequences.length };
      }
    } catch (err) {
      if (!isCurrent()) return;
      console.error(`[ProfileSession] Error loading profile:`, err);
      failure = classifyLoadFailure(err);
    } finally {
      if (isCurrent()) isLoading = false;
    }
  }

  /**
   * Load for this viewer unless the shown profile already is. The first call
   * is the first load. The page stays up while a later one runs; it swaps in
   * when it lands.
   */
  function syncViewer(viewerId: string | undefined): Promise<void> {
    if (loadedFor && loadedFor.viewerId === viewerId) return Promise.resolve();
    return load(viewerId);
  }

  /** Returns the new following state, or null when nothing changed. */
  async function toggleFollow(viewerId: string): Promise<boolean | null> {
    if (!profile || followInProgress || viewerId === userId) return null;
    const wasFollowing = profile.isFollowing === true;
    followInProgress = true;
    try {
      if (wasFollowing) await deps.unfollow(viewerId, userId);
      else await deps.follow(viewerId, userId);
      if (profile) {
        profile = {
          ...profile,
          isFollowing: !wasFollowing,
          followerCount: Math.max(
            0,
            profile.followerCount + (wasFollowing ? -1 : 1)
          ),
        };
      }
      return !wasFollowing;
    } catch (err) {
      // Nothing was changed optimistically, so the button is already right.
      console.error("[ProfileSession] Follow toggle failed:", err);
      return null;
    } finally {
      followInProgress = false;
    }
  }

  /** Admin moderation. Returns whether the write landed. */
  async function setDisabled(disabled: boolean): Promise<boolean> {
    if (!profile) return false;
    try {
      await deps.setDisabled(userId, disabled);
      profile = { ...profile, isDisabled: disabled };
      return true;
    } catch (err) {
      console.error("[ProfileSession] Moderation write failed:", err);
      return false;
    }
  }

  return {
    get profile() {
      return profile;
    },
    get sequences() {
      return sequences;
    },
    get isLoading() {
      return isLoading;
    },
    get failure() {
      return failure;
    },
    get followInProgress() {
      return followInProgress;
    },
    load,
    syncViewer,
    toggleFollow,
    setDisabled,
  };
}

export type ProfileSession = ReturnType<typeof createProfileSession>;
