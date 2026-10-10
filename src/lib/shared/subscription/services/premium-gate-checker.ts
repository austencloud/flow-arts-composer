import { featureFlagService } from "#lib/shared/auth/services/post-hog-feature-flag-service.svelte.js";
import { isPremiumOrAbove } from "#lib/shared/auth/domain/models/user-role.js";
import { CAPABILITY_NUDGES } from "../domain/capability-nudges";
import type { PremiumGateResult } from "./types";
import type { CapabilityFeatureId } from "#lib/shared/auth/domain/models/feature-flag.js";

function notAllowed(capability: CapabilityFeatureId): PremiumGateResult {
  const nudge = CAPABILITY_NUDGES[capability];
  return {
    allowed: false,
    reason: "premium_required",
    nudgeType: "premium",
    nudge: nudge ?? {
      capability,
      description: "Premium feature",
      premiumBenefit: "Unlock this feature with Premium",
    },
  };
}

function authRequired(capability: CapabilityFeatureId): PremiumGateResult {
  return {
    allowed: false,
    reason: "auth_required",
    nudgeType: "auth",
    nudge: {
      capability,
      description: "Account required",
      premiumBenefit: "Create a free account to access this feature",
    },
  };
}

export function checkPremiumGate(capability: CapabilityFeatureId): PremiumGateResult {
  const role = featureFlagService.effectiveRole;

  if (!featureFlagService.userId) {
    return authRequired(capability);
  }

  if (isPremiumOrAbove(role)) {
    return { allowed: true };
  }

  if (featureFlagService.canAccess(capability)) {
    return { allowed: true };
  }

  return notAllowed(capability);
}

export function checkMultiplePremiumGates(capabilities: CapabilityFeatureId[]): PremiumGateResult[] {
  return capabilities.map((c) => checkPremiumGate(c));
}

export function isPremiumAllowed(capability: CapabilityFeatureId): boolean {
  return checkPremiumGate(capability).allowed;
}
