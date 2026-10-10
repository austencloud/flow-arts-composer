/**
 * PostHog Feature Flag Service
 *
 * PostHog-backed feature flag service that replaces the Firebase-based implementation.
 * Maintains the same interface for compatibility with existing consumers.
 *
 * Migration notes:
 * - User roles are sent as PostHog person properties via identifyUser()
 * - Module flags use naming convention: `module-{moduleId}` (e.g., `module-create`)
 * - Tab flags use naming convention: `tab-{moduleId}-{tabId}` (e.g., `tab-create-assemble`)
 * - Falls back to role-based defaults when PostHog flag doesn't exist
 *
 * PostHog flag structure:
 * - Boolean flags: true = enabled, false = disabled
 * - Multivariate flags: check specific variants if needed
 *
 * Role hierarchy (highest to lowest): admin > tester > premium > user
 */

import { browser } from "$app/env";
import { type UserRole, hasRolePrivilege } from "../domain/models/user-role";
import {
  type FeatureId,
  type FeatureFlagConfig,
  type UserFeatureOverrides,
  moduleIdToFeatureId,
  tabIdToFeatureId,
  isValidFeatureId,
  isValidUserRole,
} from "../domain/models/feature-flag";
import type { ModuleId } from "../../navigation/domain/types";
import { isModuleEnabledInEnvironment } from "../../environment/environment-features";
import {
  getFeatureFlag,
  reloadFeatureFlags,
  getAllFeatureFlags,
  setUserProperties,
} from "../../analytics/services/posthog";
import { GlobalFeatureFlagPersister } from "./global-feature-flag-persister";
import { UserFeatureFlagPersister } from "./user-feature-flag-persister";
import type { GlobalFlagOverrides } from "./types";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
import { DEFAULT_FEATURE_FLAGS, getDefaultFeatureConfig } from "../domain/default-feature-flags";
import { createPostHogFlagAdminService } from "./posthog-flag-admin-service";


/**
 * Convert FeatureId to PostHog flag key
 * - module:create -> module-create
 * - tab:create:assemble -> tab-create-assemble
 * - capability:export:video -> capability-export-video
 */
function featureIdToPostHogKey(featureId: FeatureId): string {
  return featureId.replace(/:/g, "-");
}

/**
 * Convert PostHog flag key back to FeatureId
 * Returns undefined if the key doesn't match a valid FeatureId pattern
 * - module-create -> module:create
 * - tab-create-assemble -> tab:create:assemble
 * - capability-export-video -> capability:export:video
 */
function _postHogKeyToFeatureId(key: string): FeatureId | undefined {
  let candidate: string | undefined;

  // Handle module flags
  if (key.startsWith("module-")) {
    const moduleId = key.slice(7);
    if (moduleId) {
      candidate = `module:${moduleId}`;
    }
  }
  // Handle tab flags (tab-{module}-{tab})
  else if (key.startsWith("tab-")) {
    const parts = key.slice(4).split("-");
    if (parts.length >= 2 && parts[0] && parts[1]) {
      const moduleId = parts[0];
      const tabId = parts.slice(1).join("-");
      candidate = `tab:${moduleId}:${tabId}`;
    }
  }
  // Handle capability flags
  else if (key.startsWith("capability-")) {
    const parts = key.slice(11).split("-");
    if (parts.length >= 2 && parts[0] && parts[1]) {
      candidate = `capability:${parts[0]}:${parts.slice(1).join("-")}`;
    }
  }

  // Validate using the runtime validation helper
  if (candidate && isValidFeatureId(candidate)) {
    return candidate;
  }

  // Invalid key - return undefined instead of casting blindly
  return undefined;
}

// ============================================================================
// GLOBAL OVERRIDE PERSISTENCE (Firestore-backed with localStorage cache)
// ============================================================================

const _globalFlagPersister = new GlobalFeatureFlagPersister();
const _userFlagPersister = new UserFeatureFlagPersister();

/**
 * Tracks whether this client initiated the most recent global override save.
 * Used to suppress "updated by another admin" toast for our own writes.
 */
let _selfInitiatedSaveTimestamp = 0;

/**
 * Load global flag overrides from localStorage as a synchronous initial value.
 * Firestore data is loaded asynchronously during initialize() and will
 * overwrite these values once available.
 */
