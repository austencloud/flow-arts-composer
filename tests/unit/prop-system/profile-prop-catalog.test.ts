import { describe, expect, it } from "vitest";

import {
  PROFILE_PROP_FAMILIES,
  getLegacyProfileProps,
  getProfilePropFamily,
  normalizeProfileSelection,
  normalizeProfileSkill,
  normalizeProfileSkills,
  toggleProfileSkill,
} from "$lib/shared/community/domain/profile-prop-catalog";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

// Persisted profiles outlive the enum: one saved while Sickles existed still
// carries "sickles" after its 2026-09-06 removal, and must still be purged.
const REMOVED_SICKLES = "sickles" as PropType;

describe("profile prop catalog", () => {
  it("folds club and torch assets into one Club skill", () => {
    const club = getProfilePropFamily(PropType.TORCH);

    expect(club?.representative).toBe(PropType.CLUB);
    expect(club?.choices).toHaveLength(1);
    expect(normalizeProfileSkill(PropType.TORCH)).toBe(PropType.CLUB);
    expect(normalizeProfileSkill(PropType.BIGTORCH)).toBe(PropType.CLUB);
    expect(
      PROFILE_PROP_FAMILIES.map((family) => family.representative)
    ).not.toContain(PropType.TORCH);
  });

  it("folds cosmetic assets into transferable skills", () => {
    expect(normalizeProfileSkill(PropType.CAPSULE_BATON)).toBe(PropType.STAFF);
    expect(normalizeProfileSkill(PropType.BIGFAN)).toBe(PropType.FAN);
    expect(normalizeProfileSkill(PropType.BIGBUUGENG)).toBe(PropType.BUUGENG);
    expect(normalizeProfileSkill(PropType.TRIGENG)).toBe(PropType.TRIAD);
    expect(normalizeProfileSkill(PropType.BIGTRIAD)).toBe(PropType.TRIAD);
    expect(normalizeProfileSkill(PropType.TRIQUETRA2)).toBe(PropType.TRIQUETRA);
    expect(normalizeProfileSkill(PropType.ENERGY_SABER)).toBe(PropType.SWORD);
    expect(normalizeProfileSkill(PropType.BIGDOUBLESTAR)).toBe(
      PropType.DOUBLESTAR
    );
    expect(normalizeProfileSkill(PropType.BIGEIGHTRINGS)).toBe(
      PropType.EIGHTRINGS
    );
  });

  it("keeps mini hoop, big hoop and triangle as different skills", () => {
    const hoop = getProfilePropFamily(PropType.MINIHOOP);

    expect(hoop?.choices.map((choice) => choice.prop)).toEqual([
      PropType.MINIHOOP,
      PropType.BIGHOOP,
      PropType.TRIANGLE,
    ]);
    expect(
      normalizeProfileSkills([
        PropType.MINIHOOP,
        PropType.BIGHOOP,
        PropType.TRIANGLE,
      ])
    ).toEqual([PropType.MINIHOOP, PropType.BIGHOOP, PropType.TRIANGLE]);
  });

  it("does not offer rendering novelties as ordinary setup families", () => {
    const representatives = PROFILE_PROP_FAMILIES.map(
      (family) => family.representative
    );

    expect(representatives).not.toContain(PropType.CHICKEN);
    expect(representatives).not.toContain(PropType.GUITAR);
    expect(representatives).not.toContain(PropType.HAND);
    expect(representatives).not.toContain(REMOVED_SICKLES);
    expect(normalizeProfileSkill(REMOVED_SICKLES)).toBeNull();
  });

  it("preserves unsupported saved props as legacy values", () => {
    expect(
      getLegacyProfileProps([PropType.STAFF, PropType.CHICKEN, PropType.GUITAR])
    ).toEqual([PropType.CHICKEN, PropType.GUITAR]);
  });

  it("rewrites old saved assets without erasing safe legacy values", () => {
    expect(
      normalizeProfileSelection([
        PropType.BIGSTAFF,
        PropType.TORCH,
        PropType.BIGTRIAD,
        REMOVED_SICKLES,
        PropType.CHICKEN,
      ])
    ).toEqual([
      PropType.STAFF,
      PropType.CLUB,
      PropType.TRIAD,
      PropType.CHICKEN,
    ]);
  });

  it("toggles the canonical Club skill once", () => {
    const withoutClub = toggleProfileSkill(
      [PropType.CLUB, PropType.TORCH],
      PropType.CLUB
    );
    expect(withoutClub).toEqual([]);

    expect(toggleProfileSkill(withoutClub, PropType.CLUB)).toEqual([
      PropType.CLUB,
    ]);
  });
});
