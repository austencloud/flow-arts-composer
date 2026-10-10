/**
 * AuthState - Core authentication state management using Svelte 5 runes
 *
 * This module manages the global authentication state and orchestrates auth operations
 * using injected services from the DI container. It does NOT use Svelte 4 stores (writables).
 *
 * Responsibilities:
 * - Reactive auth state ($state rune)
 * - Firebase onAuthStateChanged listener
 * - Role & permission resolution
 * - Sign out orchestration
 * - Email/display name updates
 *
 * Extracted responsibilities (now services):
 * - Profile picture management → ProfilePictureManager
 * - User document CRUD → UserDocumentManager
 *
 * Preview mode integration:
 * - getEffectiveUserId/Role/Admin check userPreviewState for admin preview mode
 */

import { getUserDocumentManager } from "#lib/shared/auth/get-user-document-manager.js";
import {
  updateFacebookProfilePictureIfNeeded,
  updateGoogleProfilePictureIfNeeded,
} from "#lib/shared/auth/services/profile-picture-manager.js";
import { consumePendingLinkForUser } from "#lib/shared/auth/services/pending-credential-link.js";
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { getPresenceTracker } from "../../presence/get-presence-tracker";

import { auth } from "../firebase";
import { userPreviewState } from "../../debug/state/user-preview-state.svelte";
import { registerLoadedAuthState } from "./loaded-auth-state.svelte";

import { featureFlagService } from "../services/post-hog-feature-flag-service.svelte";
import type { UserRole } from "../domain/models/user-role";
import { isFullAccountUser } from "../domain/access-tier";
import { resetUser, captureWhenReady } from "../../analytics/services/posthog";
import { getScanSourceCode } from "../../analytics/scan-attribution";

import { linkDeviceToUser } from "#lib/shared/auth/services/device-id-service.js";
import { getFCMTokenManager } from "#lib/shared/push/get-fcm-token-manager.js";

import {
  changeEmail as doChangeEmail,
  updateDisplayName as doUpdateDisplayName,
  updateUsername as doUpdateUsername,
  updateInstagramUsername as doUpdateInstagramUsername,
  updatePronouns as doUpdatePronouns,
} from "../services/profile-field-updater";
import { initializeChildServices } from "../services/auth-boot-orchestrator";
import { clearBootSnapshot } from "#lib/shared/application/services/boot-snapshot.js";
import { isPermissionDeniedError } from "#lib/shared/auth/utils/is-permission-denied-error.js";
import { identifyFirebaseUserToPostHog } from "#lib/shared/auth/services/posthog-user-identity.js";
import { getAuthSubmissionContext } from "#lib/shared/auth/services/auth-analytics-bridge.js";

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  isAdmin: boolean;
  role: UserRole;
}

/**
 * Result shape returned by the profile-field-updater operations
 * (changeEmail, updateDisplayName, updateUsername, etc.)
 */
type ProfileFieldUpdateResult = { success: true; message: string };

// Without this, every HMR update resets auth state to uninitialized, which
// triggers the full auth → Firestore → settings → theme cascade.
const hmrAuthData = import.meta.hot?.data as
  | {
      authState?: AuthState;
      cleanupAuthListener?: (() => void) | null;
      cleanupSubscriptionListener?: (() => void) | null;
      childServicesInitialized?: boolean;
      hasIdentifiedToPostHog?: boolean;
    }
  | undefined;

// Reactive state using Svelte 5 $state rune
let _state = $state<AuthState>(
  hmrAuthData?.authState ?? {
    user: null,
    loading: true,
    initialized: false,
    isAdmin: false,
    role: "user",
  }
);

// Auth listener cleanup - preserve across HMR so we don't lose the active listener
let cleanupAuthListener: (() => void) | null =
  hmrAuthData?.cleanupAuthListener ?? null;
let cleanupSubscriptionListener: (() => void) | null =
  hmrAuthData?.cleanupSubscriptionListener ?? null;

// Track whether child services (settings, arrows, onboarding, etc.) have been initialized.
// On HMR, the auth listener fires again because the Firebase app instance rotates, but
// the child services don't need to re-initialize - they're already listening/loaded.
// Without this guard, every file save in dev triggers ~12 Firestore reads.
let childServicesInitialized = hmrAuthData?.childServicesInitialized ?? false;

