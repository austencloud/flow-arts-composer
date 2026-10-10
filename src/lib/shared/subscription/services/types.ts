import type { CapabilityFeatureId } from "#lib/shared/auth/domain/models/feature-flag.js";
export interface NudgeConfig {
	capability: CapabilityFeatureId;
	description: string;
	premiumBenefit: string;
}

export interface PremiumGateResult {
	allowed: boolean;
	reason?: "auth_required" | "premium_required" | "capability_disabled";
	nudge?: NudgeConfig;
	nudgeType?: "auth" | "premium";
}



export type SubscriptionStatus =
  | "active"
  | "canceled"
  | "past_due"
  | "trialing"
  | "incomplete"
  | "none";

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}
