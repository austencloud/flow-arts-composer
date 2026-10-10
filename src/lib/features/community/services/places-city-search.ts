/**
 * Places as a data source, not as a widget.
 *
 * `AutocompleteSuggestion.fetchAutocompleteSuggestions()` returns predictions
 * as plain data, which the picker renders with TKA's own markup. The widget
 * alternative injects a Google-owned custom element into a themed, font-ramped
 * panel: no supported theming surface, contrast and focus rings that cannot be
 * proven, a touch-target floor that cannot be verified by inspecting the Svelte
 * subtree, and a prediction overlay whose geometry can escape the panel or be
 * clipped by its `overflow: hidden`. None of that applies to markup this app
 * owns.
 *
 * Session tokens group a session's keystrokes with its terminating details call
 * for billing. One token is created on the first search, sent with every
 * request, and dropped as soon as a selection issues its details call — the
 * session is over at that point, and reusing the token would silently bill the
 * next search against a closed one.
 */

import { getGoogleMapsLibraryLoader } from "#lib/shared/maps/getGoogleMapsLibraryLoader.js";
import type { IGoogleMapsLibraryLoader } from "#lib/shared/maps/services/contracts/IGoogleMapsLibraryLoader.js";
import {
  CityResolutionError,
  type CanonicalCity,
  type CitySuggestion,
} from "../domain/canonical-city";
import {
  canonicalCityFromPlace,
  describeRejection,
} from "../domain/city-canonicalization";

/**
 * `(cities)` is a type COLLECTION. It maps to `locality` and
 * `administrative_area_level_3`, and the request is rejected outright if it is
 * combined with any other type — so this array has exactly one entry, and that
 * is not an oversight.
 */
const CITY_TYPES = ["(cities)"];

/**
 * Both fields are Place Details Essentials. `displayName` is Pro and is
 * deliberately not requested; the city label is built from the components.
 */
const DETAIL_FIELDS = ["addressComponents", "location"];

export interface CitySearch {
  /** Predictions for a query. Rejects if Places cannot be reached. */
  search(query: string): Promise<CitySuggestion[]>;
  /** Ends the billing session. Call when the picker closes or unmounts. */
  reset(): void;
}

export function createPlacesCitySearch(
  apiKey: string,
  loader: IGoogleMapsLibraryLoader = getGoogleMapsLibraryLoader(),
): CitySearch {
  let token: google.maps.places.AutocompleteSessionToken | null = null;

  function endSession(): void {
    token = null;
  }

  function toSuggestion(
    prediction: google.maps.places.PlacePrediction,
  ): CitySuggestion {
    return {
      id: prediction.placeId,
      // `mainText` is the city on its own; `text` is the whole prediction
      // string. The fallback matters for predictions that arrive without the
      // split, where showing the full string beats showing nothing.
      city: prediction.mainText?.text ?? prediction.text.text,
      region: prediction.secondaryText?.text ?? "",

      async canonicalize(): Promise<CanonicalCity> {
        const place = prediction.toPlace();
        let resolved: google.maps.places.Place;
        try {
          const response = await place.fetchFields({ fields: DETAIL_FIELDS });
          resolved = response.place;
        } catch (error) {
          // The details call was issued, so the session is spent either way.
          endSession();
          throw new CityResolutionError(
            "failed",
            "We couldn't reach the map service. Try again.",
          );
        }
        endSession();

        const result = canonicalCityFromPlace(resolved);
        if (result.status === "rejected") {
          throw new CityResolutionError(
            "rejected",
            describeRejection(result.reason),
          );
        }
        return result.city;
      },
    };
  }

  return {
    async search(query: string): Promise<CitySuggestion[]> {
      await loader.loadPlaces(apiKey);
      token ??= new google.maps.places.AutocompleteSessionToken();

      const { suggestions } =
        await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(
          {
            input: query,
            includedPrimaryTypes: CITY_TYPES,
            sessionToken: token,
          },
        );

      const predictions: google.maps.places.PlacePrediction[] = [];
      for (const suggestion of suggestions) {
        if (suggestion.placePrediction) predictions.push(suggestion.placePrediction);
      }
      return predictions.map(toSuggestion);
    },

    reset: endSession,
  };
}