function loadLocalFlagOverrides(): Record<string, boolean> {
  if (!browser) return {};
  try {
    const stored = localStorage.getItem("tka-global-flag-overrides");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed === "object" && parsed !== null) {
        const validated: Record<string, boolean> = {};
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof key === "string" && typeof value === "boolean") {
            validated[key] = value;
          }
        }
        return validated;
      }
    }
  } catch { /* ignore */ }
  return {};
}

function loadLocalRoleOverrides(): Record<string, UserRole> {
  if (!browser) return {};
  try {
    const stored = localStorage.getItem("tka-global-role-overrides");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed === "object" && parsed !== null) {
        const validated: Record<string, UserRole> = {};
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof key === "string" && isValidUserRole(value)) {
            validated[key] = value as UserRole;
          }
        }
        return validated;
      }
    }
  } catch { /* ignore */ }
  return {};
}

// ============================================================================
// REACTIVE STATE (Svelte 5 Runes)
// ============================================================================

interface FeatureFlagState {
  /** Current user's ID */
  userId: string | null;
  /** Current user's role */
  userRole: UserRole;
  /** Debug role override (for admin testing different permission levels) */
  debugRoleOverride: UserRole | null;
  /** User-specific feature overrides (loaded from PostHog person properties or local storage) */
  userOverrides: UserFeatureOverrides;
  /** Whether the service has been initialized */
  initialized: boolean;
  /** Whether currently loading */
  loading: boolean;
  /** Version counter to trigger reactive updates when flags change */
  flagsVersion: number;
  /** Local cache of global flag enabled states updated via admin UI */
  globalFlagOverrides: Record<string, boolean>;
  /** Local cache of global flag minimumRole overrides updated via admin UI */
  globalRoleOverrides: Record<string, UserRole>;
}

const _state = $state<FeatureFlagState>({
  userId: null,
  userRole: "user",
  debugRoleOverride: null,
  userOverrides: {
    enabledFeatures: [],
    disabledFeatures: [],
    moduleOrder: undefined,
  },
  initialized: false,
  loading: false,
  flagsVersion: 0,
  // Initialize from localStorage cache synchronously; Firestore loads in initialize()
  globalFlagOverrides: browser ? loadLocalFlagOverrides() : {},
  globalRoleOverrides: browser ? loadLocalRoleOverrides() : {},
});


// ============================================================================
// ADMIN SERVICE (delegated CRUD)
// ============================================================================

const _adminService = createPostHogFlagAdminService(
  () => ({
    userId: _state.userId,
    userRole: _state.userRole,
    globalFlagOverrides: _state.globalFlagOverrides,
    globalRoleOverrides: _state.globalRoleOverrides,
    flagsVersion: _state.flagsVersion,
    userOverrides: _state.userOverrides,
  }),
  (patch) => {
    if (patch.userId !== undefined) _state.userId = patch.userId;
    if (patch.userRole !== undefined) _state.userRole = patch.userRole;
    if (patch.globalFlagOverrides !== undefined) _state.globalFlagOverrides = patch.globalFlagOverrides;
    if (patch.globalRoleOverrides !== undefined) _state.globalRoleOverrides = patch.globalRoleOverrides;
    if (patch.flagsVersion !== undefined) _state.flagsVersion = patch.flagsVersion;
    if (patch.userOverrides !== undefined) _state.userOverrides = patch.userOverrides;
  },
  _globalFlagPersister,
  _userFlagPersister,
  () => _selfInitiatedSaveTimestamp,
  (ts) => { _selfInitiatedSaveTimestamp = ts; }
);

// ============================================================================
// PRIVATE HELPERS
// ============================================================================


/**
 * Check if a feature is globally enabled (kill switch).
 * Returns true/false if there's a definitive answer, null if no opinion.
 * This answers "is the feature turned on?" NOT "can this user access it?"
 */
function isFeatureGloballyEnabled(featureId: FeatureId): boolean | null {
  if (!browser) return null;

  const postHogKey = featureIdToPostHogKey(featureId);

  // Priority 1: Check local admin overrides (set via admin UI)
  const localOverride = _state.globalFlagOverrides[postHogKey];
  if (typeof localOverride === "boolean") {
    return localOverride;
  }

  // Priority 2: Check PostHog remote flag value
  const flagValue = getFeatureFlag(postHogKey);

  // PostHog flag exists - use its value
  if (typeof flagValue === "boolean") {
    return flagValue;
  }

  // PostHog multivariate flag - treat any truthy string as enabled
  if (typeof flagValue === "string") {
    return flagValue !== "" && flagValue !== "false" && flagValue !== "control";
  }

  // Flag doesn't exist in PostHog - return null to signal fallback
  return null;
}

