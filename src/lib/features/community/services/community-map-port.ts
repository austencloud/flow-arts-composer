/**
 * The narrow persistence seam the community-map state depends on.
 *
 * The state module is a `.svelte.ts` rune module; keeping `firebase/firestore`
 * out of it is what lets its ordering and rollback behavior be tested with
 * controlled promises instead of module mocks. The repository still owns
 * persistence — this adapter only converts a {@link CanonicalCity} into the
 * stored document shape and stamps the write time.
 */

import { Timestamp } from "firebase/firestore";
import type { CanonicalCity } from "../domain/canonical-city";
import type {
  OwnLocationResult,
  UserLocationWithProfile,
} from "../domain/models/user-location";
import { pinWriteFor } from "../domain/pin-write";
import {
  deleteLocation,
  getPublicLocations,
  readOwnListingFlags,
  readOwnLocation,
  saveLocation,
} from "./user-location-repository";

export type PinVisibility = "public" | "private";
import { createCachedLoad } from "./public-locations-cache";

// Module state, shared by every map on the page and kept until a full reload.
const publicLocations = createCachedLoad(() => getPublicLocations());

export interface CommunityMapPort {
  readOwnLocation(uid: string): Promise<OwnLocationResult>;
  listPublicLocations(): Promise<UserLocationWithProfile[]>;
  /**
   * Write the user's single location document. This is also how "change city"
   * works: same document, same call, different canonical input. There is no
   * separate update path to drift from this one.
   *
   * Resolves to the visibility it wrote: "private" when the person is hidden
   * from Creators or disabled (see {@link pinWriteFor}). A port that resolves
   * to nothing is treated as a public write.
   */
  saveCity(uid: string, city: CanonicalCity): Promise<PinVisibility | void>;
  removeCity(uid: string): Promise<void>;
}

export function createFirestoreCommunityMapPort(): CommunityMapPort {
  return {
    readOwnLocation,
    listPublicLocations: () => publicLocations.get(),
    saveCity: async (uid, city) => {
      // Read fresh at save time: the "Show me in Creators" switch can change
      // it at any moment, and the rules check the current value.
      const write = pinWriteFor(await readOwnListingFlags(uid));
      await withFreshPins(saveLocation(uid, {
        city: city.city,
        country: city.country,
        countryCode: city.countryCode,
        // City-center coordinates only. The Cloudflare `lat`/`lng` are
        // IP-derived and are never written, which is what makes the privacy
        // copy survive someone opening the document and checking.
        cityCenterCoordinates: { lat: city.coords.lat, lng: city.coords.lng },
        ...write,
        updatedAt: Timestamp.now(),
      }));
      return write.visibility;
    },
    removeCity: (uid) => withFreshPins(deleteLocation(uid)),
  };
}

/**
 * Read the pins again on the next map mount. For changes made elsewhere that
 * move a pin, such as the "Show me in Creators" switch.
 */
export function invalidatePublicLocations(): void {
  publicLocations.invalidate();
}

/** A city change makes the next map mount read the pins again. */
function withFreshPins(write: Promise<void>): Promise<void> {
  return write.finally(() => publicLocations.invalidate());
}
