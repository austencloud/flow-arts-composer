/**
 * SidebarTabToggler
 *
 * Admin tool for toggling tab visibility via the sidebar context menu.
 * Uses updateGlobalFeatureFlag to enable/disable tabs globally.
 * Role requirements are unchanged - this only controls whether a tab appears at all.
 */

import type { ModuleId } from "../domain/types";
import type { TabVisibilityInfo } from "./types";
import { MODULE_DEFINITIONS } from "../config/module-definitions";
import {
  featureFlagService,
} from "#lib/shared/auth/services/post-hog-feature-flag-service.svelte.js";
import {
  tabIdToFeatureId,
  getDefaultFeatureRole,
  moduleIdToFeatureId,
} from "#lib/shared/auth/domain/models/feature-flag.js";
import { hasRolePrivilege } from "#lib/shared/auth/domain/models/user-role.js";

export function getAllTabsForModule(moduleId: ModuleId): TabVisibilityInfo[] {
  const moduleDef = MODULE_DEFINITIONS.find((m) => m.id === moduleId);
  if (!moduleDef) return [];

  const moduleFeatureId = moduleIdToFeatureId(moduleId);
  const moduleMinRole = getDefaultFeatureRole(moduleFeatureId);
  const userRole = featureFlagService.effectiveRole;

  return moduleDef.sections.map((section) => {
    const featureId = tabIdToFeatureId(moduleId, section.id);
    const isVisible = featureFlagService.canAccessTab(moduleId, section.id);

    // Role-locked: user's role is insufficient for this tab's minimum role
    const tabMinRole = getDefaultFeatureRole(featureId, moduleMinRole);
    const isRoleLocked = !hasRolePrivilege(userRole, tabMinRole);

    return {
      section,
      isVisible,
      isRoleLocked,
    };
  });
}

export async function hideTab(moduleId: ModuleId, tabId: string): Promise<void> {
  const featureId = tabIdToFeatureId(moduleId, tabId);
  await featureFlagService.updateGlobalFeatureFlag(featureId, {
    enabled: false,
  });
}

export async function showTab(moduleId: ModuleId, tabId: string): Promise<void> {
  const featureId = tabIdToFeatureId(moduleId, tabId);
  await featureFlagService.updateGlobalFeatureFlag(featureId, {
    enabled: true,
  });
}
