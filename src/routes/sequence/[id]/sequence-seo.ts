import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";

const SITE_URL = "https://tkaflowarts.com";
const DEFAULT_OG_IMAGE = `${SITE_URL}/branding/og-image.png`;

export type SequenceRecordSource = "catalog" | "public" | "inline" | "unknown";

export interface SequenceRouteMeta {
  word: string | null;
  creator: string | null;
  difficulty: string | null;
  stepCount: number | null;
  thumbnailUrl: string | null;
  source: SequenceRecordSource;
  curated: boolean;
  catalogId: string | null;
  deckName: string | null;
  deckNumber: number | null;
}

export interface SequenceSeoDocument {
  title: string;
  description: string;
  canonical: string;
  heading: string;
  ogImage: string;
  ogImageAlt: string;
  indexable: boolean;
  jsonLd: Record<string, unknown> | null;
}

export function cleanSequenceText(
  value: unknown,
  maxLength = 120
): string | null {
  if (typeof value !== "string") return null;

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  return Array.from(normalized).slice(0, maxLength).join("");
}

export function toPositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const integer = Math.floor(value);
  return integer > 0 ? integer : null;
}

export function toTrustedThumbnailUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value);
    const isTrustedHost =
      url.hostname === "firebasestorage.googleapis.com" ||
      url.hostname === "storage.googleapis.com" ||
      url.hostname === "tkaflowarts.com" ||
      url.hostname.endsWith(".tkaflowarts.com");

    return url.protocol === "https:" && isTrustedHost ? url.toString() : null;
  } catch {
    return null;
  }
}

export function isSequenceIndexable(meta: SequenceRouteMeta): boolean {
  const hasResolvedEditorialSource =
    meta.source === "catalog" || meta.source === "public";

  return Boolean(
    meta.curated &&
    hasResolvedEditorialSource &&
    cleanSequenceText(meta.word, 120) &&
    cleanSequenceText(meta.creator, 120) &&
    toPositiveInteger(meta.stepCount)
  );
}

export function buildSequenceSeo(
  routeId: string,
  meta: SequenceRouteMeta
): SequenceSeoDocument {
  const cleanWord = cleanSequenceText(meta.word, 120);
  const displayWord = cleanWord ? simplifyRepeatedWord(cleanWord) : null;
  const creator = cleanSequenceText(meta.creator, 120);
  const deckName = cleanSequenceText(meta.deckName, 160);
  const stepCount = toPositiveInteger(meta.stepCount);
  const indexable = isSequenceIndexable(meta);
  const sequenceLabel = displayWord ? `"${displayWord}"` : "this sequence";
  const stepLabel = stepCount ? `${stepCount}-step ` : "";
  const submitterLabel = creator ? `, submitted by ${creator}` : "";
  const deckLabel = indexable && deckName ? ` released in ${deckName}` : "";
  const canonical = `${SITE_URL}/sequence/${encodeURIComponent(routeId)}`;
  const heading = displayWord
    ? `${displayWord} flow arts sequence`
    : "Flow arts sequence";
  const description = indexable
    ? `View and practice ${sequenceLabel}, a ${stepLabel}flow arts sequence${submitterLabel}${deckLabel}. Open its animated notation in Flow Arts Composer.`
    : `Open and practice ${sequenceLabel}, a ${stepLabel}flow arts sequence${submitterLabel}, in Flow Arts Composer.`;
  const ogImage = meta.thumbnailUrl ?? DEFAULT_OG_IMAGE;

  return {
    title: displayWord
      ? `${displayWord} Flow Arts Sequence | Flow Arts Composer`
      : "Flow Arts Sequence | Flow Arts Composer",
    description,
    canonical,
    heading,
    ogImage,
    ogImageAlt: displayWord
      ? `${displayWord} flow arts sequence`
      : "Flow Arts Composer",
    indexable,
    jsonLd: indexable
      ? {
          "@context": "https://schema.org",
          "@type": "CreativeWork",
          "@id": `${canonical}#sequence`,
          name: heading,
          description,
          url: canonical,
          image: ogImage,
          inLanguage: "en-US",
          contributor: creator,
          isPartOf: {
            "@id": `${SITE_URL}/composer#software`,
          },
        }
      : null,
  };
}
