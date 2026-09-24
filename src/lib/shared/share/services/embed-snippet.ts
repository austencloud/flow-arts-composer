/**
 * Embed snippet builder.
 *
 * The single owner for the copy-pasteable `<iframe>` + attribution HTML a
 * person pastes onto their own site to embed a sequence player, and for the
 * `/oembed` endpoint's `html` field (oEmbed consumers embed the same markup a
 * person would paste by hand — one snippet, two entry points).
 *
 * The attribution link lives OUTSIDE the iframe, in ordinary page HTML: a
 * link rendered inside an iframe earns the embedding page no backlink credit
 * (search engines attribute links to the document that contains them, not one
 * three levels of iframe deep), so the whole point of an embeddable player is
 * defeated if the credit line is drawn inside the frame instead of beside it.
 */

import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";

const SITE_URL = "https://tkaflowarts.com";
const DEFAULT_WIDTH = 560;
const DEFAULT_HEIGHT = 560;
const FALLBACK_WORD = "Sequence";

export interface EmbedSnippetInput {
  /** The sequence's short code or route identifier (never a full URL). */
  code: string;
  /** Raw sequence word; simplified and HTML-escaped before use. */
  word: string | null | undefined;
  /** Pixel dimensions for the iframe. Defaults to a square player. */
  width?: number;
  height?: number;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The display word: simplified for repeats, HTML-escaped, never empty. */
export function embedDisplayWord(word: string | null | undefined): string {
  const trimmed = word?.trim();
  return trimmed ? simplifyRepeatedWord(trimmed) : FALLBACK_WORD;
}

export function embedPageUrl(code: string): string {
  return `${SITE_URL}/sequence/${encodeURIComponent(code)}`;
}

export function embedPlayerUrl(code: string): string {
  return `${SITE_URL}/embed/sequence/${encodeURIComponent(code)}`;
}

/**
 * The exact HTML a person pastes: a chrome-light player iframe, followed by a
 * plain-HTML attribution link back to the canonical sequence page.
 */
export function buildEmbedSnippet(input: EmbedSnippetInput): string {
  const width = input.width && input.width > 0 ? Math.round(input.width) : DEFAULT_WIDTH;
  const height =
    input.height && input.height > 0 ? Math.round(input.height) : DEFAULT_HEIGHT;
  const safeWord = escapeHtml(embedDisplayWord(input.word));
  const playerUrl = embedPlayerUrl(input.code);
  const pageUrl = embedPageUrl(input.code);

  return (
    `<iframe src="${playerUrl}" width="${width}" height="${height}" ` +
    `style="border:0;max-width:100%;aspect-ratio:${width}/${height}" ` +
    `loading="lazy" allow="fullscreen" title="${safeWord}, a flow arts sequence">` +
    `</iframe>` +
    `<p><a href="${pageUrl}">${safeWord}</a> on Flow Arts Composer</p>`
  );
}
