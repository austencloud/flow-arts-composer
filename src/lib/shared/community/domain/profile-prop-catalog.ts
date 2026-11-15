import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { getPropTypeDisplayInfo } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";

/** A skill a creator can meaningfully claim, independent of its render asset. */
export interface ProfilePropSkillChoice {
  prop: PropType;
  label: string;
  members: readonly PropType[];
}

export interface ProfilePropFamily {
  representative: PropType;
  label: string;
  choices: readonly ProfilePropSkillChoice[];
}

function skill(
  prop: PropType,
  label: string,
  members: readonly PropType[]
): ProfilePropSkillChoice {
  return { prop, label, members };
}

/**
 * Account setup records transferable prop skills, not every asset the renderer
 * can draw. Hoop size is the sole split because mini and large hoops require
 * meaningfully different technique. Everything else folds into one skill.
 */
export const PROFILE_PROP_FAMILIES: readonly ProfilePropFamily[] = [
  {
    representative: PropType.STAFF,
    label: "Staff",
    choices: [
      skill(PropType.STAFF, "Staff", [
        PropType.STAFF,
        PropType.SIMPLESTAFF,
        PropType.BIGSTAFF,
        PropType.STAFF2,
        PropType.CAPSULE_BATON,
        PropType.FIRE_DOUBLE_STAFF,
        PropType.STICK,
        PropType.PEN,
        PropType.ENERGY_STAFF,
      ]),
    ],
  },
  {
    representative: PropType.CLUB,
    label: "Club",
    choices: [
      skill(PropType.CLUB, "Club", [
        PropType.CLUB,
        PropType.CLASSIC_CLUB,
        PropType.TORCH,
        PropType.BIGCLUB,
        PropType.BIGTORCH,
      ]),
    ],
  },
  {
    representative: PropType.FAN,
    label: "Fan",
    choices: [skill(PropType.FAN, "Fan", [PropType.FAN, PropType.BIGFAN])],
  },
  {
    representative: PropType.BUUGENG,
    label: "Buugeng",
    choices: [
      skill(PropType.BUUGENG, "Buugeng", [
        PropType.BUUGENG,
        PropType.BIGBUUGENG,
      ]),
    ],
  },
  {
    representative: PropType.MINIHOOP,
    label: "Hoop",
    choices: [
      skill(PropType.MINIHOOP, "Mini Hoop", [PropType.MINIHOOP]),
      skill(PropType.BIGHOOP, "Big Hoop", [PropType.BIGHOOP]),
      skill(PropType.TRIANGLE, "Triangle", [PropType.TRIANGLE]),
    ],
  },
  {
    representative: PropType.TRIAD,
    label: "Triad",
    choices: [
      skill(PropType.TRIAD, "Triad", [
        PropType.TRIAD,
        PropType.BIGTRIAD,
        PropType.TRIGENG,
      ]),
    ],
  },
  {
    representative: PropType.TRIQUETRA,
    label: "Triquetra",
    choices: [
      skill(PropType.TRIQUETRA, "Triquetra", [
        PropType.TRIQUETRA,
        PropType.TRIQUETRA2,
      ]),
    ],
  },
  {
    representative: PropType.SWORD,
    label: "Sword",
    choices: [
      skill(PropType.SWORD, "Sword", [PropType.SWORD, PropType.ENERGY_SABER]),
    ],
  },
  {
    representative: PropType.DOUBLESTAR,
    label: "Double Star",
    choices: [
      skill(PropType.DOUBLESTAR, "Double Star", [
        PropType.DOUBLESTAR,
        PropType.BIGDOUBLESTAR,
      ]),
    ],
  },
  {
    representative: PropType.EIGHTRINGS,
    label: "Eight Rings",
    choices: [
      skill(PropType.EIGHTRINGS, "Eight Rings", [
        PropType.EIGHTRINGS,
        PropType.BIGEIGHTRINGS,
      ]),
    ],
  },
] as const;

const FAMILY_BY_REPRESENTATIVE = new Map(
  PROFILE_PROP_FAMILIES.map((family) => [family.representative, family])
);

const SKILL_BY_MEMBER = new Map<PropType, ProfilePropSkillChoice>();
const FAMILY_BY_MEMBER = new Map<PropType, ProfilePropFamily>();
for (const family of PROFILE_PROP_FAMILIES) {
  for (const choice of family.choices) {
    for (const member of choice.members) {
      SKILL_BY_MEMBER.set(member, choice);
      FAMILY_BY_MEMBER.set(member, family);
    }
  }
}

const CANONICAL_PROFILE_SKILLS = new Set(
  PROFILE_PROP_FAMILIES.flatMap((family) =>
    family.choices.map((choice) => choice.prop)
  )
);

