import { describe, it, expect } from "vitest";
import {
  parseCloudflareGeo,
  formatLocationLabel,
  locationsEqual,
} from "#lib/shared/presence/domain/models/presence-models.js";

describe("parseCloudflareGeo", () => {
  const h = (entries: Record<string, string>) => new Headers(entries);

  it("returns null when no geo headers present", () => {
    expect(parseCloudflareGeo(h({}))).toBeNull();
  });

  it("parses country/city/lat/lng", () => {
    const geo = parseCloudflareGeo(
      h({
        "cf-ipcountry": "DE",
        "cf-ipcity": "Berlin",
        "cf-iplatitude": "52.52",
        "cf-iplongitude": "13.405",
      })
    );
    expect(geo).toEqual({ country: "DE", city: "Berlin", lat: 52.52, lng: 13.405 });
  });

  it("returns geo with nulls for missing coords but present country", () => {
    const geo = parseCloudflareGeo(h({ "cf-ipcountry": "US" }));
    expect(geo).toEqual({ country: "US", city: null, lat: null, lng: null });
  });

  it("ignores non-finite coords", () => {
    const geo = parseCloudflareGeo(
      h({ "cf-ipcountry": "US", "cf-iplatitude": "abc", "cf-iplongitude": "" })
    );
    expect(geo?.lat).toBeNull();
    expect(geo?.lng).toBeNull();
  });

  it("prefers platform.cf over headers (cf carries city, headers country-only)", () => {
    const geo = parseCloudflareGeo(h({ "cf-ipcountry": "DE" }), {
      country: "US",
      city: "Chicago",
      latitude: "41.85",
      longitude: "-87.65",
    });
    expect(geo).toEqual({ country: "US", city: "Chicago", lat: 41.85, lng: -87.65 });
  });

  it("falls back to headers per-field when cf is partial", () => {
    const geo = parseCloudflareGeo(h({ "cf-ipcountry": "US" }), { city: "Chicago" });
    expect(geo).toEqual({ country: "US", city: "Chicago", lat: null, lng: null });
  });

  it("accepts numeric cf coords", () => {
    const geo = parseCloudflareGeo(h({}), {
      country: "US",
      city: "Chicago",
      latitude: 41.85,
      longitude: -87.65,
    });
    expect(geo?.lat).toBe(41.85);
    expect(geo?.lng).toBe(-87.65);
  });
});

describe("formatLocationLabel", () => {
  it("formats city + country", () => {
    expect(formatLocationLabel({ city: "Berlin", country: "DE", lat: 1, lng: 2 })).toBe(
      "Berlin, DE"
    );
  });
  it("country only when no city", () => {
    expect(formatLocationLabel({ city: null, country: "US", lat: null, lng: null })).toBe(
      "US"
    );
  });
  it("empty string when neither", () => {
    expect(formatLocationLabel(null)).toBe("");
    expect(formatLocationLabel({ city: null, country: null, lat: 1, lng: 2 })).toBe("");
  });
});

describe("locationsEqual (presence setLocation dedup / no-clobber)", () => {
  const berlin = { city: "Berlin", country: "DE", lat: 52.52, lng: 13.405 };

  it("treats two absent locations as equal", () => {
    expect(locationsEqual(null, null)).toBe(true);
    expect(locationsEqual(null, undefined)).toBe(true);
  });

  it("a present location is never equal to an absent one (no-clobber guard)", () => {
    // setLocation(null) early-returns on falsy; this asserts the comparison
    // never reports a stored location as equal to a missing incoming one.
    expect(locationsEqual(berlin, null)).toBe(false);
    expect(locationsEqual(null, berlin)).toBe(false);
  });

  it("identical field-by-field locations are equal (dedup skips re-write)", () => {
    expect(locationsEqual(berlin, { ...berlin })).toBe(true);
  });

  it("any differing field makes them unequal", () => {
    expect(locationsEqual(berlin, { ...berlin, city: "Munich" })).toBe(false);
    expect(locationsEqual(berlin, { ...berlin, country: "AT" })).toBe(false);
    expect(locationsEqual(berlin, { ...berlin, lat: 0 })).toBe(false);
    expect(locationsEqual(berlin, { ...berlin, lng: 0 })).toBe(false);
  });
});
