/**
 * AuthActionQueue.svelte.ts
 *
 * Pending-action queue with URL param handoff for gated actions.
 * Handles Google One Tap or popup sign-in routing and deferred
 * action replay after auth completes.
 *
 * Extracted from SequenceViewerOrchestrator to isolate auth concerns.
 */

import { browser } from "$app/env";
import { requiresFullAccount } from "#lib/shared/auth/domain/gated-action-policy.js";
import type { AuthNudgeTrigger } from "#lib/shared/auth/domain/auth-nudge-trigger.js";
import { ensureGuestIdentity } from "#lib/shared/auth/services/guest-identity.js";
import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
import { getPendingActionQueue } from "../get-pending-action-queue";
import type { PendingActionType } from "#lib/shared/sequence-viewer/services/pending-action-queue.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  mutateCurrentUrl,
  removeCurrentUrlParams,
} from "#lib/shared/navigation/services/url-state.js";

/**
 * Everything the sign-in sheet can be opened FOR. Pending actions replay after
 * auth; "account" is the /q header chip's plain sign-in (no queued action).
 */
export type SignInReason = PendingActionType | "account";

/**
 * Reason → the shared AuthModal's contextual trigger.
 *
 * `gated-action-policy`'s FULL_ACCOUNT_ACTIONS is the gate: only download,
 * publish, and account ever open the sheet. Everything else provisions a guest
 * silently and never prompts, so those three are the only mappings that can be
 * reached — and `auth-nudge-trigger` already registers exactly those three
 * `viewer-signin-*` keys with the copy this funnel needs. Anything unmapped
 * falls back to `null`, which renders AuthModal's default ask rather than
 * throwing; if a future caller gates one of the guest-provisioned actions, add
 * its trigger key there rather than reintroducing local copy here.
 */
const SIGN_IN_TRIGGERS: Partial<Record<SignInReason, AuthNudgeTrigger>> = {
  download: "viewer-signin-download",
  publish: "viewer-signin-publish",
  account: "viewer-signin-account",
};

export function signInTriggerFor(
  reason: SignInReason | null
): AuthNudgeTrigger | null {
  return reason ? (SIGN_IN_TRIGGERS[reason] ?? null) : null;
}

export interface AuthActionQueueCallbacks {
  handleSave: () => void;
  handleFavoriteToggle: () => void;
  handlePublishAction: () => Promise<void>;
  handleEdit: () => void;
  handleShare: () => void;
  handleDownload: () => void;
  handleOpenInBrowser: (pendingType?: PendingActionType | null) => void;
}