// Whether this browser has ever identified a real user to PostHog. The
// onAuthStateChanged 'else' branch below reads "user logged out" but its actual
// condition is "no user" — it cannot tell "never signed in" from "just signed
// out", so it fires for every anonymous visitor on every single page load. It
// used to call resetUser() there, which mints a fresh distinct_id AND a fresh
// session_id. A real card scan on 2026-07-20 came back as two PostHog users
// with an identical $device_id and two $last_posthog_reset timestamps 11s
// apart: one human, one scan, two identities, two session recordings. Gate the
// reset on a genuine signed-in → signed-out TRANSITION, which is what this
// flag makes observable. Preserved across HMR (below) so dev reloads, which
// re-fire the listener, don't reintroduce the same churn locally.
let hasIdentifiedToPostHog = hmrAuthData?.hasIdentifiedToPostHog ?? false;

// Shared in-flight init promise — declared before the HMR re-wire block below,
// which calls initializeAuthListener() during module evaluation.
let authInitPromise: Promise<void> | null = null;

// Resolvers parked until auth restoration settles. `awaitAuthSettled()` is the
// one sanctioned readiness boundary for "don't read private data yet" — do not
// add another 50ms poll loop (three legacy ones exist; they are the anti-pattern).
let authSettledResolvers: Array<() => void> = [];

function resolveAuthSettled(): void {
  const resolvers = authSettledResolvers;
  authSettledResolvers = [];
  for (const resolve of resolvers) resolve();
}

/**
 * Resolves once auth restoration has settled (authState.initialized === true) —
 * signed-in, guest, or confirmed signed-out. Resolves immediately if already
 * settled. Never rejects.
 */
export function awaitAuthSettled(): Promise<void> {
  if (_state.initialized) return Promise.resolve();
  return new Promise((resolve) => {
    authSettledResolvers.push(resolve);
  });
}

if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.authState = { ..._state };
    data.cleanupAuthListener = cleanupAuthListener;
    data.cleanupSubscriptionListener = cleanupSubscriptionListener;
    data.childServicesInitialized = childServicesInitialized;
    data.hasIdentifiedToPostHog = hasIdentifiedToPostHog;
  });
}

// HMR re-eval re-wire. The preserved auth listener is a closure over the
// PREVIOUS module instance's `_state` — components that re-evaluated alongside
// this module read THIS instance's `_state`, which that old listener never
// touches. Left alone, the tab splits into two auth realities: sign-ins land
// on the dead instance while the UI freezes on the restored snapshot (a
// signed-out nudge no popup can dismiss; "User not authenticated" from
// services bound to the new instance). Tear the preserved listeners down and
// re-attach against this instance. The Firebase auth object itself is stable
// across HMR (firebase.ts no longer rotates the app), so re-attaching is
// cheap and the fresh listener fires immediately with the real user.
if (hmrAuthData?.cleanupAuthListener) {
  cleanupAuthListener?.();
  cleanupAuthListener = null;
  cleanupSubscriptionListener?.();
  cleanupSubscriptionListener = null;
  void initializeAuthListener().then(() => {
    // The role/subscription listener is normally created only inside the
    // one-time child-services init; re-create it here for the signed-in case.
    if (_state.user) void initializeSubscriptionListener(_state.user);
  });
}

/**
 * Get the effective user ID (previewed user or actual)
 */
export function getEffectiveUserId(): string | null {
  if (userPreviewState.isActive && userPreviewState.data.profile) {
    return userPreviewState.data.profile.uid;
  }
  return _state.user?.uid ?? null;
}

/**
 * Get the effective user role (previewed user or actual)
 */
export function getEffectiveRole(): UserRole {
  if (userPreviewState.isActive && userPreviewState.data.profile?.role) {
    return userPreviewState.data.profile.role as UserRole;
  }
  return _state.role;
}

/**
 * Check if the effective user is an admin
 */
export function isEffectiveAdmin(): boolean {
  if (userPreviewState.isActive && userPreviewState.data.profile) {
    return userPreviewState.data.profile.role === "admin";
  }
  return _state.isAdmin;
}

/**
 * Get the user state (non-reactive snapshot)
 */
export function getUserState(): Readonly<AuthState> {
  return { ..._state };
}

/**
 * Reactive getter for user
 */
export function getUser(): User | null {
  return _state.user;
}

/**
 * Reactive getter for loading state
 */
export function isLoading(): boolean {
  return _state.loading;
}

/**
 * Reactive getter for initialized state
 */
export function isInitialized(): boolean {
  return _state.initialized;
}

/**
 * Reactive getter for admin status (actual user, not impersonated)
 */
export function isAdmin(): boolean {
  return _state.isAdmin;
}

