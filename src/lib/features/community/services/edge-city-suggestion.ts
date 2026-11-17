/**
 * The Cloudflare edge hint as a one-tap suggestion.
 *
 * The edge names a city on every request, for free, with no permission prompt.
 * That is the whole reason this feature can offer "Practicing in Chicago?"
 * instead of a dialog: the origin's own `Permissions-Policy` header disables
 * the Geolocation API, so there is no browser position to ask for.
 *
 * What the edge supplies and what gets written are deliberately different. The
 * hint carries IP-derived `lat`/`lng`, which are more precise than the stated
 * privacy model allows. They are read to name a city and never persisted; the
 * point on the map comes from a forward geocode of the city name, at the
 * moment someone actually chooses to join.
 */

import {
  CityResolutionError,
  type CanonicalCity,
  type CitySuggestion,
} from "../domain/canonical-city";
import { nameableCityFromEdge } from "../domain/city-canonicalization";
import type { Geocoder } from "./geocoding-service";

/** The subset of `page.data.geo` this path reads. */
export interface EdgeGeoHint {
  city?: string | null;
  /** ISO-2, or one of Cloudflare's non-country sentinels. */
  country?: string | null;
}

/**
 * A suggestion from the edge hint, or null when there is nothing to offer.
 *
 * Null is the normal case in local development, behind a VPN, behind a privacy
 * proxy, and whenever the edge reports a sentinel. It is not an error state —
 * the slot simply opens on the picker instead.
 */
export function createEdgeCitySuggestion(
  geo: EdgeGeoHint | null | undefined,
  geocoder: Geocoder,
): CitySuggestion | null {
  const nameable = nameableCityFromEdge(geo);
  if (!nameable) return null;

  return {
    id: "cloudflare-edge",
    city: nameable.city,
    region: nameable.country,
    async canonicalize(): Promise<CanonicalCity> {
      const result = await geocoder.forwardGeocodeCity(
        nameable.city,
        nameable.country,
      );

      if (result.status === "found") {
        return { ...nameable, coords: result.coords };
      }

      if (result.status === "not-found") {
        throw new CityResolutionError(
          "not-found",
          `${nameable.city} couldn't be placed on the map. Search for your city instead.`,
        );
      }

      throw new CityResolutionError(
        "failed",
        "The map service couldn't be reached. Try again.",
      );
    },
  };
}