/**
 * Get the effective minimum role for a feature, checking overrides first.
 * Priority: admin UI role override > default config role > "admin" (secure default)
 */
function getEffectiveMinimumRole(featureId: FeatureId): UserRole {
  const postHogKey = featureIdToPostHogKey(featureId);

  // Priority 1: Admin-set role override (localStorage via admin UI)
  const roleOverride = _state.globalRoleOverrides[postHogKey];
  if (roleOverride) {
    return roleOverride;
  }

  // Priority 2: Default from config (derives from CORE_USER_MODULES / getDefaultFeatureRole)
  const config = getDefaultFeatureConfig(featureId);
  if (config) {
    return config.minimumRole;
  }

  // Secure by default
  return "admin";
}

/**
 * Get the effective role, with security validation of debugRoleOverride.
 * EVERY code path that uses debugRoleOverride MUST go through this function.
 * If a non-admin has a debugRoleOverride set (console tampering), it's cleared.
 */
function getValidatedEffectiveRole(): UserRole {
  if (_state.debugRoleOverride && _state.userRole !== "admin") {
    console.error("[SECURITY] Unauthorized debugRoleOverride detected on non-admin account - clearing");
    _state.debugRoleOverride = null;
  }
  return _state.debugRoleOverride ?? _state.userRole;
}

/**
 * Check if a feature is accessible based on role and overrides.
 *
 * Two independent questions must BOTH be true:
 * 1. Is this feature enabled? (kill switch / global toggle / per-user override)
 * 2. Does the user meet the role requirement?
 *
 * These are evaluated independently - enabledFeatures can bypass the enabled
 * check but NEVER bypasses the role check. A non-admin user with "module:lab"
 * in their enabledFeatures is still blocked by the role requirement.
 *
 * Enabled check priority:
 * 1. User disabledFeatures → feature is OFF
 * 2. Kill switch false → feature is OFF
 * 3. User enabledFeatures → feature is ON (bypasses global toggle, NOT role)
 * 4. Global/default config → feature is ON or OFF
 *
 * Role check always runs regardless of how the feature was enabled.
 */
function checkFeatureAccess(featureId: FeatureId): boolean {
  // 1. User explicitly disabled - always wins
  if (_state.userOverrides.disabledFeatures.includes(featureId)) {
    return false;
  }

  // 2. Check if feature is globally enabled (kill switch)
  const globalEnabled = isFeatureGloballyEnabled(featureId);
  if (globalEnabled === false) {
    return false; // Kill switch OFF - overrides even per-user enabledFeatures
  }

  // 3. Determine if feature is enabled (per-user override OR global/default config)
  const userExplicitlyEnabled =
    _state.userOverrides.enabledFeatures.includes(featureId);

  if (!userExplicitlyEnabled) {
    // No per-user override - check global/default config
    if (globalEnabled === null) {
      const config = getDefaultFeatureConfig(featureId);
      if (!config) {
        console.warn(
          `[PostHogFeatureFlagService] Unknown feature: ${featureId}`
        );
        return false;
      }
      if (!config.enabled) {
        return false;
      }
    }
  }

  // 4. Role check - ALWAYS runs, even for per-user enabled features
  const effectiveRole = getValidatedEffectiveRole();
  return hasRolePrivilege(effectiveRole, getEffectiveMinimumRole(featureId));
}

/**
 * Load user overrides from localStorage as a synchronous initial value.
 * Firestore data is loaded asynchronously during initialize() and will
 * overwrite these values once available.
 */