// Lets the premium prop check and the sequence thumbnails read these answers
// on public pages without importing this module, and Firebase with it.
registerLoadedAuthState({
  isAdmin,
  isAuthenticated: () => _state.user !== null,
  userId: () => _state.user?.uid ?? null,
});

/**
 * Reactive getter for role (actual user, not impersonated)
 */
export function getRole(): UserRole {
  return _state.role;
}

/**
 * Force a token refresh and adopt any role the server has since granted.
 *
 * The sign-in fast path reads the CACHED token (`getIdTokenResult(false)`), so
 * a claim written while the user was already signed in — a role grant — stays
 * invisible to them until Firebase refreshes on its own, up to an hour later.
 * That is what stranded thirteen testers on `user` after their tester claims
 * were set: the claim was correct on the server and stale in every browser.
 *
 * Returns true when the role changed, so callers can log or react.
 */
async function reconcileRoleFromServerClaims(user: User): Promise<boolean> {
  try {
    const idTokenResult = await user.getIdTokenResult(true);
    let newRole = (idTokenResult.claims.role as UserRole) || "user";
    const newIsAdmin = idTokenResult.claims.admin === true;
    if (newIsAdmin && newRole !== "admin") {
      newRole = "admin";
    }

    if (newRole === _state.role && newIsAdmin === _state.isAdmin) return false;

    _state = { ..._state, role: newRole, isAdmin: newIsAdmin };

    // Feature access is derived from the role, so the flag service has to be
    // rebuilt before any gated tab will appear.
    await featureFlagService.initialize(user.uid, newRole);
    return true;
  } catch (error) {
    console.error("❌ [authState] Failed to refresh token:", error);
    return false;
  }
}

/**
 * Initialize subscription status listener
 * Watches Firestore for subscription changes and syncs role to auth state
 */
async function initializeSubscriptionListener(
  user: User,
  permissionRetry = 0
): Promise<void> {
  // Clean up existing listener if any
  if (cleanupSubscriptionListener) {
    cleanupSubscriptionListener();
    cleanupSubscriptionListener = null;
  }

  try {
    const { getFirestoreInstance } =
      await import("#lib/shared/auth/firebase.js");
    const firestore = await getFirestoreInstance();
    const { collection, onSnapshot } = await import("firebase/firestore");

    const subscriptionsRef = collection(
      firestore,
      `customers/${user.uid}/subscriptions`
    );

    cleanupSubscriptionListener = onSnapshot(
      subscriptionsRef,
      async (snapshot) => {
        // Skip initial snapshot (only react to changes)
        if (snapshot.metadata.hasPendingWrites) return;

        // A subscription change can carry a role change (premium), so pick up
        // whatever the server now says.
        await reconcileRoleFromServerClaims(user);
      },
      (error) => {
        // A listener can report its final permission error after sign-out. Its
        // owner is already gone, so that is expected teardown rather than an
        // actionable exception.
        if (_state.user?.uid !== user.uid) return;

        if (permissionRetry === 0 && isPermissionDeniedError(error)) {
          void user
            .getIdToken(true)
            .then(async () => {
              if (_state.user?.uid === user.uid) {
                await initializeSubscriptionListener(user, 1);
              }
            })
            .catch((refreshError) => {
              console.error(
                "❌ [authState] Subscription retry failed:",
                refreshError
              );
            });
          return;
        }

        console.error("❌ [authState] Subscription listener error:", error);
      }
    );
  } catch (error) {
    console.error(
      "❌ [authState] Failed to initialize subscription listener:",
      error
    );
  }
}

/**
 * Initialize the auth state listener
 * Sets up Firebase onAuthStateChanged and orchestrates auth flows
 *
 * Memoized: callers race for this (the /admin route-guard load runs before the
 * root layout mounts, so it can't rely on +layout.svelte having called it).
 * Concurrent calls share one in-flight promise instead of wiring two listeners.
 */
export function initializeAuthListener(): Promise<void> {
  if (!authInitPromise) {
    authInitPromise = doInitializeAuthListener().catch((error) => {
      // Allow retry after a failed init instead of caching the rejection forever
      authInitPromise = null;
      throw error;
    });
  }
  return authInitPromise;
}

