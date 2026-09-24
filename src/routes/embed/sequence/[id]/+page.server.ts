/**
 * `/embed/sequence/[id]` — the iframe host for a sequence player.
 *
 * Resolves the same published meta `/sequence/[id]` does:
 * `SequenceViewerPage.svelte` opens a released catalog sequence only when the
 * meta names its catalog (`source: "catalog"` + `catalogId`), so a placeholder
 * meta would leave every released card "isn't available" inside the iframe.
 */
import type { PageServerLoad } from "./$types";
import {
  cleanSequenceText,
  type SequenceRouteMeta,
} from "../../../sequence/[id]/sequence-seo";
import {
  emptySequenceMeta,
  loadPublishedMeta,
} from "../../../sequence/[id]/published-meta";
import { parseSequenceRouteId } from "$lib/shared/navigation/services/sequence-encoder";

const SITE_URL = "https://tkaflowarts.com";

export const load: PageServerLoad = async ({ params, url, platform }) => {
  const fallback: SequenceRouteMeta = {
    ...emptySequenceMeta(),
    word: cleanSequenceText(url.searchParams.get("word")),
    creator: cleanSequenceText(url.searchParams.get("creator")),
  };

  let legacyId: string | null = null;
  try {
    legacyId = parseSequenceRouteId(params.id).legacyId;
  } catch {
    // A malformed id stays a viewer error state, same as /sequence/[id].
  }

  const meta = legacyId
    ? await loadPublishedMeta(
        legacyId,
        fallback,
        platform?.env?.FIREBASE_SERVICE_ACCOUNT_JSON
      )
    : fallback;

  const canonicalUrl = `${SITE_URL}/sequence/${encodeURIComponent(params.id)}`;
  const title = meta.word
    ? `${meta.word} — Flow Arts Composer`
    : "Flow Arts Composer sequence player";

  return { meta, canonicalUrl, title };
};
