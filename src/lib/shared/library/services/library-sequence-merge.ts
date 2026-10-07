/**
 * Merging an edited sequence over the stored library copy.
 *
 * The join (`SequenceData.conjoined`) is part of the sequence, so the saved
 * sequence's join replaces the stored one outright. A plain spread keeps the
 * stored join when the edited sequence has none, which would bring back a join
 * the user just removed.
 */
import { sequenceGridJoin } from "$lib/shared/grid-join/sequence-grid-join";

export function mergeSavedOverStored<
  TStored extends { readonly conjoined?: unknown },
  TSaved extends { readonly conjoined?: unknown },
>(stored: TStored, saved: TSaved): TStored & TSaved {
  const { conjoined: _storedJoin, ...storedRest } = stored;
  const { conjoined: _savedJoin, ...savedRest } = saved;
  const join = sequenceGridJoin(saved);
  return { ...storedRest, ...savedRest, ...(join && { conjoined: join }) } as
    TStored & TSaved;
}