async function doInitializeAuthListener(): Promise<void> {
  if (cleanupAuthListener) {
    console.warn("⚠️ [authState] Auth listener already initialized");
    return;
  }

  // CRITICAL: Ensure auth persistence is configured BEFORE setting up listener
  // This prevents race conditions after cache clearing where onAuthStateChanged
  // might not fire properly if IndexedDB persistence is still being set up
  try {
    const { ensureAuthPersistence } = await import("../firebase");
    await ensureAuthPersistence();
  } catch (error) {
    console.warn("⚠️ [authState] Could not ensure auth persistence:", error);
    // Continue anyway - auth will work, just might have stale state issues
  }

  // Create a promise that resolves when auth state is first determined
  // CRITICAL: Add timeout to prevent infinite hang after cache clearing
  const AUTH_TIMEOUT_MS = 10000; // 10 seconds max wait

  const authReady = new Promise<User | null>((resolve) => {
    let resolved = false;

    // Timeout safety - if onAuthStateChanged never fires, resolve with null
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn(
          "⚠️ [authState] Auth state timed out after 10s - treating as signed out"
        );
        resolve(null);
      }
    }, AUTH_TIMEOUT_MS);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        unsubscribe(); // Only need the first callback
        resolve(user);
      }
    });
  });

  await authReady;

  // A pending magic-link sign-in is NOT auto-completed here anymore. Consuming
  // the single-use oobCode on page load let a corporate link-prescanner burn
  // it before the human ever clicked, silently breaking sign-in (2026-07-18
  // security audit). Completion now waits for explicit confirmation via
  // EmailLinkConfirmModal (mounted globally in AppShellLoader.svelte), which
  // calls completeEmailLinkSignIn() itself once the user clicks "Finish
  // signing in". That call flips Firebase's auth state, which this listener
  // (wired below) picks up like any other sign-in.

  const { isDesktop } = await import("#lib/shared/desktop/is-desktop.js");
  const isDesktopEnv = isDesktop();

  if (isDesktopEnv) {
    _state = {
      user: null,
      loading: false,
      initialized: true,
      isAdmin: true,
      role: "admin",
    };
    resolveAuthSettled();
  }

  cleanupAuthListener = onAuthStateChanged(
    auth,
    async (user) => {
      // Immediately reflect user in state so UI updates even if
      // downstream Firestore/network operations hang (common in Tauri desktop).
      // Deliberately NOT setting initialized here: consumers (e.g. the /admin
      // route guard) treat initialized as "role/claims are resolved", and the
      // claims aren't read until a few lines down — flipping it early made the
      // guard see isAdmin=false mid-window and bounce admins to the landing.
      // The claim read below is a local token-cache lookup (no network), so
      // initialized still flips within the same tick chain at the state
      // assignment that carries the resolved role.
      if (user !== _state.user) {
        _state = { ..._state, user };
      }

      // ── Fast path: cached claims → set state → unblock UI ──
      // getIdTokenResult(false) reads the local token cache — no network.
      // The subscription listener force-refreshes when claims change.
      let isAdmin = false;
      let role: UserRole = "user";

      if (user) {
        try {
          const idTokenResult = await user.getIdTokenResult(false);
          isAdmin = idTokenResult.claims.admin === true;
          role = (idTokenResult.claims.role as UserRole) || "user";
          if (isAdmin && role !== "admin") {
            role = "admin";
          }

          // Persist role for offline fallback — when the token expires and
          // can't refresh (no network), we restore the last verified role
          // so admin modules remain accessible at festivals etc.
          try {
            localStorage.setItem(
              "tka-offline-auth-cache",
              JSON.stringify({
                uid: user.uid,
                role,
                isAdmin,
                timestamp: Date.now(),
              })
            );
          } catch {
            /* quota exceeded or private browsing — non-critical */
          }
        } catch (_error) {
          console.warn("⚠️ [authState] Failed to read cached token:", _error);

          // Offline fallback: restore last-known role from localStorage.
          // The user identity is already verified by Firebase Auth persistence;
          // we're just carrying forward the role that was last confirmed from
          // a valid token. Scoped to the same UID to prevent cross-user leaks.
          try {
            const cached = localStorage.getItem("tka-offline-auth-cache");
            if (cached) {
              const parsed = JSON.parse(cached);
              if (parsed.uid === user.uid) {
                isAdmin = parsed.isAdmin === true;
                role = parsed.role || "user";
                if (isAdmin && role !== "admin") {
                  role = "admin";
                }
                console.info("📴 [authState] Using offline-cached role:", role);
              }
            }
          } catch {
            /* corrupted cache — proceed with default role */
          }
        }
      }

      const desktopAdminFallback = isDesktopEnv && !user;
      _state = {
        user,
        loading: false,
        initialized: true,
        isAdmin: desktopAdminFallback ? true : isAdmin,
        role: desktopAdminFallback ? "admin" : role,
      };
      resolveAuthSettled();

      // ── Background work: none of this blocks the UI ──
      if (user) {
        // The role above came from the cached token. Ask the server once, in
        // the background, so a role granted since this browser's last token
        // refresh lands on THIS page load rather than up to an hour later.
        // The UI is already unblocked, so the only visible effect is a gated
        // tab appearing a moment after sign-in instead of not at all.
        void reconcileRoleFromServerClaims(user);

        import("#lib/shared/auth/firebase.js")
          .then(({ getFirestoreInstance }) => getFirestoreInstance())
          .catch((error) => {
            console.error(
              "❌ [authState] Failed to initialize Firestore:",
              error
            );
          });

        const userDocumentService = getUserDocumentManager();
        if (userDocumentService) {
          userDocumentService
            .createOrUpdateUserDocument(user)
            .catch((error) => {
              console.error(
                "❌ [authState] Failed to update user document:",
                error
              );
              // A swallowed failure here is how two real 2026-08-05 signups
              // ended up with an Auth record and no public profile — invisible
              // to the admin panel and to the signup notification, for a week.
              // The server-side onAuthUserCreated trigger now backstops the
              // write; this reports the client-side loss so the backstop's
              // hit rate is observable instead of assumed.
              void import("#lib/shared/analytics/services/posthog.js").then(
                ({ captureException }) =>
                  captureException(error, {
                    context: "createOrUpdateUserDocument",
                    uid: user.uid,
                    isAnonymous: user.isAnonymous,
                  })
              );
            });
        }

        // If a Facebook sign-in collided with an existing account, the pending
        // Facebook credential was stashed. Now that the user signed in with their
        // existing method, link it on so Facebook works for them next time.
        consumePendingLinkForUser(user)
          .then((linkedProviderId) => {
            if (linkedProviderId === "facebook.com") {
              void import("#lib/shared/toast/state/toast-state.svelte.js").then(
                ({ toast }) =>
                  toast.success("Facebook connected to your account.")
              );
            }
          })
          .catch((error: unknown) => {
            console.warn(
              "⚠️ [authState] Pending credential link failed:",
              error
            );
          });

        updateFacebookProfilePictureIfNeeded(user).catch((error: unknown) => {
          console.warn(
            "⚠️ [authState] Facebook profile picture update failed:",
            error
          );
        });
        updateGoogleProfilePictureIfNeeded(user).catch((error: unknown) => {
          console.warn(
            "⚠️ [authState] Google profile picture update failed:",
            error
          );
        });

        featureFlagService.initialize(user.uid, role).catch((_error) => {
          console.warn(
            "⚠️ [authState] Failed to initialize feature flags:",
            _error
          );
        });

        linkDeviceToUser(user.uid).catch((err: unknown) => {
          console.warn("⚠️ [authState] Failed to link device to user", err);
        });
      } else {
        featureFlagService.initialize(null).catch((_error) => {
          console.warn(
            "⚠️ [authState] Failed to initialize feature flags:",
            _error
          );
        });
      }

      // If the user just became authenticated, clear any in-flight auth
      // drawer state. Otherwise a "Sign up" the user opened before signing
      // in a different way (popover, magic link, One Tap) stays flagged as
      // open - then re-appears as a ghost sheet the next time they sign out,
      // because MainApplication re-mounts AuthDrawer with `open={authDrawerState.open}`.
      if (user) {
        try {
          const { authDrawerState } =
            await import("../state/auth-drawer-state.svelte");
          authDrawerState.reset();
        } catch {
          // Drawer state may not be loaded in some code paths - safe to ignore.
        }
      }

      // 📊 PostHog user identification
      if (user) {
        identifyFirebaseUserToPostHog(user, role, isAdmin);
        hasIdentifiedToPostHog = true;

        const creationTime = user.metadata.creationTime
          ? new Date(user.metadata.creationTime).getTime()
          : 0;
        const isNewSignup = Date.now() - creationTime < 60_000;
        // Fires unconditionally for every new FULL-account signup so the team
        // can measure signups-per-day without scan attribution gating it.
        // Scan code is now an optional property, not a gate. Anonymous guests
        // are excluded here - a guest converting to a full account fires its
        // own guest_upgraded_to_account event (anonymous-upgrade.ts) instead,
        // so a fresh anon session isn't miscounted as a signup.
        if (isNewSignup && !user.isAnonymous) {
          captureWhenReady("user_signed_up", {
            scan_source_code: getScanSourceCode() ?? null,
            ...getAuthSubmissionContext(),
          });
        }
      } else if (hasIdentifiedToPostHog) {
        // Genuine signed-in → signed-out transition: drop the previous user's
        // identity so their events don't bleed into whoever uses this browser
        // next. A visitor who was never identified takes no branch at all —
        // resetting them would only fork the anonymous identity PostHog
        // already has (see the hasIdentifiedToPostHog note above).
        hasIdentifiedToPostHog = false;
        resetUser();
      }

      // Initialize child services (non-blocking). The childServicesInitialized guard
      // prevents re-running all Firestore reads on every Vite HMR reload.
      if (user && !childServicesInitialized) {
        childServicesInitialized = true;
        initializeChildServices(user, () => _state.user);

        // Initialize subscription listener for real-time role sync
        void initializeSubscriptionListener(user);
      }

      // Revalidate current module after auth state changes
      if (typeof window !== "undefined") {
        import("../../application/state/ui/module-state")
          .then(async (moduleState) => {
            await moduleState.revalidateCurrentModule();
          })
          .catch(() => {
            // Ignore - module state may not be available yet
          });
      }
    },
    (_error) => {
      console.error("❌ [authState] Auth state change error:", _error);
      _state = {
        user: null,
        loading: false,
        initialized: true,
        isAdmin: false,
        role: "user",
      };
      resolveAuthSettled();
    }
  );
}

