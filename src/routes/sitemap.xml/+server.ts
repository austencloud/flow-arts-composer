import { LANDING_DOMAIN } from "../../config/domains";
import { GUIDE_BODY_PAGES } from "../(public)/guide/level-1/_data/guide-manifest";
import { TIMING_DIRECTION_ARTICLE_SLUGS } from "../(public)/timing-and-direction/_data/timing-direction-articles";
import {
  fromFirestoreFields,
  getFirestoreRest,
} from "$lib/server/firestore/firestore-rest";
import type { RequestHandler } from "./$types";

interface SitemapEntry {
  url: string;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const pages: SitemapEntry[] = [
  // Landing page (canonical — /landing duplicates this and is dropped)
  { url: "" },
  // Shop
  { url: "shop" },
  { url: "shop/loop-deck" },
  { url: "shop/tnd-trilogy" },
  // /shop/choreography-cards redirects (308) to /shop after the explainer moved
  // into the product pages. A redirected URL doesn't self-list.
  // Pillar pages (SEO content roadmap)
  { url: "composer" },
  { url: "timing-and-direction" },
  // The archive, rebuilt as a chronological catalog and un-gated 2026-07-27
  // (2026-07-26-notation-catalog-design.md), moved from /notation to /history
  // on 2026-09-03. /notation 301s here and is omitted, same as /roots below.
  { url: "history" },
  // Per-prop notation pages (2026-07-16-per-prop-notation-pages-design.md)
  { url: "notation/staves" },
  { url: "notation/fans" },
  { url: "notation/clubs" },
  { url: "notation/buugeng" },
  { url: "notation/poi" },
  { url: "shape-engine" },
  // /notation/loops is gated in production (404 via its +page.server.ts) while
  // the LOOP algebra page gets rebuilt. Un-gate before re-listing it.
  { url: "notation/caps" },
  // The Kinetic Atlas is behind a noindex Coming Soon gate while it is rebuilt.
  // Re-list it when the production gate is removed.
  // The staff choreography article is deliberately absent while it awaits
  // human review (2026-07-27). Its production route carries noindex.
  // /roots redirects (301) to /notation and is intentionally omitted here, same
  // convention as /landing above — a redirected URL doesn't self-list.
  { url: "roots/software" },
  // Marketing
  { url: "about" },
  { url: "faq" },
  // /support is noindex (see support/+page.svelte) — omitted to avoid a
  // sitemap↔robots "index this / don't index this" conflict.
  // Guide — the indexable, reflowable article routes (the /print + /book
  // replicas are noindex; the canonical is the article, so only these are listed)
  { url: "guide" },
  // Level-1 topic routes are enumerated dynamically from the manifest below
  // (guideLevel1Entries) — each is a prerendered /guide/level-1/<slug> page that
  // is BOTH the crawlable SEO surface and the interactive reader (prerender +
  // hydrate). Both the mobile-first and sheet-fallback variants are included;
  // see 2026-07-14-guide-crawlable-paginated-reader-design.md.
  // The downloadable guide PDFs — indexed directly so "what we have" is
  // discoverable, and so a doorway page + its PDF can both surface in search.
  { url: "guides/level-1.pdf" },
  { url: "guides/level-2.pdf" },
  { url: "guides/level-3.pdf" },
  { url: "guide/level-2" },
  { url: "guide/level-2/turns" },
  { url: "guide/level-2/double-turns" },
  { url: "guide/ratios" },
  { url: "guide/codex" },
];

/**
 * Every Level-1 topic route (/guide/level-1/<slug>), enumerated from the manifest
 * so a new body page is listed automatically. This covers both the mobile-first
 * reflow pages and the sheet-fallback pages.
 */
const guideLevel1Entries = GUIDE_BODY_PAGES.map((p) => ({
  url: `guide/level-1/${p.id}`,
}));

const timingDirectionEntries = TIMING_DIRECTION_ARTICLE_SLUGS.map((slug) => ({
  url: `timing-and-direction/${slug}`,
}));

/**
 * Curated sequences: cards released into a physical/printable deck
 * (`deckReleases/counter/manifests/{deckNumber}`, written by the deck
 * releaser — see DeckRelease.ts) are the released-deck definition of
 * "curated." Each manifest's `sequences[].sequenceId` is a real published
 * sequence, linkable at /sequence/{sequenceId} — the exact document id the
 * `/sequence/[id]` loader (`+page.server.ts`'s `loadPublishedMeta`) already
 * resolves meta from, and the id `buildSequenceSeo` echoes back as its own
 * `<link rel="canonical">` (self-referential: canonical = whatever id the
 * route was requested with). Emitting that same id here means the sitemap
 * URL and the page's declared canonical are byte-identical — no redirect
 * chain — without depending on a short code existing for every card (short
 * codes are minted lazily by client interaction and are not guaranteed to
 * exist for a freshly released deck).
 *
 * Firestore REST query (the admin-SDK client reads `process.env` directly,
 * which is unset on Cloudflare Pages — the platform-scoped credential lives
 * on `event.platform.env` instead), capped at 200, falls back to [] on any
 * failure so a Firestore/credentials outage never 500s the sitemap.
 */
async function getCuratedSequenceUrls(
  platformCredential?: string
): Promise<string[]> {
  try {
    const firestore = getFirestoreRest(platformCredential);
    const { documents } = await firestore.listDocuments(
      "deckReleases/counter/manifests",
      { pageSize: 200, fieldPaths: ["sequences"] }
    );

    const ids = new Set<string>();
    outer: for (const doc of documents) {
      const manifest = fromFirestoreFields(doc.fields ?? {});
      const sequences = Array.isArray(manifest.sequences)
        ? (manifest.sequences as { sequenceId?: unknown }[])
        : [];
      for (const card of sequences) {
        if (typeof card?.sequenceId === "string" && card.sequenceId) {
          ids.add(card.sequenceId);
        }
        if (ids.size >= 200) break outer;
      }
    }

    return [...ids].map((id) => `sequence/${encodeURIComponent(id)}`);
  } catch (error) {
    // Non-fatal: the sitemap must never 500 on a Firestore/credentials
    // outage, but a silent catch here is exactly how this went unnoticed —
    // production served zero /sequence/ URLs with no trace. Log with
    // context so a future regression shows up in server logs instead.
    console.error(
      "[sitemap] getCuratedSequenceUrls failed:",
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

export const GET: RequestHandler = async (event) => {
  // Optional chaining starts at `event` itself, not just `.platform`: an
  // existing unit test (tests/unit/seo-indexing-controls.test.ts) calls this
  // handler with no arguments at all to check the static entries, same as it
  // did before this handler read anything off the request event.
  const curatedUrls = await getCuratedSequenceUrls(
    event?.platform?.env?.FIREBASE_SERVICE_ACCOUNT_JSON
  );

  const allEntries: SitemapEntry[] = [
    ...pages,
    ...timingDirectionEntries,
    ...guideLevel1Entries,
    ...curatedUrls.map((url) => ({ url })),
  ];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${allEntries
    .map(
      (page) => `
  <url>
    <loc>${xmlEscape(`${LANDING_DOMAIN}/${page.url}`)}</loc>
  </url>`
    )
    .join("")}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
