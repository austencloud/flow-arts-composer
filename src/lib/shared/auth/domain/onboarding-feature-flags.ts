import type { FeatureFlagConfig } from "#lib/shared/auth/domain/models/feature-flag.js";

/**
 * Onboarding-related capability flags. Kept separate from
 * PREMIUM_CAPABILITY_CONFIGS (subscription/domain/capability-flag-configs.ts)
 * because these are not premium gates — they are rollout kill-switches for
 * onboarding experiments, defaulted off until explicitly enabled via
 * PostHog or an admin override.
 */
export const ONBOARDING_CAPABILITY_CONFIGS: FeatureFlagConfig[] = [
	{
		id: "capability:onboarding:first-session-activation",
		name: "First-Session Activation",
		// The one-tap first-sequence starter this flag also gated was removed
		// 2026-07-29; only the keep-on-first-save nudge remains behind it.
		description: "Keep-on-first-save account nudge",
		minimumRole: "user",
		enabled: false,
		category: "capability",
	},
];
