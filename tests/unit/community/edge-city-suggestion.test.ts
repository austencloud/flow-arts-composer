import { describe, expect, it, vi } from "vitest";

import { createEdgeCitySuggestion } from "#lib/features/community/services/edge-city-suggestion.js";
import { CityResolutionError } from "#lib/features/community/domain/canonical-city.js";
import type {
  ForwardGeocodeResult,
  Geocoder,
} from "#lib/features/community/services/geocoding-service.js";

function geocoder(result: ForwardGeocodeResult): Geocoder {
  return {
    forwardGeocodeCity: vi.fn(async () => result),
  } as unknown as Geocoder;
}

const FOUND: ForwardGeocodeResult = {
  status: "found",
  coords: { lat: 41.8781, lng: -87.6298 },
};

describe("createEdgeCitySuggestion", () => {
  it("offers the edge city with its country as the secondary label", () => {
    const suggestion = createEdgeCitySuggestion(
      { city: "Chicago", country: "US" },
      geocoder(FOUND),
    );

    expect(suggestion).not.toBeNull();
    expect(suggestion?.city).toBe("Chicago");
    expect(suggestion?.region).toBe("United States");
    // One suggestion, one constant id: the edge never offers a list.
    expect(suggestion?.id).toBe("cloudflare-edge");
  });

  it.each([
    ["no geo at all", null],
    ["country only", { city: null, country: "US" }],
    ["the XX sentinel, which Intl echoes instead of throwing", {
      city: "Chicago",
      country: "XX",
    }],
    ["the T1 sentinel, which Intl throws on", { city: "Chicago", country: "T1" }],
    ["a country code that is not ISO-2", { city: "Chicago", country: "USA" }],
  ])("offers nothing for %s", (_label, geo) => {
    expect(
      createEdgeCitySuggestion(
        geo as { city?: string | null; country?: string | null } | null,
        geocoder(FOUND),
      ),
    ).toBeNull();
  });

  it("writes geocoded city-center coordinates, never the edge's own", async () => {
    // The hint carries IP-derived lat/lng. They are read to name a city and
    // must never reach the document — that is the claim the privacy copy makes.
    const service = geocoder(FOUND);
    const suggestion = createEdgeCitySuggestion(
      { city: "Chicago", country: "US" },
      service,
    );

    const canonical = await suggestion!.canonicalize();

    expect(canonical).toEqual({
      city: "Chicago",
      country: "United States",
      countryCode: "US",
      coords: { lat: 41.8781, lng: -87.6298 },
    });
    expect(service.forwardGeocodeCity).toHaveBeenCalledWith(
      "Chicago",
      "United States",
    );
  });

  it("tells the user to search when the geocoder finds nothing", async () => {
    const suggestion = createEdgeCitySuggestion(
      { city: "Nowhereville", country: "US" },
      geocoder({ status: "not-found" }),
    );

    const error = await suggestion!.canonicalize().catch((caught) => caught);

    expect(error).toBeInstanceOf(CityResolutionError);
    expect((error as CityResolutionError).reason).toBe("not-found");
    expect((error as CityResolutionError).message).toContain("Nowhereville");
  });

  it("does not claim the city is unknown when the request never completed", async () => {
    // Telling someone their city does not exist because a request timed out is
    // the wrong message, and it sends them off editing a query that was never
    // the problem.
    const suggestion = createEdgeCitySuggestion(
      { city: "Chicago", country: "US" },
      geocoder({ status: "failed", error: new Error("offline") }),
    );

    const error = await suggestion!.canonicalize().catch((caught) => caught);

    expect(error).toBeInstanceOf(CityResolutionError);
    expect((error as CityResolutionError).reason).toBe("failed");
    expect((error as CityResolutionError).message).not.toContain("Chicago");
  });
});