function loadLocalUserOverrides(userId: string): UserFeatureOverrides {
  if (!browser) {
    return { enabledFeatures: [], disabledFeatures: [], moduleOrder: undefined };
  }

  try {
    const stored = localStorage.getItem(`tka_feature_overrides_${userId}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        enabledFeatures: parsed.enabledFeatures || [],
        disabledFeatures: parsed.disabledFeatures || [],
        moduleOrder: parsed.moduleOrder || undefined,
      };
    }
  } catch {
    // Ignore parse errors
  }

  return { enabledFeatures: [], disabledFeatures: [], moduleOrder: undefined };
}

// ============================================================================
// PUBLIC API
// ============================================================================

export const postHogFeatureFlagService = {
  // ===== Getters =====

  /** Current user role */
  get userRole(): UserRole {
    return _state.userRole;
  },

  /** Current user ID */
  get userId(): string | null {
    return _state.userId;
  },

  /** Current user's feature overrides */
  get userOverrides(): UserFeatureOverrides {
    return _state.userOverrides;
  },

  /** Whether the service has been initialized */
  get isInitialized(): boolean {
    return _state.initialized;
  },

  /** Whether currently loading */
  get isLoading(): boolean {
    return _state.loading;
  },

  /** Version counter - increments when flags are updated via admin UI */
  get flagsVersion(): number {
    return _state.flagsVersion;
  },

  /** Get all feature configs (merged with PostHog state and local overrides) */
  get featureConfigs(): FeatureFlagConfig[] {
    // Reference flagsVersion to make this reactive when flags are updated
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    _state.flagsVersion;

    // Get current PostHog flags (user's local evaluation)
    const postHogFlags = getAllFeatureFlags();

    // Merge default configs with PostHog values and local admin overrides
    return DEFAULT_FEATURE_FLAGS.map((config) => {
      const postHogKey = featureIdToPostHogKey(config.id);
      const mergedConfig = { ...config };

      // Priority 1: Local admin enabled overrides (set via admin UI)
      const localEnabledOverride = _state.globalFlagOverrides[postHogKey];
      if (typeof localEnabledOverride === "boolean") {
        mergedConfig.enabled = localEnabledOverride;
      } else {
        // Priority 2: PostHog flag value (user's evaluation)
        const postHogValue = postHogFlags[postHogKey];
        if (typeof postHogValue === "boolean") {
          mergedConfig.enabled = postHogValue;
        } else if (typeof postHogValue === "string") {
          mergedConfig.enabled = postHogValue !== "" && postHogValue !== "false" && postHogValue !== "control";
        }
      }

      // Apply role overrides (local admin UI changes)
      const localRoleOverride = _state.globalRoleOverrides[postHogKey];
      if (localRoleOverride) {
        mergedConfig.minimumRole = localRoleOverride;
      }

      return mergedConfig;
    });
  },

  // ===== Core Access Checks =====

  /**
   * Check if a feature is accessible to the current user
   */
  canAccess(featureId: FeatureId): boolean {
    return checkFeatureAccess(featureId);
  },

  /**
   * Check if a module is accessible to the current user
   * Combines role-based access with environment-based visibility
   */
  canAccessModule(moduleId: ModuleId): boolean {
    // First check environment visibility (production vs dev)
    if (!isModuleEnabledInEnvironment(moduleId)) {
      return false;
    }

    // Then check role-based access
    const featureId = moduleIdToFeatureId(moduleId);
    return checkFeatureAccess(featureId);
  },

  /**
   * Check if a module WOULD be accessible based on role/environment alone,
   * ignoring user's disabled features. Used by ModuleQuickToggle to show
   * all modules a user COULD enable.
   */
  canAccessModuleIgnoringDisables(moduleId: ModuleId): boolean {
    // Check environment visibility
    if (!isModuleEnabledInEnvironment(moduleId)) {
      return false;
    }

    const featureId = moduleIdToFeatureId(moduleId);

    // Check if feature is globally enabled (kill switch)
    const globalEnabled = isFeatureGloballyEnabled(featureId);
    if (globalEnabled === false) {
      return false;
    }

    // If no global opinion, check default config
    if (globalEnabled === null) {
      const config = getDefaultFeatureConfig(featureId);
      if (!config?.enabled) {
        return false;
      }
    }

    // Role check - always runs when feature is enabled
    const effectiveRole = getValidatedEffectiveRole();
    return hasRolePrivilege(effectiveRole, getEffectiveMinimumRole(featureId));
  },

  /**
   * Check if a tab within a module is accessible to the current user
   * Falls back to module-level access if tab isn't explicitly defined
   */
  canAccessTab(moduleId: ModuleId, tabId: string): boolean {
    // First check if the module itself is accessible
    if (!this.canAccessModule(moduleId)) {
      return false;
    }

    const featureId = tabIdToFeatureId(moduleId, tabId);

    // Check if this specific tab has a feature flag definition
    const config = getDefaultFeatureConfig(featureId);
    if (!config) {
      // No explicit tab config - inherit from module access (which we already checked above)
      return true;
    }

    return checkFeatureAccess(featureId);
  },

  // ===== Role Checks =====

  /** Check if user is admin */
  get isAdmin(): boolean {
    return _state.userRole === "admin";
  },

  /** Check if user is at least tester level */
  get isTester(): boolean {
    return hasRolePrivilege(getValidatedEffectiveRole(), "tester");
  },

  /** Check if user is at least premium level */
  get isPremium(): boolean {
    return hasRolePrivilege(getValidatedEffectiveRole(), "premium");
  },

  // ===== Debug Role Override (Admin Only) =====

  /** Get current debug role override */
  get debugRoleOverride(): UserRole | null {
    return _state.debugRoleOverride;
  },

  /** Get effective role (override or actual, with security validation) */
  get effectiveRole(): UserRole {
    return getValidatedEffectiveRole();
  },

  /** Set debug role override (admin only) */
  setDebugRoleOverride(role: UserRole | null): void {
    if (_state.userRole !== "admin") {
      console.warn("[PostHogFeatureFlagService] Only admins can set debug role override");
      return;
    }
    _state.debugRoleOverride = role;
  },

  /** Clear debug role override */
  clearDebugRoleOverride(): void {
    _state.debugRoleOverride = null;
  },

  // ===== Initialization =====

  /**
   * Initialize the feature flag service for a user
   * Call this after authentication is confirmed
   *
   * @param userId - The user ID to initialize for (null for anonymous)
   * @param initialRole - The user's role from auth token claims (if available)
   */
  async initialize(
    userId: string | null,
    initialRole?: UserRole
  ): Promise<void> {
    _state.loading = true;

    // Dispose any existing subscriptions from a previous initialize() call
    _globalFlagPersister.dispose();
    _userFlagPersister.dispose();

    try {
      // Store user ID
      _state.userId = userId;

      if (userId) {
        // Set the role immediately if provided
        if (initialRole) {
          _state.userRole = initialRole;
        }

        // Load user overrides from localStorage synchronously as initial value
        _state.userOverrides = loadLocalUserOverrides(userId);

        if (browser) {
          // Update PostHog person properties with role info
          setUserProperties({
            role: _state.userRole,
            is_admin: _state.userRole === "admin",
            is_tester: hasRolePrivilege(_state.userRole, "tester"),
            is_premium: hasRolePrivilege(_state.userRole, "premium"),
          });

          // FIX #2 (Race condition): Load Firestore overrides BEFORE PostHog reload
          // so the correct override state is in place when flags are evaluated.
          try {
            const firestoreOverrides = await _globalFlagPersister.load();
            _state.globalFlagOverrides = firestoreOverrides.globalFlagOverrides;
            _state.globalRoleOverrides = firestoreOverrides.globalRoleOverrides;
            _state.flagsVersion++;
          } catch (error) {
            console.warn("[PostHogFeatureFlagService] Firestore global overrides load failed, using localStorage cache:", error);
          }

          // FIX #1 (User overrides from Firestore): Load authoritative user overrides
          try {
            const firestoreUserOverrides = await _userFlagPersister.load(userId);
            _state.userOverrides = firestoreUserOverrides;
            _state.flagsVersion++;
          } catch (error) {
            console.warn("[PostHogFeatureFlagService] Firestore user overrides load failed, using localStorage cache:", error);
          }

          // NOW reload PostHog with overrides already in place
          reloadFeatureFlags();

          // FIX #5 (Remote change notification): Subscribe with change detection
          _globalFlagPersister.subscribe((overrides: GlobalFlagOverrides) => {
            const now = Date.now();
            const isSelfInitiated = now - _selfInitiatedSaveTimestamp < 3000;

            const hadChanges =
              JSON.stringify(_state.globalFlagOverrides) !== JSON.stringify(overrides.globalFlagOverrides) ||
              JSON.stringify(_state.globalRoleOverrides) !== JSON.stringify(overrides.globalRoleOverrides);

            _state.globalFlagOverrides = overrides.globalFlagOverrides;
            _state.globalRoleOverrides = overrides.globalRoleOverrides;
            _state.flagsVersion++;

            // Show notification for remote changes (not our own writes)
            if (hadChanges && _state.initialized && !isSelfInitiated) {
              toast.info("Feature flags updated by another admin");
            }
          });

          // FIX #1 continued: Subscribe to user override changes (cross-device sync)
          _userFlagPersister.subscribe(userId, (overrides: UserFeatureOverrides) => {
            _state.userOverrides = overrides;
            _state.flagsVersion++;
          });
        }
      } else {
        // No user - reset to defaults
        _state.userRole = "user";
        _state.userOverrides = {
          enabledFeatures: [],
          disabledFeatures: [],
          moduleOrder: undefined,
        };

        // Still load global overrides for unauthenticated users
        if (browser) {
          try {
            const firestoreOverrides = await _globalFlagPersister.load();
            _state.globalFlagOverrides = firestoreOverrides.globalFlagOverrides;
            _state.globalRoleOverrides = firestoreOverrides.globalRoleOverrides;
            _state.flagsVersion++;
          } catch {
            // localStorage cache already loaded
          }

          _globalFlagPersister.subscribe((overrides: GlobalFlagOverrides) => {
            _state.globalFlagOverrides = overrides.globalFlagOverrides;
            _state.globalRoleOverrides = overrides.globalRoleOverrides;
            _state.flagsVersion++;
          });
        }
      }

      _state.initialized = true;
    } catch (error) {
      console.error("[PostHogFeatureFlagService] Initialization failed:", error);
      _state.userRole = initialRole || "user";
      _state.initialized = true;
    } finally {
      _state.loading = false;
    }
  },

  // ===== Admin Operations (delegated) =====

  async setUserFeatureOverrides(
    targetUserId: string,
    overrides: UserFeatureOverrides
  ): Promise<void> {
    return _adminService.setUserFeatureOverrides(targetUserId, overrides);
  },

  async setUserRole(targetUserId: string, newRole: UserRole): Promise<void> {
    return _adminService.setUserRole(targetUserId, newRole);
  },

  async updateGlobalFeatureFlag(
    featureId: FeatureId,
    updates: Partial<FeatureFlagConfig>
  ): Promise<{
    action: "created" | "updated" | "role_updated";
    flagKey: string;
    flagId?: number;
    note?: string;
    dashboardUrl?: string;
  }> {
    return _adminService.updateGlobalFeatureFlag(featureId, updates);
  },

  async logAuditEntry(entry: Record<string, unknown>): Promise<void> {
    return _adminService.logAuditEntry(entry);
  },

  // ===== Cleanup =====

  /**
   * Clean up subscriptions
   * Note: PostHog doesn't use subscriptions, so this is a no-op
   */
  cleanup(): void {
    _globalFlagPersister.dispose();
    _userFlagPersister.dispose();
  },

  // ===== PostHog-Specific Methods =====

  /**
   * Get all PostHog feature flags (for debugging)
   */
  getAllPostHogFlags(): Record<string, boolean | string> {
    return getAllFeatureFlags();
  },

  /**
   * Force reload PostHog feature flags
   */
  reloadFlags(): void {
    if (browser) {
      reloadFeatureFlags();
    }
  },
};

// ============================================================================
// EXPORT AS DEFAULT (same name as original for drop-in replacement)
// ============================================================================

/**
 * Feature flag service singleton
 * This is the PostHog-backed implementation that replaces the Firebase version.
 */
export const featureFlagService = postHogFeatureFlagService;

/**
 * Read-only reactive proxy for Svelte 5 $derived tracking.
 * Use this when you need $derived to react to flag changes:
 *
 * ```ts
 * const modules = $derived.by(() => {
 *   const _ = featureFlagState.flagsVersion; // Track changes
 *   return MODULE_DEFINITIONS.filter(m => featureFlagService.canAccessModule(m.id));
 * });
 * ```
 *
 * SECURITY: This is a read-only proxy. Mutating _state directly from the
 * console (e.g. to escalate debugRoleOverride) is blocked at the proxy
 * level, and double-checked at runtime in checkFeatureAccess().
 */
export const featureFlagState: {
  readonly flagsVersion: number;
  readonly globalFlagOverrides: Record<string, boolean>;
  readonly globalRoleOverrides: Record<string, UserRole>;
} = {
  get flagsVersion() {
    return _state.flagsVersion;
  },
  get globalFlagOverrides() {
    return _state.globalFlagOverrides;
  },
  get globalRoleOverrides() {
    return _state.globalRoleOverrides;
  },
};
