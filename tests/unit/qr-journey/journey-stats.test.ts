import { describe, it, expect } from "vitest";
import {
  haversineKm,
  totalDistanceKm,
  uniqueCities,
  uniqueCountries,
  toArcs,
} from "#lib/shared/qr/journey/journey-stats.js";

describe("journey-stats", () => {
  const CHICAGO = { lat: 41.88, lng: -87.63 };
  const NYC = { lat: 40.71, lng: -74.01 };
  const LONDON = { lat: 51.51, lng: -0.13 };
  const PARIS = { lat: 48.86, lng: 2.35 };

  it("haversineKm matches known great-circle distance (Chicago→NYC ~1145km)", () => {
    expect(haversineKm(CHICAGO, NYC)).toBeGreaterThan(1125);
    expect(haversineKm(CHICAGO, NYC)).toBeLessThan(1165);
  });

  it("haversineKm is zero for identical points", () => {
    expect(haversineKm(CHICAGO, CHICAGO)).toBe(0);
  });

  it("totalDistanceKm sums consecutive hops", () => {
    const d = totalDistanceKm([CHICAGO, NYC, LONDON]);
    expect(d).toBeCloseTo(haversineKm(CHICAGO, NYC) + haversineKm(NYC, LONDON), 5);
  });

  it("totalDistanceKm is 0 for <2 points", () => {
    expect(totalDistanceKm([])).toBe(0);
    expect(totalDistanceKm([CHICAGO])).toBe(0);
  });

  it("uniqueCities dedups same city, counts distinct", () => {
    const pts = [
      { city: "Chicago", country: "US" },
      { city: "Chicago", country: "US" },
      { city: "Paris", country: "FR" },
      { city: null, country: "FR" },
    ];
    expect(uniqueCities(pts)).toBe(2);
  });

  it("uniqueCountries counts distinct non-null countries", () => {
    expect(
      uniqueCountries([{ country: "US" }, { country: "US" }, { country: "FR" }, { country: null }])
    ).toBe(2);
  });

  it("toArcs builds n-1 consecutive segments", () => {
    const arcs = toArcs([CHICAGO, NYC, LONDON]);
    expect(arcs).toHaveLength(2);
    expect(arcs[0]).toEqual({
      startLat: CHICAGO.lat, startLng: CHICAGO.lng, endLat: NYC.lat, endLng: NYC.lng,
    });
  });

  it("toArcs returns [] for 0 or 1 points", () => {
    expect(toArcs([])).toEqual([]);
    expect(toArcs([PARIS])).toEqual([]);
  });
});
