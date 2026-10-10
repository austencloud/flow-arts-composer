import { describe, expect, it, vi } from "vitest";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { createHandPath } from "#lib/shared/foundation/services/hand-path-factory.js";

const query = vi.hoisted(() => vi.fn());

vi.mock("#lib/features/browse/shared/get-browse-data-source.js", () => ({
  getBrowseDataSource: () => ({ query }),
}));

import { loadSoloLibrarySequences } from "#lib/features/browse/shared/services/solo-library-sequence-loader.js";

describe("loadSoloLibrarySequences", () => {
  it("skips hand paths that cannot produce a visible step", async () => {
    query.mockResolvedValue({
      sequences: [],
      soloProps: [],
      handPaths: [
        createHandPath([GridLocation.NORTH]),
        createHandPath([GridLocation.NORTH, GridLocation.EAST]),
      ],
    });

    const sequences = await loadSoloLibrarySequences({
      subject: "hands",
      granularity: "solo",
      hand: "left",
    });

    expect(sequences).toHaveLength(1);
    expect(sequences[0]?.steps).toHaveLength(1);
  });
});
