import { error } from "@sveltejs/kit";
import type { EntryGenerator, PageLoad } from "./$types";
import {
  LEVEL2_TOPIC_PAGES,
  level2TopicPageForSlug,
} from "../_data/level2-topic-manifest";

/**
 * One prerendered route per Level-2 topic — the same crawlable-per-topic
 * pattern as `/guide/level-1/[slug]` (see that route's +page.ts), mirrored
 * here so each Level-2 topic can rank on its own instead of only existing as
 * one section inside the long `/guide/level-2/turns` / `/double-turns`
 * pages. `entries` enumerates every topic so SvelteKit prerenders them all.
 * Static siblings (/turns, /double-turns, /book, /print) keep precedence
 * over this dynamic [slug] (SvelteKit routes specific-over-dynamic).
 */
export const prerender = true;

export const entries: EntryGenerator = () =>
  LEVEL2_TOPIC_PAGES.map((p) => ({ slug: p.slug }));

export const load: PageLoad = ({ params }) => {
  const page = level2TopicPageForSlug(params.slug);
  if (!page) error(404, "Level 2 guide topic not found");
  return { slug: params.slug };
};
