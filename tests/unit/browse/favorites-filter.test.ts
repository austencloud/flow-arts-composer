/**
 * The Favorites browse filter reads the user's Favorites collection.
 *
 * A sequence loaded from someone else's doc (a community sequence filed in a
 * collection, a gallery card) never carries the viewer's own `isFavorite`, so
 * filtering on that flag showed "0 of 4" in a collection holding a favorite.
 */
import { describe, expect, it, afterEach } from "vitest";

import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
import {
  applyFilter,
  setFavoriteIdsResolver,
} from "#lib/shared/browse/services/browse-filter.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

function seq(id: string, isFavorite = false): SequenceData {
  return { id, word: id, steps: [], isFavorite } as unknown as SequenceData;
}

afterEach(() => {
  setFavoriteIdsResolver(() => undefined);
});

describe("Favorites filter", () => {
  it("keeps the sequences in the Favorites collection", () => {
    setFavoriteIdsResolver(() => new Set(["b"]));
    const result = applyFilter(
      [seq("a"), seq("b"), seq("c", true)],
      BrowseFilterType.FAVORITES,
      null
    );
    expect(result.map((s) => s.id)).toEqual(["b"]);
  });

  it("falls back to the sequence flag before Favorites has loaded", () => {
    setFavoriteIdsResolver(() => undefined);
    const result = applyFilter(
      [seq("a"), seq("b", true)],
      BrowseFilterType.FAVORITES,
      null
    );
    expect(result.map((s) => s.id)).toEqual(["b"]);
  });
});
