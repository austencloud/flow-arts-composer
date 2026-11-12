/**
 * Link-preview metadata for a short code (`/q/ACCT`, `/sequence/ACCT`), shared
 * by both routes so a code names its sequence the same way wherever it is
 * opened. Lives beside `published-meta.ts` because it borrows that module's
 * catalog/public lookup for the code's source sequence.
 *
 * A short-code record carries the payload word and step count, and sometimes
 * the author and a thumbnail. When it lacks them and names a source sequence
 * (`sourceSequenceId`) that is a published catalog or public record, that one
 * extra read supplies them. Not every source resolves: ACCT (2026-11-10) has
 * no `ownerDisplayName` and its `sourceSequenceId` is the word "Δ-ΛRZ", which
 * is no published document id, so its link names the word and no author.
 */
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { ShortCodeData } from "#lib/shared/qr/services/types.js";
import { emptySequenceMeta, loadPublishedMeta } from "./published-meta";
import {
  cleanSequenceText,
  toPositiveInteger,
  toTrustedThumbnailUrl,
  type SequenceRouteMeta,
} from "./sequence-seo";

export interface ShortCodeMeta {
  word: string | null;
  payloadKind: "word" | "solo";
  authoredHand: "left" | "right" | null;
  creator: string | null;
  thumbnailUrl: string | null;
  deckId: string | null;
  deckName: string | null;
  leftPropType: string | null;
  rightPropType: string | null;
}

export const EMPTY_SHORT_CODE_META: ShortCodeMeta = {
  word: null,
  payloadKind: "word",
  authoredHand: null,
  creator: null,
  thumbnailUrl: null,
  deckId: null,
  deckName: null,
  leftPropType: null,
  rightPropType: null,
};

/** The source lookup is a second hop after the code read; keep it short. */
export const SHORT_CODE_SOURCE_TIMEOUT_MS = 1_000;

function readString(
  record: Record<string, unknown>,
  key: string
): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function deriveShortCodeMeta(
  record: ShortCodeData | null
): ShortCodeMeta {
  if (!record) return EMPTY_SHORT_CODE_META;
  const values = record as unknown as Record<string, unknown>;
  const payloadKind =
    readString(values, "payloadKind") === "solo" ? "solo" : "word";
  const authoredHandValue = readString(values, "authoredHand");
  const authoredHand =
    authoredHandValue === "left" || authoredHandValue === "right"
      ? authoredHandValue
      : null;

  // Word, author and deck name are user-supplied and land in titles and link
  // previews, so they get the same cleaning the /sequence records do.
  return {
    // Schema-3 solos carry a human title, never a fabricated TKA word.
    // Schema-2 words and legacy records retain the historical fallbacks.
    word: cleanSequenceText(
      (payloadKind === "solo"
        ? readString(values, "payloadTitle")
        : readString(values, "payloadWord")) ??
        readString(values, "word") ??
        readString(values, "sequenceName"),
      120
    ),
    payloadKind,
    authoredHand,
    creator: cleanSequenceText(readString(values, "ownerDisplayName"), 120),
    thumbnailUrl: toTrustedThumbnailUrl(readString(values, "thumbnailUrl")),
    deckId: readString(values, "deckId"),
    deckName: cleanSequenceText(readString(values, "deckName"), 160),
    leftPropType:
      readString(values, "leftPropType") ?? readString(values, "bluePropType"),
    rightPropType:
      readString(values, "rightPropType") ?? readString(values, "redPropType"),
  };
}

/** The published sequence a code was minted from, if it names one. */
export function shortCodeSourceId(record: ShortCodeData): string | null {
  const values = record as unknown as Record<string, unknown>;
  return (
    readString(values, "sourceSequenceId") ?? readString(values, "sequenceId")
  );
}

/**
 * Fills a code's missing author and thumbnail from the sequence it was minted
 * from. Only those two: the word and deck stay the code's own, because `/q`
 * scan analytics report them as the scanned card's. Never overrides what the
 * code carries, and returns its own meta when there is no source or the
 * lookup misses or times out.
 */
export async function withSourceAttribution(
  meta: ShortCodeMeta,
  record: ShortCodeData,
  platformCredential?: string
): Promise<ShortCodeMeta> {
  if (meta.creator && meta.thumbnailUrl) return meta;
  const sourceId = shortCodeSourceId(record);
  if (!sourceId) return meta;

  const source = await loadPublishedMeta(
    sourceId,
    emptySequenceMeta(),
    platformCredential,
    { timeoutMs: SHORT_CODE_SOURCE_TIMEOUT_MS }
  );
  return {
    ...meta,
    creator: meta.creator ?? source.creator,
    thumbnailUrl: meta.thumbnailUrl ?? source.thumbnailUrl,
  };
}

/** A code's meta in the `/sequence/[id]` shape. Never indexable. */
export function shortCodeRouteMeta(
  meta: ShortCodeMeta,
  record: ShortCodeData,
  sequence: SequenceData | null
): SequenceRouteMeta {
  const values = record as unknown as Record<string, unknown>;
  return {
    ...emptySequenceMeta(),
    word: meta.word,
    creator: meta.creator,
    stepCount:
      toPositiveInteger(values.payloadStepCount) ??
      (Array.isArray(sequence?.steps)
        ? toPositiveInteger(sequence.steps.length)
        : null),
    thumbnailUrl: meta.thumbnailUrl,
    deckName: meta.deckName,
    source: "shortcode",
  };
}