/**
 * Sign out the current user
 * Clears all sensitive data from client-side storage
 */
export async function signOut(): Promise<void> {
  try {
    // Close any open auth drawer synchronously. This prevents the "sign up"
    // sheet from flashing back into view the moment Firebase's auth state
    // flips to signed-out and MainApplication re-mounts <AuthDrawer>.
    try {
      const { authDrawerState } =
        await import("../state/auth-drawer-state.svelte");
      authDrawerState.reset();
    } catch {
      // Non-critical; UI will still end up in the right place.
    }

    // Tell Google Identity Services not to auto-select this account on the
    // next One Tap prompt. Without this, if the One Tap library is already
    // loaded, it will eagerly re-prompt the user the instant any surface
    // that mounts <GoogleOneTap autoPrompt /> reappears.
    try {
      (
        window as {
          google?: { accounts?: { id?: { disableAutoSelect?: () => void } } };
        }
      ).google?.accounts?.id?.disableAutoSelect?.();
    } catch {
      // GSI may not be loaded yet; nothing to do.
    }

    // Clear any auth-related localStorage items
    const keysToRemove = Object.keys(localStorage).filter(
      (key) =>
        key.startsWith("tka_") ||
        key.includes("auth") ||
        key.includes("session")
    );
    keysToRemove.forEach((key) => localStorage.removeItem(key));

    // The boot snapshot key ("tka-boot-snapshot") is hyphenated, so the tka_/
    // auth/session filter above never matched it — a signed-out premium user's
    // stale tier would survive and flash premium-gated content on the next
    // reload during the auth-loading window. Clear it explicitly.
    clearBootSnapshot();

    // Clear sessionStorage entirely
    sessionStorage.clear();

    // Note: Profile settings state is now context-based (profile-settings-context.svelte.ts)
    // State is automatically cleaned up when the component unmounts, no manual reset needed

    // Reset child services flag so next sign-in triggers the full init cascade
    childServicesInitialized = false;

    // Reset first-run cloud sync so next signin will sync fresh
    try {
      const { firstRunState } =
        await import("../../onboarding/state/first-run-state.svelte");
      firstRunState.resetCloudSync();
    } catch {
      // First-run state may not be loaded - that's ok
    }

    // Same for app-entry sync, so a different account signing in on this same
    // session (no full reload) re-reads cloud state fresh instead of reusing
    // the previous account's already-resolved cloudSynced gate.
    try {
      const { appEntryState } =
        await import("../../onboarding/state/app-entry-state.svelte");
      appEntryState.resetCloudSync();
    } catch {
      // Not loaded - that's ok
    }

    // Reset the post-save activation prompt (SP3) so a queued/visible prompt
    // from the outgoing session doesn't bleed into whoever signs in next.
    try {
      const { postSaveActivation } =
        await import("../../onboarding/state/post-save-activation-state.svelte");
      postSaveActivation.reset();
    } catch {
      // Not loaded - that's ok
    }

    // Mark user as offline in presence system before signing out
    try {
      const presenceService = getPresenceTracker();
      if (presenceService) {
        await presenceService.goOffline();
      }
    } catch {
      // Silently fail - presence is non-critical
    }

    // Clean up subscription listener
    if (cleanupSubscriptionListener) {
      cleanupSubscriptionListener();
      cleanupSubscriptionListener = null;
    }

    // Unregister FCM push token before signing out
    try {
      const userId = _state.user?.uid;
      const fcmTokenManager = getFCMTokenManager();
      if (userId && fcmTokenManager) {
        await fcmTokenManager.unregisterToken(userId);
      }
    } catch {
      // Push token cleanup is non-critical
    }

    // Clean up Firestore subscriptions BEFORE signing out
    // This prevents permission errors when Firebase auth is invalidated
    try {
      const { settingsService } =
        await import("../../settings/state/settings-state.svelte");
      settingsService.cleanup();
    } catch {
      // Settings service may not be loaded - that's ok
    }

    try {
      const { mandalaCollectionState } =
        await import("#lib/features/mandala/tabs/collection/state/mandala-collection-state.svelte.js");
      mandalaCollectionState.teardown();
    } catch {
      // Mandala collection may not be loaded - that's ok
    }

    try {
      const { tunnelCollectionState } =
        await import("#lib/features/tunnel-collection/state/tunnel-collection-state.svelte.js");
      tunnelCollectionState.teardown();
    } catch {
      // Tunnel collection may not be loaded - that's ok
    }

    try {
      const [{ scene3dCollectionState }, { filmCollectionState }] =
        await Promise.all([
          import("#lib/features/scene-3d-collection/state/scene-3d-collection-state.svelte.js"),
          import("#lib/features/film-collection/state/film-collection-state.svelte.js"),
        ]);
      scene3dCollectionState.teardown();
      filmCollectionState.teardown();
    } catch {
      // Scene/film collections may not be loaded - that's ok
    }

    try {
      const [{ collectionsState }, { followedCollectionsState }] =
        await Promise.all([
          import("#lib/features/library/state/collections-state.svelte.js"),
          import("#lib/features/library/state/followed-collections-state.svelte.js"),
        ]);
      // Otherwise the previous user's Firestore listeners stay live after
      // logout and throw permission errors once the auth token is revoked.
      collectionsState.teardown();
      followedCollectionsState.teardown();
      // Drop the local text mirror so this user's list never seeds the next
      // signed-in account on the same device.
      const outgoingUid = _state.user?.uid;
      if (outgoingUid) {
        const { clearMirror } =
          await import("#lib/features/library/services/collection-cache-mirror.js");
        clearMirror(outgoingUid);
      }
    } catch {
      // Collection states may not be loaded - that's ok
    }

    // Drafts and unsent attachment bytes are deliberately device-local. A
    // different person signing into this browser must never inherit them.
    try {
      const outgoingUid = _state.user?.uid;
      if (outgoingUid) {
        const { getMessageDeliveryRepository } =
          await import("#lib/shared/inbox/get-message-delivery-repository.js");
        await getMessageDeliveryRepository().purgeUser(outgoingUid);
      }
    } catch (error) {
      console.warn("⚠️ [authState] Failed to clear message drafts:", error);
    }

    // Sign out from Firebase
    await firebaseSignOut(auth);
    // State will be updated automatically by onAuthStateChanged
  } catch (_error) {
    console.error("❌ [authState] Sign out error:", _error);
    throw _error;
  }
}

