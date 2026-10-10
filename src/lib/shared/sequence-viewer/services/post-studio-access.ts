import { featureFlagService } from "#lib/shared/auth/services/post-hog-feature-flag-service.svelte.js";

/** Early-access gate for Post Studio — registered in early-access-feature-flags.ts. */
export const POST_STUDIO_FEATURE_ID = "capability:viewer:post-studio" as const;

/**
 * Post Studio is in early access: withheld from regular users until it is
 * finished. Admins always have it (it is theirs to build); anyone else needs
 * the capability granted per-user via
 * users/{uid}/settings/featureOverrides.enabledFeatures.
 *
 * effectiveRole rather than userRole so an admin previewing a lower role via
 * the debug override sees exactly what that role sees. This gates entry points
 * only — the components ship in the bundle either way, so it is rollout
 * hygiene, not a security boundary.
 */
export function canAccessPostStudio(): boolean {
	return (
		featureFlagService.effectiveRole === "admin" ||
		featureFlagService.canAccess(POST_STUDIO_FEATURE_ID)
	);
}
