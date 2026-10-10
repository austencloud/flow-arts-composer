import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  loadStaticSequence,
  selectStaticSequence,
} from "#lib/shared/foundation/services/static-sequence-catalog.js";

export const CONTACT_PROOF_SEQUENCE_ID = "tnd-quarter-opp-mpmp";
export const CONTACT_PROOF_SEQUENCE_URL = "/data/hero/tnd-base-words.json";

/**
 * The proof route reads the same catalog entry used elsewhere in TKA. If that
 * entry changes shape or disappears, the proof stops instead of quietly
 * substituting a hand-authored imitation.
 */
export function selectContactProofSequence(
  payload: unknown
): SequenceData | null {
  return selectStaticSequence(payload, CONTACT_PROOF_SEQUENCE_ID);
}

export async function loadContactProofSequence(
  fetcher: typeof fetch = fetch
): Promise<SequenceData> {
  return loadStaticSequence(
    CONTACT_PROOF_SEQUENCE_URL,
    CONTACT_PROOF_SEQUENCE_ID,
    fetcher
  );
}