export function createAuthActionQueue() {
  const pendingActionQueue = getPendingActionQueue();

  let signInSheetOpen = $state(false);
  let signInSheetReason = $state<SignInReason | null>(null);

  function openSignInSheet(reason: SignInReason) {
    signInSheetReason = reason;
    signInSheetOpen = true;
  }

  function closeSignInSheet() {
    signInSheetOpen = false;
    signInSheetReason = null;
    pendingActionQueue.clear();
    if (browser) {
      removeCurrentUrlParams(["pending"]);
    }
  }

  /**
   * Called by footer action buttons. If signed in, runs the real handler.
   * If not, captures the intent, writes `?pending=` to the URL so a reload or
   * cross-browser handoff preserves it, and opens the sign-in sheet.
   */
  function invokeGatedAction(
    type: PendingActionType,
    realHandler: (() => void) | (() => Promise<void>) | undefined,
    sequence: SequenceData | null
  ) {
    const isFullUser = authState.isAuthenticated && !authState.isAnonymous;

    if (requiresFullAccount(type)) {
      // publish: must be a permanent account.
      if (isFullUser) {
        void realHandler?.();
        return;
      }
      // fall through to the sign-in sheet below
    } else {
      // save / favorite / remix / sendTo: provision a guest identity if
      // needed, then run. Never prompts.
      void ensureGuestIdentity().then(() => realHandler?.());
      return;
    }

    const sequenceId = sequence?.id ?? sequence?.word ?? "";
    if (!sequenceId) return;

    pendingActionQueue.enqueue({ type, sequenceId });
    if (browser) {
      mutateCurrentUrl((url) => {
        url.searchParams.set("pending", type);
      });
    }
    openSignInSheet(type);
  }

  // NOTE: this queue no longer runs any provider flow of its own.
  //
  // It used to own an `onSignInSheetPrimary` that called Google One Tap's
  // `prompt()` fire-and-forget, closed the sheet, and returned as if it had
  // succeeded. When One Tap is suppressed — incognito, blocked third-party
  // cookies, FedCM cooldown, or a user who dismissed it a couple of times —
  // nothing rendered and the user was left with no way to sign in and no
  // error. That failure cannot be detected either: Google's FedCM migration
  // removes `isNotDisplayed()`/`getSkippedReason()`, and moment notifications
  // can lag by up to a minute, so "try One Tap, detect failure, fall back" is
  // not implementable.
  //
  // Provider flows now belong entirely to the shared AuthModal, whose
  // SocialAuthCompact cancels any pending One Tap, resolves the Auth instance
  // lazily (HMR-safe), configures persistence, routes per platform, and offers
  // Magic Link — which also works inside in-app browsers, where the old
  // Google-only sheet could only punt to an external browser.

  /** Bootstrap from URL on mount. Returns the pending action type if present. */
  function bootstrapFromUrl(): PendingActionType | null {
    if (!browser) return null;
    pendingActionQueue.bootstrapFromUrl(new URL(window.location.href));
    const pending = pendingActionQueue.peek();
    if (pending && !authState.isFullAccount) {
      if (requiresFullAccount(pending.type)) {
        openSignInSheet(pending.type);
      } else if (!authState.isAuthenticated) {
        // A guest-capable action should resume without an account gate, just
        // as it does when invoked from a button rather than a handoff URL.
        void ensureGuestIdentity();
      }
      return pending.type;
    }
    return null;
  }

  /**
   * Replay the pending action once the user finishes signing in. Call this
   * from an $effect that watches authState.isAuthenticated.
   */
  function replayPendingAction(callbacks: AuthActionQueueCallbacks): boolean {
    if (!authState.isAuthenticated) return false;
    const queued = pendingActionQueue.peek();
    if (
      queued &&
      requiresFullAccount(queued.type) &&
      !authState.isFullAccount
    ) {
      return false;
    }
    const pending = pendingActionQueue.drain();
    if (!pending) return false;

    if (browser) {
      removeCurrentUrlParams(["pending"]);
    }

    try {
      switch (pending.type) {
        case "save":
          void callbacks.handleSave();
          break;
        case "favorite":
          callbacks.handleFavoriteToggle();
          break;
        case "publish":
          void callbacks.handlePublishAction();
          break;
        case "remix":
          callbacks.handleEdit();
          break;
        case "sendTo":
          callbacks.handleShare();
          break;
        case "download":
          callbacks.handleDownload();
          break;
      }
      signInSheetOpen = false;
      return true;
    } catch (err) {
      console.error("[Viewer] pending-action replay failed:", err);
      return false;
    }
  }

  return {
    get signInSheetOpen() {
      return signInSheetOpen;
    },
    set signInSheetOpen(v: boolean) {
      signInSheetOpen = v;
    },
    get signInSheetReason() {
      return signInSheetReason;
    },
    /** The shared AuthModal's contextual trigger for the current reason. */
    get signInTrigger() {
      return signInTriggerFor(signInSheetReason);
    },
    openSignInSheet,
    closeSignInSheet,
    invokeGatedAction,
    bootstrapFromUrl,
    replayPendingAction,
  };
}

export type AuthActionQueueState = ReturnType<typeof createAuthActionQueue>;
