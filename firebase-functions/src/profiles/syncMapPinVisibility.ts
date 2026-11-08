/**
 * Hidden or disabled people come off the public map.
 *
 * `isHidden` (the person's "Show me in Creators" switch) and `isDisabled`
 * (an admin's moderation) take someone out of every list. The map's public
 * query reads `userLocations` where visibility == "public", and those docs are
 * world-readable, so a flag on the profile alone left the pin's city public.
 *
 * When a profile becomes unlisted, a public pin turns private and is marked
 * `hiddenByFlag: true`. When both flags are off again, a pin this trigger made
 * private turns public and the mark is cleared. A pin the person made private
 * themselves is never marked, so it is never made public here. The rules let
 * only the server set `hiddenByFlag`, and refuse a public pin while the
 * profile is unlisted.
 */

import * as admin from "firebase-admin";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

interface ProfileFlags {
  isHidden?: unknown;
  isDisabled?: unknown;
}

interface PinState {
  visibility?: unknown;
  hiddenByFlag?: unknown;
}

export type PinChange =
  | { visibility: "private"; hiddenByFlag: true }
  | { visibility: "public"; hiddenByFlag: "delete" };

function isUnlisted(profile: ProfileFlags | null | undefined): boolean {
  return profile?.isHidden === true || profile?.isDisabled === true;
}

/** Whether this profile write changes whether the person is listed. */
export function listingChanged(
  before: ProfileFlags | null | undefined,
  after: ProfileFlags | null | undefined
): boolean {
  // A deleted profile is the account-deletion trigger's business.
  if (!after) return false;
  return isUnlisted(before) !== isUnlisted(after);
}

/** What to write to the pin for this profile state, or null for nothing. */
export function pinChangeFor(
  profile: ProfileFlags,
  pin: PinState | null | undefined
): PinChange | null {
  if (!pin) return null;
  if (isUnlisted(profile)) {
    return pin.visibility === "public"
      ? { visibility: "private", hiddenByFlag: true }
      : null;
  }
  return pin.hiddenByFlag === true
    ? { visibility: "public", hiddenByFlag: "delete" }
    : null;
}

export const syncMapPinVisibility = onDocumentWritten(
  { document: "users/{uid}", retry: true },
  async (event) => {
    const before = event.data?.before.data() as ProfileFlags | undefined;
    const after = event.data?.after.data() as ProfileFlags | undefined;
    // Most profile writes leave the flags alone; those cost no read.
    if (!after || !listingChanged(before, after)) return;

    const db = admin.firestore();
    const pinRef = db.doc(`userLocations/${event.params.uid}`);
    await db.runTransaction(async (tx) => {
      const pin = await tx.get(pinRef);
      if (!pin.exists) return;
      // Decide from the profile as it is now, not as the event saw it, so a
      // late retry never undoes a newer change.
      const profile = await tx.get(db.doc(`users/${event.params.uid}`));
      if (!profile.exists) return;
      const change = pinChangeFor(profile.data() as ProfileFlags, pin.data());
      if (!change) return;
      tx.update(pinRef, {
        visibility: change.visibility,
        hiddenByFlag:
          change.hiddenByFlag === "delete"
            ? admin.firestore.FieldValue.delete()
            : true,
      });
    });
  }
);
