import { describe, it, expect } from "vitest";
import { rowsToJourneyPoints, shouldShowJourney } from "#lib/shared/qr/journey/journey-loader.js";

describe("rowsToJourneyPoints", () => {
  it("keeps rows with exact lat/lng", () => {
    const pts = rowsToJourneyPoints([
      { lat: 41.88, lng: -87.63, city: "Chicago", country: "US", timestamp: "2026-06-01T00:00:00Z" },
    ]);
    expect(pts).toHaveLength(1);
    expect(pts[0]).toMatchObject({ lat: 41.88, lng: -87.63, city: "Chicago", country: "US" });
  });

  it("falls back to country centroid when lat/lng missing", () => {
    const pts = rowsToJourneyPoints([
      { lat: null, lng: null, city: null, country: "US", timestamp: "2026-06-01T00:00:00Z" },
    ]);
    expect(pts).toHaveLength(1);
    // US centroid from country-centroids.ts is [39.8, -98.6]
    expect(pts[0]!.lat).toBeCloseTo(39.8, 1);
    expect(pts[0]!.lng).toBeCloseTo(-98.6, 1);
  });

  it("drops rows with no resolvable location", () => {
    const pts = rowsToJourneyPoints([
      { lat: null, lng: null, city: null, country: null, timestamp: "2026-06-01T00:00:00Z" },
      { lat: null, lng: null, city: "Nowhere", country: "ZZ", timestamp: "2026-06-02T00:00:00Z" },
    ]);
    expect(pts).toHaveLength(0);
  });

  it("preserves input order", () => {
    const pts = rowsToJourneyPoints([
      { lat: 1, lng: 1, city: "A", country: "US", timestamp: "2026-06-01T00:00:00Z" },
      { lat: 2, lng: 2, city: "B", country: "US", timestamp: "2026-06-02T00:00:00Z" },
    ]);
    expect(pts.map((p) => p.city)).toEqual(["A", "B"]);
  });
});

describe("shouldShowJourney", () => {
  it("requires a genuine scan", () => {
    expect(shouldShowJourney({ genuine: false, pointCount: 5 })).toBe(false);
  });
  it("shows for genuine scan with at least one resolvable point", () => {
    expect(shouldShowJourney({ genuine: true, pointCount: 1 })).toBe(true);
    expect(shouldShowJourney({ genuine: true, pointCount: 2 })).toBe(true);
  });
  it("skips when there are no resolvable points", () => {
    expect(shouldShowJourney({ genuine: true, pointCount: 0 })).toBe(false);
  });
});