export async function changeEmail(
  newEmail: string,
  currentPassword: string
): Promise<ProfileFieldUpdateResult> {
  const user = _state.user;
  if (!user) throw new Error("No authenticated user");
  return doChangeEmail(user, newEmail, currentPassword);
}

/**
 * Refresh the current user's data from Firebase
 * Used after operations that modify user data (like linking providers)
 * to ensure the local state reflects the latest server state.
 */
export async function refreshUser(): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    console.warn("⚠️ [authState] Cannot refresh - no user signed in");
    return;
  }

  try {
    // Reload user from Firebase to get fresh providerData
    await user.reload();

    // Get the refreshed user (reload mutates the object but we need to trigger reactivity)
    const refreshedUser = auth.currentUser;

    if (refreshedUser) {
      // Update state with refreshed user to trigger Svelte reactivity
      _state = {
        ..._state,
        user: refreshedUser,
      };

      // Linking a credential onto an anonymous Firebase user keeps the same
      // uid, so onAuthStateChanged does not run again. Re-identify here before
      // notifyUpgradeSignup emits its conversion event; the normal listener
      // and this convergence path deliberately share the exact mapping above.
      identifyFirebaseUserToPostHog(refreshedUser, _state.role, _state.isAdmin);
      hasIdentifiedToPostHog = true;
    }
  } catch (error) {
    console.error("❌ [authState] Failed to refresh user:", error);
    throw error;
  }
}

