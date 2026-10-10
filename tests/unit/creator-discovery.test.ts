import { describe, expect, it } from "vitest";
import { matchesCreatorQuery } from "#lib/features/creators/domain/creator-search.js";
import { pickCreatorSamplesByOwnerId } from "#lib/features/browse/gallery-home/pick-representatives.js";
import type { EnhancedUserProfile } from "#lib/shared/community/domain/models/enhanced-user-profile.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { getEffectiveProp } from "#lib/shared/community/domain/get-effective-prop.js";

function creator(
  patch: Partial<EnhancedUserProfile> = {}
): EnhancedUserProfile {
  return {
    id: "creator-1",
    username: "cloud",
    displayName: "Austen Cloud",
    sequenceCount: 2,
    collectionCount: 0,
    followerCount: 5,
    followingCount: 1,
    joinedDate: new Date("2026-01-01"),
    isFeatured: false,
    favoriteProp: PropType.STAFF,
    location: {
      city: "Chicago",
      country: "US",
      lat: null,
      lng: null,
    },
    bio: "Builds musical toss patterns",
    ...patch,
  };
}

function sequence(
  id: string,
  ownerId: string | undefined,
  word: string
): SequenceData {
  return {
    id,
    name: word,
    word,
    steps: [],
    thumbnails: [],
    isFavorite: false,
    isCircular: false,
    tags: [],
    metadata: {},
    ownerId,
  };
}

describe("creator discovery", () => {
  it("uses a deliberate Profile prop before all other prop identity", () => {
    expect(
      getEffectiveProp(
        creator({
          favoriteProp: PropType.FAN,
          propsISpinWith: [PropType.STAFF],
          activeProp: PropType.CLUB,
        })
      )
    ).toBe(PropType.FAN);
  });

  it("shows legacy render variants as their profile skill", () => {
    expect(
      getEffectiveProp(
        creator({
          favoriteProp: PropType.TORCH,
          propsISpinWith: [PropType.TORCH],
        })
      )
    ).toBe(PropType.CLUB);

    expect(
      getEffectiveProp(
        creator({
          favoriteProp: PropType.ENERGY_SABER,
          propsISpinWith: [PropType.ENERGY_SABER],
        })
      )
    ).toBe(PropType.SWORD);
  });

  it("uses the only selected prop without forcing a separate favorite", () => {
    expect(
      getEffectiveProp(
        creator({
          favoriteProp: null,
          propsISpinWith: [PropType.STAFF],
          activeProp: PropType.CLUB,
        })
      )
    ).toBe(PropType.STAFF);
  });

  it("does not invent a single identity for a multi-prop creator", () => {
    expect(
      getEffectiveProp(
        creator({
          favoriteProp: null,
          propsISpinWith: [PropType.STAFF, PropType.FAN],
          activeProp: PropType.CLUB,
        })
      )
    ).toBeNull();
  });

  it("keeps activeProp as a fallback for legacy profiles", () => {
    expect(
      getEffectiveProp(
        creator({
          favoriteProp: null,
          propsISpinWith: undefined,
          activeProp: PropType.CLUB,
        })
      )
    ).toBe(PropType.CLUB);
  });

  it("searches the same profile details shown on creator cards", () => {
    const profile = creator();

    expect(matchesCreatorQuery(profile, "austen")).toBe(true);
    expect(matchesCreatorQuery(profile, "musical patterns")).toBe(true);
    // Multi-term still spans fields — prop label plus bio.
    expect(matchesCreatorQuery(profile, "staff musical")).toBe(true);
    expect(matchesCreatorQuery(profile, "poi")).toBe(false);
  });

  // Location was IP-derived and left the public profile in the v2 migration
  // (fe7e5ce604): dropped from EnhancedUserProfile, from the profile hero, and
  // from creator search in one commit. This asserts the privacy behavior so a
  // future change cannot quietly make city searchable again. The old
  // "staff chicago" case above outlived the field it depended on.
  it("does not search retired IP-derived location", () => {
    const profile = creator();

    expect(matchesCreatorQuery(profile, "chicago")).toBe(false);
    expect(matchesCreatorQuery(profile, "staff chicago")).toBe(false);
  });

  it("joins sample work by stable owner ID and caps each creator", () => {
    const samples = pickCreatorSamplesByOwnerId(
      [
        sequence("3", "creator-1", "C"),
        sequence("1", "creator-1", "A"),
        sequence("2", "creator-1", "B"),
        sequence("4", "creator-2", "D"),
        sequence("missing-owner", undefined, "E"),
      ],
      2
    );

    expect(samples.get("creator-1")?.map((item) => item.word)).toEqual([
      "A",
      "B",
    ]);
    expect(samples.get("creator-2")?.map((item) => item.word)).toEqual(["D"]);
    expect(samples.has("")).toBe(false);
  });
});
