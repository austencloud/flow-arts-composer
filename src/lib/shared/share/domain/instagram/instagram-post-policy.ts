import type {
  InstagramCapabilityRecoveryAction,
  InstagramCapabilitySnapshot,
  InstagramFeatureKey,
} from "#lib/shared/share/domain/instagram/instagram-capability-schema.js";
import type { PostDeliveryDraft } from "#lib/shared/share/domain/instagram/instagram-post-draft-schema.js";

export interface InstagramPublishEligibility {
  canPublishDirectly: boolean;
  reasonCode: string | null;
  recoveryAction: InstagramCapabilityRecoveryAction;
  requiredFeature: InstagramFeatureKey;
}

const FEATURE_BY_FORMAT: Record<
  PostDeliveryDraft["format"],
  InstagramFeatureKey
> = {
  image: "image",
  reel: "reel",
  carousel: "carousel",
  story: "story",
};

export function evaluateInstagramPublishEligibility(
  draft: PostDeliveryDraft,
  snapshot: InstagramCapabilitySnapshot | null,
  nowMs = Date.now()
): InstagramPublishEligibility {
  const requiredFeature = FEATURE_BY_FORMAT[draft.format];
  if (!snapshot) {
    return {
      canPublishDirectly: false,
      reasonCode: "meta/capabilities-missing",
      recoveryAction: "reconnect",
      requiredFeature,
    };
  }
  if (
    draft.selectedAccountId !== null &&
    draft.selectedAccountId !== snapshot.accountId
  ) {
    return {
      canPublishDirectly: false,
      reasonCode: "meta/account-mismatch",
      recoveryAction: "connect-instagram",
      requiredFeature,
    };
  }
  if (snapshot.expiresAtMs <= nowMs) {
    return {
      canPublishDirectly: false,
      reasonCode: "meta/token-expired",
      recoveryAction: "reconnect",
      requiredFeature,
    };
  }

  const capability = snapshot.features[requiredFeature];
  return {
    canPublishDirectly: capability.available,
    reasonCode: capability.reasonCode,
    recoveryAction: capability.recoveryAction,
    requiredFeature,
  };
}

export function countInstagramCaptionParts(caption: string): {
  characters: number;
  hashtags: number;
  mentions: number;
} {
  return {
    characters: [...caption].length,
    hashtags: caption.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0,
    mentions: caption.match(/@[A-Za-z0-9._]+/g)?.length ?? 0,
  };
}
