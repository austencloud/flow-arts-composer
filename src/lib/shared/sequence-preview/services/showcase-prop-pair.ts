import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { ResolvedPropConfig } from "$lib/shared/foundation/services/recorded-prop-intent";

export interface ShowcasePropPairInput {
  /** Caller override for the whole preview. Null = no override. */
  leftPropType: PropType | null;
  rightPropType: PropType | null;
  /** Creator-recorded pair from resolveRecordedPropConfig, or null. */
  recorded: ResolvedPropConfig | null;
  /** The visitor's active pair (captureActivePropConfig of Settings). */
  viewer: { leftPropType: PropType; rightPropType: PropType };
}

/**
 * The prop pair a showcase preview's Choreo Card draws. Mirrors the live
 * player's order: caller override, then the creator's recording, then the
 * visitor's Settings (the player's prop-type manager reads Settings when its
 * overrides are null). The card must never invent its own default, or a
 * sequence with no recording animates one prop over a staff card.
 */
export function resolveShowcasePropPair(
  input: ShowcasePropPairInput
): ResolvedPropConfig {
  const { recorded, viewer } = input;
  const leftPropType =
    input.leftPropType ?? recorded?.leftPropType ?? viewer.leftPropType;
  const rightPropType =
    input.rightPropType ?? recorded?.rightPropType ?? viewer.rightPropType;
  return {
    leftPropType,
    rightPropType,
    catDogMode:
      leftPropType !== rightPropType ? true : (recorded?.catDogMode ?? false),
  };
}
