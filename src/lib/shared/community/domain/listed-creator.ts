/**
 * Who appears in Creators, and who can be opened.
 *
 * The one place these decisions live; the roster, search, map, batch fetches and
 * follower lists all ask here. Two flags with different owners:
 *
 * - `isHidden` is the person's own choice ("Show me in Creators" off). Out of
 *   every list, but their profile still opens so a credit on a sequence works.
 * - `isDisabled` is moderation by an admin. Out of every list, and the profile
 *   does not open for anyone but an admin.
 *
 * Admins see everyone. Guests are not creators, so they are out for admins too.
 */

import { LEGACY_HIDDEN_HANDLES } from "./legacy-hidden-handles";

// Moderated before `isHidden` existed; these people have no flag set. Only two
// resolved to real docs when checked against production on 2026-07-25.
// TEMPORARY: scripts/creators/hide-legacy-accounts.mjs --apply sets isHidden on
// them. Take this set and its check below out once that has run in production.
const HIDDEN_USERNAMES = new Set(LEGACY_HIDDEN_HANDLES);

export interface CreatorFlags {
  username?: string | null;
  displayName?: string | null;
  isAnonymous?: boolean | null;
  isHidden?: boolean | null;
  isDisabled?: boolean | null;
}

export interface ListingViewer {
  viewerIsAdmin: boolean;
}

/**
 * The `displayName` check catches legacy guest docs that predate the
 * `isAnonymous` flag. Safe because a full account always gets a real name on
 * upgrade.
 */
export function isAnonymousGuest(
  data: Pick<CreatorFlags, "isAnonymous" | "displayName">
): boolean {
  return data.isAnonymous === true || data.displayName === "Anonymous User";
}

export type CreatorListingStatus = "hidden" | "disabled";

/** The label an admin sees on someone others cannot find. */
export function creatorListingStatus(
  data: CreatorFlags
): CreatorListingStatus | null {
  if (data.isDisabled === true) return "disabled";
  if (data.isHidden === true) return "hidden";
  if (data.username && HIDDEN_USERNAMES.has(data.username.toLowerCase())) {
    return "hidden";
  }
  return null;
}

export function isListedCreator(
  data: CreatorFlags,
  viewer: ListingViewer
): boolean {
  if (isAnonymousGuest(data)) return false;
  if (viewer.viewerIsAdmin) return true;
  return creatorListingStatus(data) === null;
}

/** Whether a direct link shows this profile. Otherwise it reads as not found. */
export function canOpenProfile(
  data: CreatorFlags,
  viewer: ListingViewer & { isSelf: boolean }
): boolean {
  if (viewer.viewerIsAdmin) return true;
  if (data.isDisabled === true) return false;
  return viewer.isSelf || !isAnonymousGuest(data);
}

/**
 * Whether a piece of work may credit this person by name in discovery. A hidden
 * person's work stays credited; their choice was about the directory.
 */
export function canCreditCreator(data: CreatorFlags): boolean {
  return data.isDisabled !== true && !isAnonymousGuest(data);
}
