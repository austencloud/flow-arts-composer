import { describe, it, expect } from "vitest";
import {
  canonicalCityFromPlace,
  cityLabelFromComponents,
  countryNameFromCode,
  describeRejection,
  nameableCityFromEdge,
  type PlaceAddressComponent,
} from "#lib/features/community/domain/city-canonicalization.js";

function component(
  types: string[],
  longText: string,
  shortText = longText,
): PlaceAddressComponent {
  return { types, longText, shortText };
}

const US = component(["country", "political"], "United States", "US");
const COORDS = { lat: 41.8781, lng: -87.6298 };

describe("country names", () => {
  it("resolves ISO-2 to a long English name", () => {
    expect(countryNameFromCode("US")).toBe("United States");
    expect(countryNameFromCode("GB")).toBe("United Kingdom");
    expect(countryNameFromCode("JP")).toBe("Japan");
  });

  it("normalizes case and surrounding space", () => {
    expect(countryNameFromCode(" us ")).toBe("United States");
  });

  it("pins the locale so the stored name does not follow the viewer", () => {
    // The pin is what this asserts, and it has to be asserted by contrast:
    // running the suite under an English process locale makes an unpinned
    // lookup return the same answer, so the bug would be invisible. Comparing
    // against an explicitly non-English lookup shows the value that WOULD have
    // been persisted for a German viewer if the locale were left to resolve.
    const german = new Intl.DisplayNames(["de"], { type: "region" }).of("US");
    expect(german).not.toBe("United States");
    expect(countryNameFromCode("US")).toBe("United States");
  });

  it("rejects the Cloudflare sentinels", () => {
    // XX is the dangerous one: Intl echoes it back instead of throwing, so an
    // unguarded call writes the literal string "XX" as a country name.
    expect(new Intl.DisplayNames(["en"], { type: "region" }).of("XX")).toBe(
      "XX",
    );
    expect(countryNameFromCode("XX")).toBeNull();
    expect(countryNameFromCode("T1")).toBeNull();
  });

  it("rejects anything that is not ISO-2", () => {
    expect(countryNameFromCode("USA")).toBeNull();
    expect(countryNameFromCode("")).toBeNull();
    expect(countryNameFromCode("1")).toBeNull();
    expect(countryNameFromCode("419")).toBeNull();
  });
});

describe("city labels", () => {
  it("prefers locality", () => {
    const label = cityLabelFromComponents([
      component(["locality", "political"], "Chicago"),
      component(["administrative_area_level_3"], "Lake Township"),
      US,
    ]);
    expect(label).toBe("Chicago");
  });

  it("falls back to postal_town for the UK", () => {
    const label = cityLabelFromComponents([
      component(["postal_town"], "Brighton"),
      component(["administrative_area_level_2"], "Brighton and Hove"),
      component(["country"], "United Kingdom", "GB"),
    ]);
    expect(label).toBe("Brighton");
  });

  it("accepts administrative_area_level_3", () => {
    const label = cityLabelFromComponents([
      component(["administrative_area_level_3"], "Mestre"),
      component(["country"], "Italy", "IT"),
    ]);
    expect(label).toBe("Mestre");
  });

  it("does not fall through to a county or a state", () => {
    // The list stops at level 3 on purpose. A (cities) result that carries
    // none of the three did not describe a city, and writing "Illinois" into a
    // field named city produces a marker on a state centroid that nobody ever
    // notices is wrong.
    const label = cityLabelFromComponents([
      component(["administrative_area_level_2"], "Cook County"),
      component(["administrative_area_level_1"], "Illinois", "IL"),
      US,
    ]);
    expect(label).toBeNull();
  });

  it("ignores a component whose text is blank", () => {
    const label = cityLabelFromComponents([
      component(["locality"], "   "),
      component(["postal_town"], "Reading"),
      US,
    ]);
    expect(label).toBe("Reading");
  });
});

