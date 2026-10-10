import type { BrowseViewMode } from "#lib/shared/browse/domain/browse-view-mode.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  handPathToSequence,
  soloPropToSequence,
} from "#lib/shared/foundation/services/solo-prop-sequence-adapter.js";
import { getBrowseDataSource } from "../get-browse-data-source";

export async function loadSoloLibrarySequences(
  viewMode: BrowseViewMode
): Promise<readonly SequenceData[]> {
  if (viewMode.granularity !== "solo") return [];

  const result = await getBrowseDataSource().query(viewMode);
  const authoredHand = viewMode.hand;
  return viewMode.subject === "props"
    ? result.soloProps.map((soloProp) =>
        soloPropToSequence(soloProp, authoredHand, {
          sourceSoloPropId: soloProp.id,
        })
      )
    : result.handPaths
        .filter((handPath) => handPath.locations.length >= 2)
        .map((handPath) => handPathToSequence(handPath, authoredHand));
}
