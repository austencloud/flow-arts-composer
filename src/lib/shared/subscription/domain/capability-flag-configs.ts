import type { FeatureFlagConfig } from "#lib/shared/auth/domain/models/feature-flag.js";

/**
 * Each premium capability needs a FeatureFlagConfig so that
 * postHogFeatureFlagService.canAccess() doesn't fall through to
 * the secure "admin" default. Setting minimumRole: "user" means
 * the role check passes for everyone - the PremiumGateChecker
 * handles the actual premium role check before calling canAccess().
 * Setting enabled: false means the capability is off by default -
 * only users with explicit enabledFeatures overrides get through.
 */
export const PREMIUM_CAPABILITY_CONFIGS: FeatureFlagConfig[] = [
	{
		id: "capability:export:effects",
		name: "Export with Effects",
		description: "Download Animations with effects and efforts applied",
		minimumRole: "user",
		enabled: false,
		category: "capability",
	},
	{
		id: "capability:export:custom-duration",
		name: "Export with Custom Duration",
		description: "Export with non-default animation duration",
		minimumRole: "user",
		enabled: false,
		category: "capability",
	},
	{
		id: "capability:export:composition",
		name: "Export Compositions",
		description: "Export composed arrangements as video",
		minimumRole: "user",
		enabled: false,
		category: "capability",
	},
	{
		id: "capability:learn:full-curriculum",
		name: "Full Curriculum Access",
		description: "Access all lessons beyond the first 10",
		minimumRole: "user",
		enabled: false,
		category: "capability",
	},
];
