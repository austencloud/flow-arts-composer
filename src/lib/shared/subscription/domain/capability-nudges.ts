import type { CapabilityFeatureId } from "#lib/shared/auth/domain/models/feature-flag.js";
import type { NudgeConfig } from "../services/types";

export const CAPABILITY_NUDGES: Record<CapabilityFeatureId, NudgeConfig> = {
	"capability:export:effects": {
		capability: "capability:export:effects",
		description: "Export with effects",
		premiumBenefit: "Effects and efforts applied to your exports",
	},
	"capability:export:custom-duration": {
		capability: "capability:export:custom-duration",
		description: "Export with custom duration",
		premiumBenefit: "Set any duration for your exported animations",
	},
	"capability:export:composition": {
		capability: "capability:export:composition",
		description: "Export compositions",
		premiumBenefit: "Export your composed arrangements as video",
	},
	"capability:learn:full-curriculum": {
		capability: "capability:learn:full-curriculum",
		description: "Full curriculum access",
		premiumBenefit: "Letters, Combinations, and Advanced lessons",
	},
};
