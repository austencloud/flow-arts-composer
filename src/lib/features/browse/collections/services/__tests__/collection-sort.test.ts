/**
 * The silent failures here: Favorites sliding below a user collection, the
 * creation-time `sortOrder` leaking back in so new collections sink, and a
 * stored preference nobody recognises crashing the rail instead of falling
 * back to the default.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_COLLECTION_SORT,
  readCollectionSortPreference,
  sortCollections,
  writeCollectionSortPreference,
} from "../collection-sort";

function col(
  name: string,
  created: string,
  updated: string,
  sortOrder = Date.parse(created)
) {
  return {
    name,
    sortOrder,
    createdAt: new Date(created),
    updatedAt: new Date(updated),
  };
}

// Mirrors the real library: creation-time sortOrder on the user collections,
// Favorites pinned at -1000, and the newest collection touched most recently.
const favorites = col("Favorites", "2025-12-04", "2026-09-15", -1000);
const archive = col(
  "Quarter Space Tech Archive",
  "2026-09-04",
  "2026-09-04",
  0
);
const book = col("Book Variations", "2026-07-01", "2026-08-06");
const vtg = col("VTG", "2026-07-02", "2026-07-02");
// Same day as Book Variations, later in the day; same update day too.
const year = col("1940", "2026-07-01T12:00:00Z", "2026-08-06");
const zans = col("Zan's Diamond", "2026-10-13", "2026-10-14");
const library = [book, zans, favorites, year, vtg, archive];

const names = (list: { name: string }[]) => list.map((c) => c.name);

describe("sortCollections", () => {
  it("floats the most recently touched collection to the top by default", () => {
    expect(names(sortCollections(library, "recent"))).toEqual([
      "Favorites",
      "Zan's Diamond",
      "Quarter Space Tech Archive",
      // Both touched 2026-08-06: the tie breaks by name, numbers first.
      "1940",
      "Book Variations",
      "VTG",
    ]);
  });

  it("orders by creation date, newest first", () => {
    expect(names(sortCollections(library, "newest"))).toEqual([
      "Favorites",
      "Zan's Diamond",
      "Quarter Space Tech Archive",
      "VTG",
      "1940",
      "Book Variations",
    ]);
  });

  it("orders alphabetically, numbers before letters, case ignored", () => {
    const mixed = [...library, col("zebra", "2026-01-01", "2026-01-01")];
    expect(names(sortCollections(mixed, "alphabetical"))).toEqual([
      "Favorites",
      "1940",
      "Book Variations",
      "Quarter Space Tech Archive",
      "VTG",
      "Zan's Diamond",
      "zebra",
    ]);
  });

  it("keeps every pinned system collection above the user's, most negative first", () => {
    const all = col("All", "2026-01-01", "2026-01-01", -2000);
    const sorted = sortCollections([zans, favorites, all], "alphabetical");
    expect(names(sorted)).toEqual(["All", "Favorites", "Zan's Diamond"]);
  });

  it("does not mutate the input", () => {
    const input = [zans, book];
    sortCollections(input, "alphabetical");
    expect(names(input)).toEqual(["Zan's Diamond", "Book Variations"]);
  });
});

describe("collection sort preference", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a chosen order", () => {
    writeCollectionSortPreference("alphabetical");
    expect(readCollectionSortPreference()).toBe("alphabetical");
  });

  it("falls back to the default when nothing or junk is stored", () => {
    expect(readCollectionSortPreference()).toBe(DEFAULT_COLLECTION_SORT);
    localStorage.setItem("tka_collections_sort", "by-vibes");
    expect(readCollectionSortPreference()).toBe(DEFAULT_COLLECTION_SORT);
  });
});
