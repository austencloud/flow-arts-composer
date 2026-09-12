/**
 * Feature Flag Types and Configuration
 *
 * Defines the available feature flags and their access control.
 * Features can be gated by:
 * - Role (minimum role required)
 * - Explicit user override (per-user enable/disable)
 * - Global enable/disable
 */

import { type UserRole, ROLE_HIERARCHY } from "./user-role";
import type { ModuleId } from "../../../navigation/domain/types";

/**
 * Feature identifiers for modules
 * Dynamically generated from MODULE_DEFINITIONS at runtime
 */
export type ModuleFeatureId = `module:${ModuleId}`;

/**
 * Feature identifiers for tabs within modules
 * Dynamically generated from MODULE_DEFINITIONS sections at runtime
 */
export type TabFeatureId = `tab:${string}:${string}`;

/**
 * Feature identifiers for specific capabilities
 * Currently no capabilities are defined - add them here when needed
 * Format: "capability:{category}:{name}"
 */
export type CapabilityFeatureId = `capability:${string}:${string}`;

/**
 * All feature flag identifiers
 */
export type FeatureId = ModuleFeatureId | TabFeatureId | CapabilityFeatureId;

/**
 * Feature flag configuration
 */
export interface FeatureFlagConfig {
  /** Unique feature identifier */
  id: FeatureId;
  /** Human-readable name */
  name: string;
  /** Description for admin UI */
  description: string;
  /** Minimum role required to access this feature */
  minimumRole: UserRole;
  /** Whether the feature is globally enabled */
  enabled: boolean;
  /** Category for grouping in admin UI */
  category: "module" | "tab" | "capability";
}

/**
 * User-specific feature overrides stored in Firestore
 */
export interface UserFeatureOverrides {
  /** Features explicitly enabled for this user (bypasses enabled check, NOT role check) */
  enabledFeatures: FeatureId[];
  /** Features explicitly disabled for this user (overrides role) */
  disabledFeatures: FeatureId[];
  /** Custom module order for sidebar (module IDs in desired order) */
  moduleOrder?: string[];
}

/**
 * Core modules that are always accessible to all users.
 * These work even before auth/database loads to prevent layout shifts.
 *
 * ARCHITECTURE: Default is "admin" (secure by default).
 * - Core modules listed here = always "user" accessible
 * - Everything else = "admin" by default
 * - Use PostHog Feature Flags to open modules to testers/users
 *
 * This keeps hardcoded config minimal - PostHog is the source of truth
 * for everything beyond these essentials.
 */
const CORE_USER_MODULES: ModuleId[] = [
  "create",
  "browse",
  "settings",
  "feedback",
];

/**
 * Modules open to testers by default.
 *
 * The runtime role override only reaches tabs and capabilities: the admin
 * Permission Matrix renders role cells per tab, so a module with no tabs
 * has no cell to click, and checkFeatureAccess() runs the role check on
 * every path (PostHog and per-user grants can't lower it). Until modules
 * get their own row in the matrix, this list is the only way to open a
 * tab-less module below admin.
 */
const TESTER_MODULES: ModuleId[] = ["choreo"];

/**
 * Tabs that are still in development - visible to admins only,
 * regardless of the parent module's role.
 * Format: "moduleId:tabId"
 */
const ADMIN_ONLY_TABS: string[] = ["create:assemble"];

/**
 * Get the default role for a feature
 * Used by FeatureFlagService to determine minimum role requirements
 *
 * Logic:
 * 1. Core modules (create, browse, settings, feedback) → "user"
 * 2. TESTER_MODULES → "tester"
 * 3. Tabs → inherit from parent module
 * 4. Everything else → "admin" (secure by default)
 *
 * To open a tab to testers or users, configure it in the Permission Matrix.
 */
export function getDefaultFeatureRole(
  featureId: FeatureId,
  parentModuleRole?: UserRole
): UserRole {
  // Check if this is a core user module
  if (featureId.startsWith("module:")) {
    const moduleId = featureId.replace("module:", "") as ModuleId;
    if (CORE_USER_MODULES.includes(moduleId)) {
      return "user";
    }
    if (TESTER_MODULES.includes(moduleId)) {
      return "tester";
    }
  }

  // Check if this tab is explicitly admin-only (in development)
  if (featureId.startsWith("tab:")) {
    const tabKey = featureId.replace("tab:", "");
    if (ADMIN_ONLY_TABS.includes(tabKey)) {
      return "admin";
    }
    // Otherwise inherit parent module role
    if (parentModuleRole) {
      return parentModuleRole;
    }
  }

  // Default to admin (secure by default)
  return "admin";
}

/**
 * Default feature flags - populated dynamically at runtime from MODULE_DEFINITIONS
 * This is a placeholder that will be replaced by the service.
 * @deprecated Access feature flags via featureFlagService.featureConfigs instead
 */
export const DEFAULT_FEATURE_FLAGS: FeatureFlagConfig[] = [];

/**
 * Helper to convert module ID to feature ID
 */
export function moduleIdToFeatureId(moduleId: ModuleId): ModuleFeatureId {
  return `module:${moduleId}` as ModuleFeatureId;
}

/**
 * Helper to convert tab ID to feature ID
 */
export function tabIdToFeatureId(
  moduleId: ModuleId,
  tabId: string
): TabFeatureId {
  return `tab:${moduleId}:${tabId}` as TabFeatureId;
}

/**
 * Get feature config by ID from defaults
 */
export function getDefaultFeatureConfig(
  featureId: FeatureId
): FeatureFlagConfig | undefined {
  return DEFAULT_FEATURE_FLAGS.find((f) => f.id === featureId);
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Valid prefixes for FeatureId
 */
const FEATURE_ID_PREFIXES = ["module:", "tab:", "capability:"] as const;

/**
 * Check if a value is a valid FeatureId format
 * Format: "prefix:value" or "prefix:value:value"
 */
export function isValidFeatureId(value: unknown): value is FeatureId {
  if (typeof value !== "string") {
    return false;
  }

  // Must start with a valid prefix
  const hasValidPrefix = FEATURE_ID_PREFIXES.some((prefix) =>
    value.startsWith(prefix)
  );
  if (!hasValidPrefix) {
    return false;
  }

  // Must have content after the prefix
  const prefixMatch = FEATURE_ID_PREFIXES.find((prefix) =>
    value.startsWith(prefix)
  );
  if (!prefixMatch) {
    return false;
  }

  const afterPrefix = value.slice(prefixMatch.length);
  if (!afterPrefix || afterPrefix.length === 0) {
    return false;
  }

  // Tab IDs must have module:tab format (two parts after "tab:")
  if (value.startsWith("tab:")) {
    const parts = afterPrefix.split(":");
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      return false;
    }
  }

  // Capability IDs must have category:name format
  if (value.startsWith("capability:")) {
    const parts = afterPrefix.split(":");
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a value is a valid UserRole
 */
export function isValidUserRole(value: unknown): value is UserRole {
  if (typeof value !== "string") {
    return false;
  }
  return ROLE_HIERARCHY.includes(value as UserRole);
}

/**
 * Parse a string to FeatureId, returning undefined if invalid
 * Useful for safely converting user input or external data
 */
export function parseFeatureId(value: string): FeatureId | undefined {
  if (isValidFeatureId(value)) {
    return value;
  }
  return undefined;
}

/**
 * Parse a string to UserRole, returning undefined if invalid
 * Useful for safely converting user input or external data
 */
export function parseUserRole(value: string): UserRole | undefined {
  if (isValidUserRole(value)) {
    return value;
  }
  return undefined;
}
