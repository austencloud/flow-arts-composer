import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

/**
 * Names the app stamps on a sequence before anyone has named it. They are
 * placeholders, not titles: the Assemble tab creates "Assemble Sequence", the
 * Construct tab creates "Sequence 2:21:45 PM", a decoded share link creates
 * "Shared Sequence". None describes the sequence, so none belongs in a header.
 */
const AUTO_NAME_LITERALS = new Set([
  "assemble sequence",
  "shared sequence",
  "sequence",
]);

// Construct stamps `Sequence ${toLocaleTimeString()}`. The clock text varies by
// locale ("2:21:45 PM", "14:21:45", and a narrow no-break space before PM on
// current engines), so match a run of clock characters rather than one format.
const CLOCK_STAMPED_AUTO_NAME = /^Sequence[\s  ]+\d[\d:.\s  apmAPM]*$/;

export function isAutoSequenceName(name: string | null | undefined): boolean {
  const trimmed = name?.trim();
  if (!trimmed) return false;
  return (
    AUTO_NAME_LITERALS.has(trimmed.toLowerCase()) ||
    CLOCK_STAMPED_AUTO_NAME.test(trimmed)
  );
}

/**
 * The text that identifies a sequence in the viewer: its word when it has
 * letters, otherwise a name the user chose. A letterless sequence with only an
 * auto-generated name resolves to "" so the viewer leaves its title empty.
 */
export function resolveSequenceIdentityTitle(
  sequence: Pick<SequenceData, "word" | "displayName" | "name">
): string {
  if (sequence.word) return sequence.word;
  for (const candidate of [sequence.displayName, sequence.name]) {
    if (candidate && !isAutoSequenceName(candidate)) return candidate;
  }
  return "";
}
