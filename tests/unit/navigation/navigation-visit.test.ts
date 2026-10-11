import { beforeEach, describe, expect, it } from "vitest";
import { NAVIGATION_VISITS_KEY } from "#lib/shared/navigation/config/storage-keys.js";
import {
  selectOftenUsedDestinationIds,
  selectRecentDestinationIds,
} from "#lib/shared/navigation/domain/navigation-visit-ranking.js";
import { NavigationVisitPersister } from "#lib/shared/navigation/services/implementations/NavigationVisitPersister.js";

describe("NavigationVisitPersister", () => {
  beforeEach(() => localStorage.clear());

  it("keeps visit history separate for each identity", () => {
    let scope = "person-a";
    const persister = new NavigationVisitPersister(localStorage, () => scope);

    persister.recordVisit("navigation:create:assemble", 1_000);
    scope = "person-b";
    persister.recordVisit("navigation:browse:gallery", 2_000);

    expect(persister.getVisits()).toEqual([
      {
        destinationId: "navigation:browse:gallery",
        visitCount: 1,
        lastVisitedAt: 2_000,
      },
    ]);

    scope = "person-a";
    expect(persister.getVisits()).toEqual([
      {
        destinationId: "navigation:create:assemble",
        visitCount: 1,
        lastVisitedAt: 1_000,
      },
    ]);
  });

  it("collapses rapid repeats without losing the latest visit time", () => {
    const persister = new NavigationVisitPersister(
      localStorage,
      () => "person-a"
    );

    persister.recordVisit("navigation:create:assemble", 1_000);
    persister.recordVisit("navigation:create:assemble", 10_000);
    persister.recordVisit("navigation:create:assemble", 41_000);

    expect(persister.getVisits()).toEqual([
      {
        destinationId: "navigation:create:assemble",
        visitCount: 2,
        lastVisitedAt: 41_000,
      },
    ]);
  });

  it("resets malformed or unsupported payloads", () => {
    localStorage.setItem(NAVIGATION_VISITS_KEY, "not-json");
    const persister = new NavigationVisitPersister(
      localStorage,
      () => "person-a"
    );

    expect(persister.getVisits()).toEqual([]);

    localStorage.setItem(
      NAVIGATION_VISITS_KEY,
      JSON.stringify({ version: 2, profiles: { "person-a": [] } })
    );
    expect(persister.getVisits()).toEqual([]);
  });
});

describe("navigation visit ranking", () => {
  const available = new Set(["current", "recent", "frequent", "stale"]);
  const visits = [
    { destinationId: "stale", visitCount: 50, lastVisitedAt: 1 },
    { destinationId: "current", visitCount: 8, lastVisitedAt: 400 },
    { destinationId: "recent", visitCount: 1, lastVisitedAt: 300 },
    { destinationId: "frequent", visitCount: 10, lastVisitedAt: 200 },
    { destinationId: "unavailable", visitCount: 20, lastVisitedAt: 500 },
  ];

  it("ranks recent available destinations while excluding the current one", () => {
    expect(selectRecentDestinationIds(visits, available, "current", 2)).toEqual(
      ["recent", "frequent"]
    );
  });

  it("ranks frequently used destinations with recency decay and exclusions", () => {
    const fourteenDays = 14 * 24 * 60 * 60 * 1_000;
    const rankedVisits = [
      { destinationId: "frequent", visitCount: 10, lastVisitedAt: 0 },
      {
        destinationId: "stale",
        visitCount: 50,
        lastVisitedAt: -fourteenDays * 4,
      },
      { destinationId: "recent", visitCount: 2, lastVisitedAt: 0 },
    ];

    expect(
      selectOftenUsedDestinationIds(
        rankedVisits,
        available,
        new Set(["current"]),
        0
      )
    ).toEqual(["frequent", "stale"]);
  });
});
