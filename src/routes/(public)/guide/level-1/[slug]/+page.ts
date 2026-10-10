import { error, redirect } from "@sveltejs/kit";
import type { EntryGenerator, PageLoad } from "./$types";
import { GUIDE_BODY_PAGES } from "../_data/guide-manifest";

export const prerender = true;

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
  // An unknown slug used to render the chapter frame around nothing, as a
  // 200 that search engines could index. It is a missing page.
  if (!GUIDE_BODY_PAGES.some((page) => page.id === params.slug)) {
    error(404, "Level 1 guide topic not found");
  }
  return { slug: params.slug };
};
