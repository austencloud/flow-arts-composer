export const PUBLIC_PROFILE_VERSION = 2;

/**
 * A guest's profile. Readable by direct id, like any public profile, but the
 * directory query and the list rule ask for PUBLIC_PROFILE_VERSION, so guests
 * never take a place in the Creators roster. Upgrading to a full account sets
 * PUBLIC_PROFILE_VERSION in the same write that clears isAnonymous.
 */
export const GUEST_PROFILE_VERSION = 0;

/** The version a profile write should carry for this kind of account. */
export function profileVersionFor(isAnonymous: boolean): number {
  return isAnonymous ? GUEST_PROFILE_VERSION : PUBLIC_PROFILE_VERSION;
}

export const PUBLIC_PROFILE_FIELDS = new Set([
  "publicProfileVersion",
  "displayName",
  "name",
  "username",
  "usernameLowercase",
  "photoURL",
  "avatar",
  "createdAt",
  "updatedAt",
  "lastActivityDate",
  "isAnonymous",
  "bio",
  "instagramUsername",
  "pronouns",
  "profileColor",
  "propsISpinWith",
  "favoriteProp",
  "favoriteCatdog",
  "activeProp",
  "pinnedItems",
  "favoriteConfig",
  "sequenceCount",
  "collectionCount",
  "followerCount",
  "followingCount",
  "totalXP",
  "currentLevel",
  "achievementCount",
  "currentStreak",
  "longestStreak",
  "role",
  "isAdmin",
  "isDisabled",
  "isHidden",
  "isFeatured",
]);

export const OWNER_PRIVATE_PROFILE_FIELDS = new Set([
  "email",
  "lastLocation",
  "ageVerifiedAt",
  "attribution",
  "googleId",
  "googlePhotoURL",
  "facebookId",
]);

export const ADMIN_PRIVATE_PROFILE_FIELDS = new Set([
  "adminLabel",
  "adminNotes",
  "isTestAccount",
  "testAccountPurpose",
]);

export const NOTIFICATION_PREFERENCE_FIELDS = new Set([
  "notificationPreferences",
]);
export const FEATURE_OVERRIDE_FIELDS = new Set(["featureOverrides"]);
export const MODERATION_STATUS_FIELDS = new Set([
  "hasActiveWarning",
  "lastWarningAt",
  "lastWarningReportId",
]);

export function unknownPublicProfileFields(fields: Iterable<string>): string[] {
  return [...fields].filter(
    (field) =>
      !PUBLIC_PROFILE_FIELDS.has(field) &&
      !OWNER_PRIVATE_PROFILE_FIELDS.has(field) &&
      !ADMIN_PRIVATE_PROFILE_FIELDS.has(field) &&
      !NOTIFICATION_PREFERENCE_FIELDS.has(field) &&
      !FEATURE_OVERRIDE_FIELDS.has(field) &&
      !MODERATION_STATUS_FIELDS.has(field)
  );
}
