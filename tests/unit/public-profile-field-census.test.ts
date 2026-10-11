import { describe, expect, it } from "vitest";
import {
  ADMIN_PRIVATE_PROFILE_FIELDS,
  FEATURE_OVERRIDE_FIELDS,
  MODERATION_STATUS_FIELDS,
  NOTIFICATION_PREFERENCE_FIELDS,
  OWNER_PRIVATE_PROFILE_FIELDS,
  PUBLIC_PROFILE_FIELDS,
  unknownPublicProfileFields,
} from "#lib/shared/community/domain/models/public-profile-contract.js";

// Read-only production census, 2026-07-31: 44 distinct root keys across 78
// profiles. Values and user IDs were deliberately not collected.
const OBSERVED_ROOT_FIELDS = [
  "achievementCount", "activeProp", "adminLabel", "adminNotes", "ageVerifiedAt",
  "attribution", "avatar", "collectionCount", "createdAt", "currentLevel",
  "currentStreak", "displayName", "email", "facebookId", "favoriteCatdog",
  "favoriteConfig", "favoriteProp", "featureOverrides", "followerCount",
  "followingCount", "googleId", "googlePhotoURL", "hasActiveWarning",
  "instagramUsername", "isAdmin", "isAnonymous", "isTestAccount",
  "lastActivityDate", "lastLocation", "lastWarningAt", "lastWarningReportId",
  "longestStreak", "notificationPreferences", "photoURL", "profileColor",
  "pronouns", "propsISpinWith", "role", "sequenceCount", "testAccountPurpose",
  "totalXP", "updatedAt", "username", "usernameLowercase",
];

describe("production public-profile field census", () => {
  it("classifies every observed root key into exactly one destination", () => {
    const destinations = [
      PUBLIC_PROFILE_FIELDS,
      OWNER_PRIVATE_PROFILE_FIELDS,
      ADMIN_PRIVATE_PROFILE_FIELDS,
      NOTIFICATION_PREFERENCE_FIELDS,
      FEATURE_OVERRIDE_FIELDS,
      MODERATION_STATUS_FIELDS,
    ];
    for (const field of OBSERVED_ROOT_FIELDS) {
      expect(destinations.filter((fields) => fields.has(field))).toHaveLength(1);
    }
    expect(unknownPublicProfileFields(OBSERVED_ROOT_FIELDS)).toEqual([]);
  });

  it("leaves a future unclassified field unresolved and therefore unmarked", () => {
    expect(unknownPublicProfileFields(["futureSecret"])).toEqual([
      "futureSecret",
    ]);
  });
});
