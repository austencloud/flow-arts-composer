import {
  type FeatureId,
  type FeatureFlagConfig,
  moduleIdToFeatureId,
  tabIdToFeatureId,
  getDefaultFeatureRole,
} from "./models/feature-flag";
import { MODULE_DEFINITIONS } from "../../navigation/config/module-definitions";
import { PREMIUM_CAPABILITY_CONFIGS } from "#lib/shared/subscription/domain/capability-flag-configs.js";
import { ONBOARDING_CAPABILITY_CONFIGS } from "./onboarding-feature-flags";
import { EARLY_ACCESS_CAPABILITY_CONFIGS } from "./early-access-feature-flags";

function generateFeatureFlagsFromModules(): FeatureFlagConfig[] {
  const flags: FeatureFlagConfig[] = [];

  for (const module of MODULE_DEFINITIONS) {
    const moduleFeatureId = moduleIdToFeatureId(module.id);
    const moduleRole = getDefaultFeatureRole(moduleFeatureId);

    flags.push({
      id: moduleFeatureId,
      name: `${module.label} Module`,
      description:
        module.description ||
        `Access to ${module.label.toLowerCase()} features`,
      minimumRole: moduleRole,
      enabled: true,
      category: "module",
    });

    for (const section of module.sections) {
      const tabFeatureId = tabIdToFeatureId(module.id, section.id);
      const tabRole = getDefaultFeatureRole(tabFeatureId, moduleRole);

      flags.push({
        id: tabFeatureId,
        name: `${section.label} Tab`,
        description:
          section.description || `${section.label} in ${module.label}`,
        minimumRole: tabRole,
        enabled: true,
        category: "tab",
      });
    }
  }

  return flags;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlagConfig[] = [
  ...generateFeatureFlagsFromModules(),
  ...PREMIUM_CAPABILITY_CONFIGS,
  ...ONBOARDING_CAPABILITY_CONFIGS,
  ...EARLY_ACCESS_CAPABILITY_CONFIGS,
];

export function getDefaultFeatureConfig(
  featureId: FeatureId
): FeatureFlagConfig | null {
  return DEFAULT_FEATURE_FLAGS.find((f) => f.id === featureId) || null;
}
