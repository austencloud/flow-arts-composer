import { getEffectiveProp } from "#lib/shared/community/domain/get-effective-prop.js";
import type { EnhancedUserProfile } from "#lib/shared/community/domain/models/enhanced-user-profile.js";
import { normalizeProfileSkills } from "#lib/shared/community/domain/profile-prop-catalog.js";
import { getPropTypeDisplayInfo } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";

/**
 * Match the public details shown on creator cards, including prop labels.
 */
export function matchesCreatorQuery(
  user: EnhancedUserProfile,
  query: string
): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const effectiveProp = getEffectiveProp(user);
  const propNames = [
    effectiveProp ? getPropTypeDisplayInfo(effectiveProp).label : "",
    ...normalizeProfileSkills(user.propsISpinWith ?? []).map(
      (prop) => getPropTypeDisplayInfo(prop).label
    ),
  ];
  const searchableText = [
    user.username,
    user.displayName,
    user.bio,
    user.pronouns,
    ...propNames,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return terms.every((term) => searchableText.includes(term));
}
