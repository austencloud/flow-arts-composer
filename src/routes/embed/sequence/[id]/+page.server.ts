/**
 * `/embed/sequence/[id]` — the iframe host for a sequence player.
 *
 * Deliberately NOT a wrapper around `../../../sequence/[id]/+page.server.ts`:
 * that file resolves the full editorial record (catalog/public lookups) for
 * the canonical page's own SEO, and another change is landing there right
 * now. An embed only needs a title for the iframe's own (invisible) document
 * and a canonical URL pointing at the real page; `SequenceViewerPage.svelte`
 * resolves the actual sequence data itself the same way it already does for
 * every non-catalog source.
 */
import type { PageServerLoad } from "./$types";
import {
  cleanSequenceText,
  type SequenceRouteMeta,
} from "../../../sequence/[id]/sequence-seo";

const SITE_URL = "https://tkaflowarts.com";

export const load: PageServerLoad = ({ params, url }) => {
  const word = cleanSequenceText(url.searchParams.get("word"));
  const creator = cleanSequenceText(url.searchParams.get("creator"));

  const meta: SequenceRouteMeta = {
    word,
    creator,
    difficulty: null,
    stepCount: null,
    thumbnailUrl: null,
    source: "unknown",
    curated: false,
    catalogId: null,
    deckName: null,
    deckNumber: null,
  };

  const canonicalUrl = `${SITE_URL}/sequence/${encodeURIComponent(params.id)}`;
  const title = word
    ? `${word} — Flow Arts Composer`
    : "Flow Arts Composer sequence player";

  return { meta, canonicalUrl, title };
};
