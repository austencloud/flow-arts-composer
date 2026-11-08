/**
 * User Location Models
 * For the global user map feature
 */

import type { Timestamp } from "firebase/firestore";

export interface UserLocation {
  userId: string;

  // City-level location (SAFE - no exact coordinates stored)
  city: string;
  /** Long display name, always written in English. See `canonical-city.ts`. */
  country: string;
  /**
   * ISO-3166-1 alpha-2. Additive and optional: documents written before this
   * field existed remain valid without it. `country` is what renders today;
   * this is what any future localization would render from.
   */
  countryCode?: string;

  // City center coordinates (for map display, NOT user's actual location)
  cityCenterCoordinates: {
    lat: number;
    lng: number;
  };

  visibility: "public" | "private";
  /**
   * Set on a private pin whose owner is hidden or disabled, by
   * syncMapPinVisibility or by a save made while hidden. The trigger makes
   * such a pin public again when the person is listed again.
   */
  hiddenByFlag?: boolean;
  updatedAt: Timestamp;
}

/**
 * User location with profile data for map markers
 */
export interface UserLocationWithProfile extends UserLocation {
  username: string;
  displayName: string;
  avatar?: string;
  sequenceCount: number;
}

/**
 * The result of reading the signed-in user's own location document.
 *
 * Absence and failure are separate cases because they drive different UI:
 * `absent` invites the user onto the map, `failed` must not, since offering
 * "add yourself" to someone already on the map is how a read error turns into
 * a duplicate write.
 */
export type OwnLocationResult =
  | { status: "found"; location: UserLocation }
  | { status: "absent" }
  | { status: "failed"; error: unknown };
