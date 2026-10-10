import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPlacesCitySearch } from "#lib/features/community/services/places-city-search.js";
import { CityResolutionError } from "#lib/features/community/domain/canonical-city.js";
import type { IGoogleMapsLibraryLoader } from "#lib/shared/maps/services/contracts/IGoogleMapsLibraryLoader.js";

/**
 * Google's Places namespace, reduced to the four things this module touches.
 * The real one is loaded by script injection and cannot exist in a test
 * process, so it is installed on `globalThis` exactly as the loader would.
 */
const fetchSuggestions = vi.fn();
const fetchFields = vi.fn();
let tokensCreated = 0;

function place(id: string) {
  return { id, fetchFields };
}

function prediction(
  id: string,
  mainText: string,
  secondaryText: string | undefined,
) {
  return {
    placeId: id,
    text: { text: `${mainText}${secondaryText ? `, ${secondaryText}` : ""}` },
    mainText: { text: mainText },
    secondaryText: secondaryText ? { text: secondaryText } : undefined,
    types: ["locality"],
    toPlace: () => place(id),
  };
}

const CHICAGO_COMPONENTS = [
  { longText: "Chicago", shortText: "Chicago", types: ["locality"] },
  {
    longText: "United States",
    shortText: "US",
    types: ["country", "political"],
  },
];

function installPlaces(): void {
  (globalThis as Record<string, unknown>).google = {
    maps: {
      places: {
        AutocompleteSessionToken: class {
          constructor() {
            tokensCreated += 1;
          }
        },
        AutocompleteSuggestion: { fetchAutocompleteSuggestions: fetchSuggestions },
      },
    },
  };
}

const loader: IGoogleMapsLibraryLoader = {
  load: vi.fn(async () => {}),
  loadPlaces: vi.fn(async () => {
    installPlaces();
  }),
};

beforeEach(() => {
  vi.clearAllMocks();
  tokensCreated = 0;
  Reflect.deleteProperty(globalThis, "google");
  fetchSuggestions.mockResolvedValue({
    suggestions: [
      { placePrediction: prediction("chi", "Chicago", "IL, USA") },
      // A suggestion carrying no place prediction is a query prediction, not a
      // place. Rendering it would offer a city that cannot be resolved.
      { placePrediction: null },
    ],
  });
  fetchFields.mockResolvedValue({
    place: {
      id: "chi",
      addressComponents: CHICAGO_COMPONENTS,
      location: { lat: () => 41.8781, lng: () => -87.6298 },
    },
  });
});

describe("createPlacesCitySearch", () => {
  it("loads places on demand and asks for cities alone", async () => {
    const search = createPlacesCitySearch("key", loader);

    await search.search("chic");

    expect(loader.loadPlaces).toHaveBeenCalledWith("key");
    expect(loader.load).not.toHaveBeenCalled();
    const request = fetchSuggestions.mock.calls[0][0];
    // `(cities)` is a type COLLECTION; the request is rejected outright if it
    // is combined with any other type, so exactly one entry is correct.
    expect(request.includedPrimaryTypes).toEqual(["(cities)"]);
    expect(request.input).toBe("chic");
  });

  it("drops suggestions that carry no place prediction", async () => {
    const results = await createPlacesCitySearch("key", loader).search("chic");

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("chi");
    expect(results[0].city).toBe("Chicago");
    expect(results[0].region).toBe("IL, USA");
  });

  it("reuses one session token across keystrokes and retires it on selection", async () => {
    const search = createPlacesCitySearch("key", loader);

    const first = await search.search("chi");
    await search.search("chica");
    expect(tokensCreated).toBe(1);
    expect(fetchSuggestions.mock.calls[0][0].sessionToken).toBe(
      fetchSuggestions.mock.calls[1][0].sessionToken,
    );

    // The details call ends the session. Continuing to send the spent token
    // would bill the next search against a session that is already closed.
    await first[0].canonicalize();
    await search.search("den");
    expect(tokensCreated).toBe(2);
    expect(fetchSuggestions.mock.calls[2][0].sessionToken).not.toBe(
      fetchSuggestions.mock.calls[0][0].sessionToken,
    );
  });

  it("retires the session even when the details call fails", async () => {
    const search = createPlacesCitySearch("key", loader);
    const results = await search.search("chi");
    fetchFields.mockRejectedValueOnce(new Error("network"));

    const error = await results[0].canonicalize().catch((caught) => caught);
    expect(error).toBeInstanceOf(CityResolutionError);
    expect((error as CityResolutionError).reason).toBe("failed");

    await search.search("den");
    expect(tokensCreated).toBe(2);
  });

  it("requests only the two Essentials fields the city label needs", async () => {
    const search = createPlacesCitySearch("key", loader);
    const results = await search.search("chi");

    await results[0].canonicalize();

    // `displayName` is a Pro field and is deliberately not requested; the label
    // is built from the components instead.
    expect(fetchFields).toHaveBeenCalledWith({
      fields: ["addressComponents", "location"],
    });
  });

  it("canonicalizes a prediction into one writable city", async () => {
    const search = createPlacesCitySearch("key", loader);
    const results = await search.search("chi");

    await expect(results[0].canonicalize()).resolves.toEqual({
      city: "Chicago",
      country: "United States",
      countryCode: "US",
      coords: { lat: 41.8781, lng: -87.6298 },
    });
  });

  it("rejects a result that does not describe a city rather than writing one", async () => {
    // A county or a state would produce a marker reading "Illinois, United
    // States" on a state centroid. Rejecting sends the user back to pick again.
    fetchFields.mockResolvedValueOnce({
      place: {
        id: "il",
        addressComponents: [
          {
            longText: "Illinois",
            shortText: "IL",
            types: ["administrative_area_level_1", "political"],
          },
          { longText: "United States", shortText: "US", types: ["country"] },
        ],
        location: { lat: () => 40, lng: () => -89 },
      },
    });

    const search = createPlacesCitySearch("key", loader);
    const results = await search.search("illi");

    const error = await results[0].canonicalize().catch((caught) => caught);
    expect(error).toBeInstanceOf(CityResolutionError);
    expect((error as CityResolutionError).reason).toBe("rejected");
  });

  it("starts a fresh session after reset", async () => {
    const search = createPlacesCitySearch("key", loader);

    await search.search("chi");
    search.reset();
    await search.search("chi");

    expect(tokensCreated).toBe(2);
  });
});
