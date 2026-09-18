import { redirect } from "@sveltejs/kit";
import type { EntryGenerator, PageLoad } from "./$types";
import { GUIDE_BODY_PAGES } from "../_data/guide-manifest";

/**
 * One prerendered route per Level-1 topic - the crawlable + interactive guide
 * surface (spec: 2026-07-14-guide-crawlable-paginated-reader-design.md). `entries`
 * enumerates every body page so SvelteKit prerenders them all even before a
 * prerendered index links them. Static siblings (/print, /book) keep precedence
 * over this dynamic [slug] (SvelteKit routes specific-over-dynamic).
 */
export const prerender = true;

/**
 * Legacy guide slug -> its current slug. The two-hand "position" concept was
 * renamed to "placement" with no route migration, so a bookmarked or indexed
 * old URL 404s unless it is explicitly redirected. Extend this table the next
 * time a guide slug changes.
 */
const LEGACY_GUIDE_SLUGS: Readonly<Record<string, string>> = {
  "hand-positions": "hand-placements",
  "staff-positions": "staff-placements",
};

export const entries: EntryGenerator = () => [
  ...GUIDE_BODY_PAGES.map((p) => ({ slug: p.id })),
  ...Object.keys(LEGACY_GUIDE_SLUGS).map((slug) => ({ slug })),
];

export const load: PageLoad = ({ params }) => {
  const currentSlug = LEGACY_GUIDE_SLUGS[params.slug];
  if (currentSlug) {
    redirect(308, `/guide/level-1/${currentSlug}`);
  }
  return { slug: params.slug };
};