export async function updateDisplayName(
  displayName: string
): Promise<ProfileFieldUpdateResult> {
  const user = _state.user;
  if (!user) throw new Error("No authenticated user");
  const result = await doUpdateDisplayName(user, displayName);
  _state = { ..._state, user: auth.currentUser };
  return result;
}

export async function updateUsername(
  newUsername: string
): Promise<ProfileFieldUpdateResult> {
  const user = _state.user;
  if (!user) throw new Error("No authenticated user");
  return doUpdateUsername(user, newUsername);
}

export async function updateInstagramUsername(
  username: string
): Promise<ProfileFieldUpdateResult> {
  const user = _state.user;
  if (!user) throw new Error("No authenticated user");
  return doUpdateInstagramUsername(user, username);
}

export async function updatePronouns(
  pronouns: string
): Promise<ProfileFieldUpdateResult> {
  const user = _state.user;
  if (!user) throw new Error("No authenticated user");
  return doUpdatePronouns(user, pronouns);
}

/**
 * Clean up the auth listener
 * Call this when your app unmounts (if ever)
 */
export function cleanup(): void {
  if (cleanupAuthListener) {
    cleanupAuthListener();
    cleanupAuthListener = null;
  }
  if (cleanupSubscriptionListener) {
    cleanupSubscriptionListener();
    cleanupSubscriptionListener = null;
  }
}

