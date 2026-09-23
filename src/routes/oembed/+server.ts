/**
 * `/oembed` — the discovery endpoint oEmbed spec (oembed.com) consumers hit
 * after following the `<link rel="alternate" type="application/json+oembed">`
 * on `/sequence/[id]`. Same markup a person pastes by hand: this returns
 * `buildEmbedSnippet`'s HTML as the `html` field, so there is exactly one
 * owner for "what an embedded sequence looks like" (see
 * `$lib/shared/share/services/embed-snippet.ts`).
 *
 * The title uses the sequence's published word, resolved by the same
 * `loadPublishedMeta` the `/sequence/[id]` page uses. An inline-encoded id or
 * an unknown sequence falls back to "Sequence", the same fallback the
 * hand-copied snippet uses, rather than a guessed title.
 */
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  buildEmbedSnippet,
  embedDisplayWord,
} from "$lib/shared/share/services/embed-snippet";
import { parseSequenceRouteId } from "$lib/shared/navigation/services/sequence-encoder";
import {
  emptySequenceMeta,
  loadPublishedMeta,
} from "../sequence/[id]/published-meta";

const SITE_HOST = "tkaflowarts.com";
const SITE_URL = "https://tkaflowarts.com";
const PROVIDER_NAME = "Flow Arts Composer";
const DEFAULT_SIZE = 560;
const MIN_SIZE = 120;

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** The sequence code from a `https://tkaflowarts.com/sequence/<code>` URL, or null. */
function extractSequenceCode(rawUrl: string): string | null {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return null;
  }

  if (target.protocol !== "https:" || target.hostname !== SITE_HOST) {
    return null;
  }

  const segments = target.pathname.split("/").filter(Boolean);
  const code = segments[1];
  if (segments.length !== 2 || segments[0] !== "sequence" || !code) {
    return null;
  }

  try {
    return decodeURIComponent(code);
  } catch {
    return null;
  }
}

/** A published sequence's word; an inline-encoded id has no record to read. */
async function resolvePublishedWord(
  code: string,
  platformCredential?: string
): Promise<string | null> {
  const { legacyId } = parseSequenceRouteId(code);
  if (!legacyId) return null;
  const meta = await loadPublishedMeta(
    legacyId,
    emptySequenceMeta(),
    platformCredential
  );
  return meta.word;
}

export const GET: RequestHandler = async ({ url, platform }) => {
  const targetUrl = url.searchParams.get("url");
  if (!targetUrl) {
    error(400, "Missing required 'url' parameter");
  }

  const format = url.searchParams.get("format");
  if (format && format !== "json") {
    error(501, "Only JSON responses are supported");
  }

  const code = extractSequenceCode(targetUrl);
  if (!code) {
    error(404, "Not an embeddable Flow Arts Composer sequence URL");
  }

  const maxwidth = parsePositiveInt(url.searchParams.get("maxwidth"));
  const maxheight = parsePositiveInt(url.searchParams.get("maxheight"));

  // The player is always square (see buildEmbedSnippet's default aspect
  // ratio), so a maxwidth/maxheight constraint clamps both dimensions to
  // whichever is tighter rather than distorting the aspect ratio.
  let size = DEFAULT_SIZE;
  if (maxwidth) size = Math.min(size, maxwidth);
  if (maxheight) size = Math.min(size, maxheight);
  size = Math.max(size, MIN_SIZE);

  const word = embedDisplayWord(
    await resolvePublishedWord(
      code,
      platform?.env?.FIREBASE_SERVICE_ACCOUNT_JSON
    )
  );
  const html = buildEmbedSnippet({ code, word, width: size, height: size });

  return json({
    version: "1.0",
    type: "rich",
    width: size,
    height: size,
    title: `${word} — Flow Arts Composer sequence player`,
    provider_name: PROVIDER_NAME,
    provider_url: SITE_URL,
    html,
  });
};
