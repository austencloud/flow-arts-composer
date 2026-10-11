/**
 * BrowseDataSource
 *
 * Routes browse queries to the correct Firestore collection based on
 * the active view mode. Combined modes use the existing public sequences
 * loader. Solo modes query the hand path or solo prop repositories directly.
 */

import type { BrowseQueryResult } from "./types";
import type { PublicSequencesLoader } from "#lib/shared/browse/services/public-sequences-loader.js";
import type { SoloPropRepository } from "#lib/shared/foundation/services/solo-prop-repository-store.js";
import type { HandPathRepository } from "#lib/shared/foundation/services/hand-path-repository-store.js";
import type { BrowseViewMode } from "#lib/shared/browse/domain/browse-view-mode.js";

export class BrowseDataSource {
  constructor(
    private readonly browseLoader: PublicSequencesLoader,
    private readonly soloPropRepository: SoloPropRepository,
    private readonly handPathRepository: HandPathRepository
  ) {}

  async query(viewMode: BrowseViewMode): Promise<BrowseQueryResult> {
    const empty: BrowseQueryResult = {
      sequences: [],
      soloProps: [],
      handPaths: [],
    };

    if (viewMode.granularity === "combined") {
      // Both combined modes use the same sequence data. The renderer
      // decides whether to show props or hand paths based on subject.
      const sequences = await this.browseLoader.loadSequenceMetadata();
      return { ...empty, sequences };
    }

    // Solo mode: query the artifact-level repositories
    if (viewMode.subject === "props") {
      const soloProps = await this.soloPropRepository.list({ limit: 200 });
      return { ...empty, soloProps };
    }

    // hands + solo
    const handPaths = await this.handPathRepository.list({ limit: 200 });
    return { ...empty, handPaths };
  }
}