// Props that no longer exist in the enum but may still sit in a saved profile.
// Sickles was inherited from the Sword render family and removed 2026-09-06; a
// profile carrying it should drop it on the next selection save rather than
// keep it as a legacy value.
const REMOVED_PROFILE_PROPS: ReadonlySet<string> = new Set(["sickles"]);

export function getProfilePropFamily(
  prop: PropType
): ProfilePropFamily | undefined {
  return FAMILY_BY_MEMBER.get(prop);
}

export function getProfilePropFamilyByRepresentative(
  representative: PropType
): ProfilePropFamily | undefined {
  return FAMILY_BY_REPRESENTATIVE.get(representative);
}

// The labels above stay English for code and tests. Screens show these: the
// prop names from the Settings catalog, plus the few words that differ here.
const FAMILY_LABEL_KEYS: Partial<Record<PropType, TranslationKey>> = {
  [PropType.STAFF]: "profile_prop_family_staff",
  [PropType.MINIHOOP]: "profile_prop_family_hoop",
};
const SKILL_LABEL_KEYS: Partial<Record<PropType, TranslationKey>> = {
  [PropType.STAFF]: "profile_prop_family_staff",
};
const SKILL_SHORT_KEYS: Partial<Record<PropType, TranslationKey>> = {
  [PropType.MINIHOOP]: "profile_prop_hoop_mini",
  [PropType.BIGHOOP]: "profile_prop_hoop_big",
};

function propNameKey(prop: PropType): TranslationKey {
  return `settings_prop_name_${prop}` as TranslationKey;
}

/** A family's name in the visitor's language ("Hoop", "Cerchio"). */
export function profileFamilyLabel(family: ProfilePropFamily): string {
  const rep = family.representative;
  return t(FAMILY_LABEL_KEYS[rep] ?? propNameKey(rep));
}

/** A skill's full name in the visitor's language ("Mini Hoop"). */
export function profileSkillLabel(choice: ProfilePropSkillChoice): string {
  return t(SKILL_LABEL_KEYS[choice.prop] ?? propNameKey(choice.prop));
}

/** A skill's name inside its family's size choice ("Mini", "Big", "Triangle"). */
export function profileSkillShortLabel(choice: ProfilePropSkillChoice): string {
  const key = SKILL_SHORT_KEYS[choice.prop];
  return key ? t(key) : profileSkillLabel(choice);
}

export function getProfilePropLabel(prop: PropType): string {
  const choice = SKILL_BY_MEMBER.get(prop);
  return choice ? profileSkillLabel(choice) : getPropTypeDisplayInfo(prop).label;
}

export function isProfilePropChoice(prop: PropType): boolean {
  return CANONICAL_PROFILE_SKILLS.has(prop);
}

export function normalizeProfileSkill(prop: PropType): PropType | null {
  return SKILL_BY_MEMBER.get(prop)?.prop ?? null;
}

export function uniqueProfileProps(props: readonly PropType[]): PropType[] {
  return props.filter((prop, index) => props.indexOf(prop) === index);
}

export function getLegacyProfileProps(props: readonly PropType[]): PropType[] {
  return uniqueProfileProps(props).filter(
    (prop) => !SKILL_BY_MEMBER.has(prop) && !REMOVED_PROFILE_PROPS.has(prop)
  );
}

export function normalizeProfileSkills(props: readonly PropType[]): PropType[] {
  return uniqueProfileProps(
    props
      .map(normalizeProfileSkill)
      .filter((prop): prop is PropType => prop !== null)
  );
}

/** Canonical skills plus safe opaque values from profiles created before setup. */
export function normalizeProfileSelection(
  props: readonly PropType[]
): PropType[] {
  return uniqueProfileProps([
    ...normalizeProfileSkills(props),
    ...getLegacyProfileProps(props),
  ]);
}

export function getSelectedFamilyChoices(
  props: readonly PropType[],
  family: ProfilePropFamily
): PropType[] {
  const selected = new Set(normalizeProfileSkills(props));
  return family.choices
    .map((choice) => choice.prop)
    .filter((prop) => selected.has(prop));
}

export function toggleProfileSkill(
  props: readonly PropType[],
  prop: PropType
): PropType[] {
  if (!isProfilePropChoice(prop)) return normalizeProfileSelection(props);
  const normalized = normalizeProfileSelection(props);
  return normalized.includes(prop)
    ? normalized.filter((selected) => selected !== prop)
    : [...normalized, prop];
}

export function removeProfileProp(
  props: readonly PropType[],
  prop: PropType
): PropType[] {
  return uniqueProfileProps(props.filter((selected) => selected !== prop));
}

export function profileFamilyRepresentative(prop: PropType): PropType {
  return getProfilePropFamily(prop)?.representative ?? prop;
}