/**
 * Reactive handle for the auth state: reactive getters backed by the
 * module-level $state rune, plus the auth operations.
 */
export interface AuthStateHandle {
  // Direct state access (for Svelte 5 reactivity)
  readonly user: User | null;
  readonly loading: boolean;
  readonly initialized: boolean;
  readonly isAdmin: boolean;
  readonly role: UserRole;
  readonly isAuthenticated: boolean;
  readonly isAnonymous: boolean;
  readonly isFullAccount: boolean;

  // Effective user helpers (as properties)
  readonly effectiveUserId: string | null;
  readonly effectiveRole: UserRole;
  readonly isEffectiveAdmin: boolean;

  // Function-style getters (for explicit calls)
  getUserState(): Readonly<AuthState>;
  getUser(): User | null;
  isLoading(): boolean;
  isInitialized(): boolean;
  getRole(): UserRole;
  getEffectiveUserId(): string | null;
  getEffectiveRole(): UserRole;

  // Auth operations
  initialize(): Promise<void>;
  initializeAuthListener(): Promise<void>;
  signOut(): Promise<void>;
  changeEmail(
    newEmail: string,
    currentPassword: string
  ): Promise<ProfileFieldUpdateResult>;
  updateDisplayName(displayName: string): Promise<ProfileFieldUpdateResult>;
  updateUsername(newUsername: string): Promise<ProfileFieldUpdateResult>;
  updateInstagramUsername(username: string): Promise<ProfileFieldUpdateResult>;
  updatePronouns(pronouns: string): Promise<ProfileFieldUpdateResult>;
  refreshUser(): Promise<void>;
  cleanup(): void;
}

/**
 * Default export with all methods (for backward compatibility during migration)
 */
export const authState: AuthStateHandle = {
  // Direct state access (for Svelte 5 reactivity)
  get user() {
    return _state.user;
  },
  get loading() {
    return _state.loading;
  },
  get initialized() {
    return _state.initialized;
  },
  get isAdmin() {
    return _state.isAdmin;
  },
  get role() {
    return _state.role;
  },
  get isAuthenticated() {
    return _state.user !== null;
  },
  get isAnonymous() {
    return _state.user?.isAnonymous ?? false;
  },
  get isFullAccount() {
    // Read _state directly (like every sibling getter) so the result is correct
    // even if this getter is ever invoked with a different receiver.
    const isAuthenticated = _state.user !== null;
    const isAnonymous = _state.user?.isAnonymous ?? false;
    return isFullAccountUser(isAuthenticated, isAnonymous);
  },

  // Effective user helpers (as properties)
  get effectiveUserId() {
    return getEffectiveUserId();
  },
  get effectiveRole() {
    return getEffectiveRole();
  },
  get isEffectiveAdmin() {
    return isEffectiveAdmin();
  },

  // Function-style getters (for explicit calls)
  getUserState,
  getUser,
  isLoading,
  isInitialized,
  getRole,
  getEffectiveUserId,
  getEffectiveRole,

  // Auth operations
  initialize: initializeAuthListener, // Alias for backward compatibility
  initializeAuthListener,
  signOut,
  changeEmail,
  updateDisplayName,
  updateUsername,
  updateInstagramUsername,
  updatePronouns,
  refreshUser,
  cleanup,
};
