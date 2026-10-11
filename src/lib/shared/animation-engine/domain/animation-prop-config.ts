import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

export interface AnimationPropConfig {
  leftPropType: PropType;
  rightPropType: PropType;
}

export type AnimationPropConfigProvider = () => AnimationPropConfig;

export const DEFAULT_ANIMATION_PROP_CONFIG: AnimationPropConfig = {
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
};
