// A release note's "Show me" goes where the note's `surface` points, but only
// when that place exists and this reader can open it. Old notes keep pointing
// at tabs that may have moved or closed since; those degrade to plain text
// here instead of showing a dead button.

import type { ReleaseSurface } from "../models/version-models";
import type { AccessTier } from "#lib/shared/auth/domain/access-tier.js";
import type { ModuleId } from "#lib/shared/navigation/domain/types.js";
import {
  getModuleDefinition,
  isValidModule,
  isValidTabForModule,
} from "#lib/shared/navigation/services/navigation-validator.js";
import {
  isModuleAccessible,
  isTabAccessible,
} from "#lib/shared/auth/domain/guest-access-config.js";
import { isModuleEnabledInEnvironment } from "#lib/shared/environment/environment-features.js";

export interface ShowMeTarget {
  moduleId: ModuleId;
  tabId?: string;
}

/** What the resolver asks of the app's registries, so a test can stand them in. */
export interface ShowMeRegistry {
  /** The module is registered, activates in-app (not a link-out) and is live here. */
  isModuleOpen(moduleId: string): moduleId is ModuleId;
  isTabRegistered(moduleId: ModuleId, tabId: string): boolean;
  canReach(
    moduleId: ModuleId,
    tabId: string | undefined,
    tier: AccessTier
  ): boolean;
}

export const appShowMeRegistry: ShowMeRegistry = {
  isModuleOpen(moduleId): moduleId is ModuleId {
    if (!isValidModule(moduleId)) return false;
    const definition = getModuleDefinition(moduleId);
    if (!definition || definition.linkHref || definition.disabled) return false;
    return isModuleEnabledInEnvironment(moduleId);
  },
  isTabRegistered: isValidTabForModule,
  canReach(moduleId, tabId, tier) {
    if (!isModuleAccessible(moduleId, tier)) return false;
    return tabId === undefined || isTabAccessible(moduleId, tabId, tier);
  },
};

/**
 * Where a note's "Show me" should go, or null for no button at all.
 *
 * Null for: no surface, `"global"`, an unknown or link-out or unreleased
 * module, an unknown tab, or a tab this tier cannot open (a guest reading an
 * account-only note). A tab-less surface on a module whose tabs a guest can
 * only partly open is still fine: the module's own routing lands on a tab
 * the guest may see.
 */
export function resolveShowMeTarget(
  surface: ReleaseSurface | undefined,
  tier: AccessTier,
  registry: ShowMeRegistry = appShowMeRegistry
): ShowMeTarget | null {
  if (!surface || surface === "global") return null;
  if (typeof surface !== "object" || typeof surface.module !== "string") {
    return null;
  }
  const moduleId = surface.module;
  if (!registry.isModuleOpen(moduleId)) return null;

  const tabId =
    typeof surface.tab === "string" && surface.tab.length > 0
      ? surface.tab
      : undefined;
  if (tabId !== undefined && !registry.isTabRegistered(moduleId, tabId)) {
    return null;
  }
  if (!registry.canReach(moduleId, tabId, tier)) return null;

  return tabId === undefined ? { moduleId } : { moduleId, tabId };
}