describe("canonicalCityFromPlace", () => {
  it("produces both the long country name and the ISO-2 code", () => {
    const result = canonicalCityFromPlace({
      addressComponents: [component(["locality"], "Chicago"), US],
      location: COORDS,
    });

    expect(result).toEqual({
      status: "ok",
      city: {
        city: "Chicago",
        country: "United States",
        countryCode: "US",
        coords: COORDS,
      },
    });
  });

  it("reads a LatLng with accessor methods", () => {
    // The live SDK returns a LatLng, not a plain object.
    const result = canonicalCityFromPlace({
      addressComponents: [component(["locality"], "Chicago"), US],
      location: { lat: () => COORDS.lat, lng: () => COORDS.lng },
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.city.coords).toEqual(COORDS);
  });

  it("rejects a result with no city component", () => {
    const result = canonicalCityFromPlace({
      addressComponents: [
        component(["administrative_area_level_1"], "Illinois", "IL"),
        US,
      ],
      location: COORDS,
    });
    expect(result).toEqual({ status: "rejected", reason: "not-a-city" });
  });

  it("rejects a result with no country", () => {
    const result = canonicalCityFromPlace({
      addressComponents: [component(["locality"], "Chicago")],
      location: COORDS,
    });
    expect(result).toEqual({ status: "rejected", reason: "no-country" });
  });

  it("rejects a country code that resolves to nothing", () => {
    const result = canonicalCityFromPlace({
      addressComponents: [
        component(["locality"], "Somewhere"),
        component(["country"], "Unknown", "XX"),
      ],
      location: COORDS,
    });
    expect(result).toEqual({ status: "rejected", reason: "unknown-country" });
  });

  it("rejects a result with no usable coordinates", () => {
    const missing = canonicalCityFromPlace({
      addressComponents: [component(["locality"], "Chicago"), US],
      location: null,
    });
    expect(missing).toEqual({ status: "rejected", reason: "no-coordinates" });

    const unusable = canonicalCityFromPlace({
      addressComponents: [component(["locality"], "Chicago"), US],
      location: { lat: Number.NaN, lng: 0 },
    });
    expect(unusable).toEqual({ status: "rejected", reason: "no-coordinates" });
  });

  it("rejects an empty result rather than writing blanks", () => {
    expect(canonicalCityFromPlace({})).toEqual({
      status: "rejected",
      reason: "not-a-city",
    });
  });

  it("has a message for every rejection", () => {
    const reasons = [
      "not-a-city",
      "no-country",
      "unknown-country",
      "no-coordinates",
    ] as const;
    for (const reason of reasons) {
      expect(describeRejection(reason).length).toBeGreaterThan(0);
    }
  });
});

describe("nameableCityFromEdge", () => {
  it("names a country from the edge's ISO-2 code", () => {
    expect(nameableCityFromEdge({ city: "Chicago", country: "US" })).toEqual({
      city: "Chicago",
      country: "United States",
      countryCode: "US",
    });
  });

  it("carries no coordinates", () => {
    // The edge supplies IP-derived lat/lng. They are more precise than the
    // privacy copy claims and are never written, so the suggestion is
    // deliberately not writable until a forward geocode supplies a city center.
    const suggestion = nameableCityFromEdge({ city: "Chicago", country: "US" });
    expect(suggestion).not.toHaveProperty("coords");
  });

  it("offers nothing when the edge gave a sentinel or no city", () => {
    expect(nameableCityFromEdge({ city: "Chicago", country: "XX" })).toBeNull();
    expect(nameableCityFromEdge({ city: "Chicago", country: "T1" })).toBeNull();
    expect(nameableCityFromEdge({ city: "", country: "US" })).toBeNull();
    expect(nameableCityFromEdge({ city: "Chicago" })).toBeNull();
    expect(nameableCityFromEdge(null)).toBeNull();
    expect(nameableCityFromEdge(undefined)).toBeNull();
  });
});
