import type { FeatureFlagConfig } from "#lib/shared/auth/domain/models/feature-flag.js";

/**
 * Early-access capability flags — surfaces that are built but not finished,
 * hidden from regular users until they ship. Defaulted off for everyone;
 * admins bypass via role in the surface's access helper, and individual users
 * are let in through their per-user enabledFeatures override
 * (users/{uid}/settings/featureOverrides, set from the admin Users panel).
 *
 * minimumRole stays "user" ON PURPOSE: the per-user override bypasses the
 * enabled check but never the role check, so an "admin" role here would lock
 * the early-access users out — the whole point of the flag.
 */
export const EARLY_ACCESS_CAPABILITY_CONFIGS: FeatureFlagConfig[] = [
	{
		id: "capability:viewer:post-studio",
		name: "Post Studio",
		description:
			"Vertical-post composition workspace in the sequence viewer (early access)",
		minimumRole: "user",
		enabled: false,
		category: "capability",
	},
];
