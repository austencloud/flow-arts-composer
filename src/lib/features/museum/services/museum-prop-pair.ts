import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  captureActivePropConfig,
  resolveRecordedPropConfig,
  type ActivePropSettings,
  type ResolvedPropConfig,
} from "$lib/shared/foundation/services/recorded-prop-intent";

/**
 * The pair a museum performer holds: the sequence's recorded pair when it has
 * a valid one, else the visitor's settings. A half-valid recording falls back
 * as a whole, never mixed per hand.
 */
export function museumPropPair(
  sequence: SequenceData | null | undefined,
  settings: ActivePropSettings | null
): ResolvedPropConfig {
  return (
    resolveRecordedPropConfig(sequence) ?? captureActivePropConfig(settings ?? {})
  );
}
