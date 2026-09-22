/**
 * Feature Flag Utilities
 * Shared helpers for the feature flag management UI
 */

import type {
  FeatureId,
  FeatureFlagConfig,
  UserFeatureOverrides,
} from "$lib/shared/auth/domain/models/feature-flag";
import type { UserRole } from "$lib/shared/auth/domain/models/user-role";
import {
  ROLE_DISPLAY,
  hasRolePrivilege,
} from "$lib/shared/auth/domain/models/user-role";
import { MODULE_DEFINITIONS } from "$lib/shared/navigation/config/module-definitions";

/**
 * Override state for a single feature
 */
export type OverrideState = "inherit" | "grant" | "deny";

/**
 * User data shape for the override editor
 * NOTE: Email omitted for privacy - user documents are publicly readable
 */
export interface UserData {
  id: string;
  displayName: string;
  username: string;
  photoURL: string | null;
  role: UserRole;
  featureOverrides?: UserFeatureOverrides;
}

/**
 * Hierarchical feature structure for display
 */
export interface FeatureHierarchy {
  modules: ModuleWithTabs[];
  capabilities: FeatureFlagConfig[];
}

export interface ModuleWithTabs {
  module: FeatureFlagConfig;
  tabs: FeatureFlagConfig[];
}

/**
 * Get role display properties
 */
export function getRoleColor(role: UserRole): string {
  return ROLE_DISPLAY[role].color;
}

export function getRoleIcon(role: UserRole): string {
  return ROLE_DISPLAY[role].icon;
}

export function getRoleLabel(role: UserRole): string {
  return ROLE_DISPLAY[role].label;
}

/**
 * Extract icon class from HTML icon string
 * @example extractIconClass('<i class="fas fa-home" ...>') => 'fa-home'
 */
function extractIconClass(iconHtml: string): string {
  // Match FontAwesome icon class (fa-something)
  const match = iconHtml.match(/fa-[\w-]+/);
  return match?.[0] ?? "fa-cubes";
}

/**
 * Get feature icon and color from module definitions
 * Uses structured color property directly, extracts icon class from HTML
 */
export function getFeatureIconAndColor(featureId: string): {
  icon: string;
  color: string;
} {
  const parts = featureId.split(":");
  const type = parts[0];

  if (type === "module") {
    const moduleId = parts[1] ?? "";
    const module = MODULE_DEFINITIONS.find((m) => m.id === moduleId);
    if (module) {
      return {
        icon: extractIconClass(module.icon),
        color: module.color ?? "#8b5cf6",
      };
    }
  }

  if (type === "tab") {
    const moduleId = parts[1] ?? "";
    const tabId = parts[2] ?? "";
    const module = MODULE_DEFINITIONS.find((m) => m.id === moduleId);
    if (module) {
      const tab = module.sections?.find((s) => s.id === tabId);
      if (tab) {
        return {
          icon: extractIconClass(tab.icon),
          color: tab.color ?? module.color ?? "#6b7280",
        };
      }
    }
  }

  // Fallback for any unknown feature type (including future capabilities)
  return { icon: "fa-flag", color: "#6b7280" };
}

/**
 * Build hierarchical feature structure
 */
export function buildFeatureHierarchy(
  featureFlags: FeatureFlagConfig[]
): FeatureHierarchy {
  const modules: ModuleWithTabs[] = [];
  const capabilities: FeatureFlagConfig[] = [];
  const moduleMap = new Map<string, ModuleWithTabs>();

  // First pass: collect modules
  for (const flag of featureFlags) {
    if (flag.category === "module") {
      const moduleId = flag.id.split(":")[1] ?? "";
      moduleMap.set(moduleId, { module: flag, tabs: [] });
    } else if (flag.category === "capability") {
      capabilities.push(flag);
    }
  }

  // Second pass: attach tabs to modules
  for (const flag of featureFlags) {
    if (flag.category === "tab") {
      const parts = flag.id.split(":");
      const moduleId = parts[1] ?? "";
      const moduleEntry = moduleMap.get(moduleId);
      if (moduleEntry) {
        moduleEntry.tabs.push(flag);
      }
    }
  }

  // Convert map to array, sorted by module name
  for (const entry of moduleMap.values()) {
    modules.push(entry);
  }
  modules.sort((a, b) => a.module.name.localeCompare(b.module.name));

  return { modules, capabilities };
}

export function getOverrideState(
  featureId: FeatureId,
  overrides?: UserFeatureOverrides
): OverrideState {
  if (!overrides) return "inherit";
  if (overrides.enabledFeatures?.includes(featureId)) return "grant";
  if (overrides.disabledFeatures?.includes(featureId)) return "deny";
  return "inherit";
}

