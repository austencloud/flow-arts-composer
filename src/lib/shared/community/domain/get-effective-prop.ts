import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { UserProfile } from "./models/enhanced-user-profile";
import {
  normalizeProfileSkill,
  normalizeProfileSkills,
} from "./profile-prop-catalog";

/**
 * The single precedence rule for a creator's displayed prop identity. An
 * explicit Profile prop wins. A single curated prop can represent the creator
 * without an extra decision. Multiple curated props intentionally have no
 * implicit favorite. activeProp remains a fallback for legacy profiles only.
 *
 * All display sites (creator cards, profile hero, group-by-prop sort) go
 * through this — never read favoriteProp/activeProp directly for display.
 */
export function getEffectiveProp(
  user: Pick<UserProfile, "favoriteProp" | "activeProp" | "propsISpinWith">
): PropType | null {
  if (user.favoriteProp) {
    return normalizeProfileSkill(user.favoriteProp) ?? user.favoriteProp;
  }

  const savedProps = user.propsISpinWith ?? [];
  const curatedProps = normalizeProfileSkills(savedProps);
  if (curatedProps.length === 1) return curatedProps[0] ?? null;
  if (curatedProps.length > 1) return null;

  // Profiles from before the skill catalog may only contain an opaque prop.
  if (savedProps.length === 1) return savedProps[0] ?? null;
  if (savedProps.length > 1) return null;

  return user.activeProp
    ? (normalizeProfileSkill(user.activeProp) ?? user.activeProp)
    : null;
}
