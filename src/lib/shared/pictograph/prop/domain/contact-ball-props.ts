import { PropType } from "./enums/prop-type";

/**
 * The contact-ball family. It left the prop selector on 2026-11-14, and a
 * person's own chosen contact ball moves to Staff when their settings are read
 * or a prop change is applied (settings/domain/prop-pair-rule.ts). Saved
 * sequences, cards, shared pieces and films keep drawing a contact ball.
 */
export const CONTACT_BALL_PROP_TYPES: readonly PropType[] = [
  PropType.CONTACTBALL,
  PropType.BIGCONTACTBALL,
  PropType.DOUBLECONTACTBALL,
  PropType.BIGDOUBLECONTACTBALL,
];

export function isContactBallProp(propType: PropType | undefined): boolean {
  return propType !== undefined && CONTACT_BALL_PROP_TYPES.includes(propType);
}