/**
 * Calculate effective access for a feature given role and overrides
 */
export function calculateEffectiveAccess(
  flag: FeatureFlagConfig,
  userRole: UserRole,
  overrides?: UserFeatureOverrides
): { hasAccess: boolean; reason: string } {
  // Check for explicit deny (highest priority)
  if (overrides?.disabledFeatures?.includes(flag.id)) {
    return { hasAccess: false, reason: "Explicitly denied" };
  }

  // Check for explicit grant
  if (overrides?.enabledFeatures?.includes(flag.id)) {
    return { hasAccess: true, reason: "Explicitly granted" };
  }

  // Check global enabled flag
  if (!flag.enabled) {
    return { hasAccess: false, reason: "Globally disabled" };
  }

  // Check role-based access
  if (hasRolePrivilege(userRole, flag.minimumRole)) {
    return { hasAccess: true, reason: `${getRoleLabel(userRole)} role` };
  }

  return {
    hasAccess: false,
    reason: `Requires ${getRoleLabel(flag.minimumRole)}`,
  };
}

/**
 * Convert override state changes to UserFeatureOverrides
 */
export function buildOverridesFromStates(
  states: Map<FeatureId, OverrideState>
): UserFeatureOverrides {
  const enabledFeatures: FeatureId[] = [];
  const disabledFeatures: FeatureId[] = [];

  for (const [featureId, state] of states) {
    if (state === "grant") {
      enabledFeatures.push(featureId);
    } else if (state === "deny") {
      disabledFeatures.push(featureId);
    }
  }

  return { enabledFeatures, disabledFeatures };
}

/**
 * Calculate impact of override changes
 */
export function calculateImpact(
  flags: FeatureFlagConfig[],
  userRole: UserRole,
  currentOverrides: UserFeatureOverrides | undefined,
  newOverrides: UserFeatureOverrides
): { gained: string[]; lost: string[]; unchanged: string[] } {
  const gained: string[] = [];
  const lost: string[] = [];
  const unchanged: string[] = [];

  for (const flag of flags) {
    const currentAccess = calculateEffectiveAccess(flag, userRole, currentOverrides);
    const newAccess = calculateEffectiveAccess(flag, userRole, newOverrides);

    if (!currentAccess.hasAccess && newAccess.hasAccess) {
      gained.push(flag.name);
    } else if (currentAccess.hasAccess && !newAccess.hasAccess) {
      lost.push(flag.name);
    } else {
      unchanged.push(flag.name);
    }
  }

  return { gained, lost, unchanged };
}

/**
 * Filter features by search query
 */
export function filterFeatures(
  features: FeatureFlagConfig[],
  query: string
): FeatureFlagConfig[] {
  if (!query.trim()) return features;
  const q = query.toLowerCase();
  return features.filter(
    (f) =>
      f.name.toLowerCase().includes(q) ||
      f.description.toLowerCase().includes(q) ||
      f.id.toLowerCase().includes(q)
  );
}

/**
 * Quick preset definitions
 */
export interface QuickPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  features: string[];
}

export const QUICK_PRESETS: QuickPreset[] = [
  {
    id: "tester-bundle",
    name: "Tester Bundle",
    description: "Grant access to all tester-level modules",
    icon: "fa-flask",
    color: "#8b5cf6",
    features: [
      "module:learn",
      "module:compose",
      "module:train",
      "module:library",
    ],
  },
  {
    id: "premium-exports",
    name: "Premium Exports",
    description: "Enable all export capabilities",
    icon: "fa-download",
    color: "#10b981",
    features: [
      "capability:export:video",
      "capability:export:png",
    ],
  },
  {
    id: "full-access",
    name: "Full Access",
    description: "Grant access to everything",
    icon: "fa-key",
    color: "#f59e0b",
    features: [], // Special case: grants all
  },
];

/**
 * Statistics about feature flags
 */
export interface FlagStats {
  total: number;
  enabled: number;
  disabled: number;
  byRole: Record<UserRole, number>;
  byCategory: Record<string, number>;
}

export function computeStats(flags: FeatureFlagConfig[]): FlagStats {
  const byRole: Record<UserRole, number> = {
    user: 0,
    premium: 0,
    tester: 0,
    admin: 0,
  };
  const byCategory: Record<string, number> = {
    module: 0,
    tab: 0,
    capability: 0,
  };

  let enabled = 0;

  for (const flag of flags) {
    if (flag.enabled) enabled++;
    byRole[flag.minimumRole]++;
    const cat = flag.category as keyof typeof byCategory;
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
  }

  return {
    total: flags.length,
    enabled,
    disabled: flags.length - enabled,
    byRole,
    byCategory,
  };
}
