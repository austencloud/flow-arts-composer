/**
 * `/embed/sequence/[id]` — the iframe host for a sequence player.
 *
 * Deliberately skips the Firestore lookups `../../../sequence/[id]` does for
 * its own SEO: the embed is noindex, so it only needs a title for the
 * iframe's own (invisible) document and a canonical URL pointing at the real
 * page. `SequenceViewerPage.svelte` resolves the actual sequence data itself.
 */
import type { PageServerLoad } from "./$types";
import {
  cleanSequenceText,
  type SequenceRouteMeta,
} from "../../../sequence/[id]/sequence-seo";
import { emptySequenceMeta } from "../../../sequence/[id]/published-meta";

const SITE_URL = "https://tkaflowarts.com";

export const load: PageServerLoad = ({ params, url }) => {
  const word = cleanSequenceText(url.searchParams.get("word"));
  const creator = cleanSequenceText(url.searchParams.get("creator"));

  const meta: SequenceRouteMeta = { ...emptySequenceMeta(), word, creator };

  const canonicalUrl = `${SITE_URL}/sequence/${encodeURIComponent(params.id)}`;
  const title = word
    ? `${word} — Flow Arts Composer`
    : "Flow Arts Composer sequence player";

  return { meta, canonicalUrl, title };
};
