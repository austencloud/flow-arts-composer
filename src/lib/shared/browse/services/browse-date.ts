import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

type SequenceWithCreatedAt = SequenceData & { createdAt?: Date };

/** The date that orders and groups a sequence on Browse surfaces. */
export function resolveBrowseDate(sequence: SequenceData): Date | null {
  const withCreatedAt = sequence as SequenceWithCreatedAt;
  const candidate =
    sequence.dateAdded ?? sequence.birthday ?? withCreatedAt.createdAt;
  if (!candidate) return null;

  const date = candidate instanceof Date ? candidate : new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Library documents call the membership timestamp `createdAt`. Browse calls
 * the same idea `dateAdded`, so make that meaning explicit at the source
 * boundary. Existing `dateAdded` values remain authoritative.
 */
export function withLibraryBrowseDate<T extends SequenceData>(sequence: T): T {
  if (sequence.dateAdded) return sequence;
  const createdAt = (sequence as SequenceWithCreatedAt).createdAt;
  if (!createdAt) return sequence;
  return { ...sequence, dateAdded: createdAt };
}
