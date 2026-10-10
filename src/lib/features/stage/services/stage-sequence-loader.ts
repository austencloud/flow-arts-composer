import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { loadStaticSequence } from "#lib/shared/foundation/services/static-sequence-catalog.js";
import { loadByIdentifier } from "#lib/shared/sequence-viewer/services/sequence-data-provider.js";

import {
  DEFAULT_STAGE_SEQUENCE_CATALOG,
  DEFAULT_STAGE_SEQUENCE_ID,
} from "../domain/stage-types";

export { DEFAULT_STAGE_SEQUENCE_CATALOG, DEFAULT_STAGE_SEQUENCE_ID };

export async function loadStageSequence(
  sequenceId: string,
  fetcher: typeof fetch = fetch
): Promise<SequenceData> {
  if (sequenceId === DEFAULT_STAGE_SEQUENCE_ID) {
    return loadStaticSequence(
      DEFAULT_STAGE_SEQUENCE_CATALOG,
      sequenceId,
      fetcher
    );
  }

  const sequence = await loadByIdentifier(sequenceId);
  if (!sequence) {
    throw new Error(`Sequence ${sequenceId} could not be resolved`);
  }
  return sequence;
}
