import { error, redirect } from "@sveltejs/kit";
import type { EntryGenerator, PageLoad } from "./$types";
import { GUIDE_BODY_PAGES } from "../_data/guide-manifest";

// "auto", not true: a page the web folds into another (`web.into`) answers
// with a redirect that carries `?screen=`, and the prerenderer writes every
// redirect target it follows as a file. "hm-type1?screen=6.html" is not a
// name Windows allows, so the build died on d2 (2026-10-27). Folded pages
// stay out of the entries and redirect at request time instead; every other
// slug is still prerendered.
export const prerender = "auto";

const LEGACY_GUIDE_SLUGS: Readonly<Record<string, string>> = {
  "hand-positions": "hand-placements",
  "staff-positions": "staff-placements",
};

export const entries: EntryGenerator = () => [
  ...GUIDE_BODY_PAGES.filter((p) => !p.web).map((p) => ({ slug: p.id })),
  ...Object.keys(LEGACY_GUIDE_SLUGS).map((slug) => ({ slug })),
];

export const load: PageLoad = ({ params }) => {
  const currentSlug = LEGACY_GUIDE_SLUGS[params.slug];
  if (currentSlug) {
    redirect(308, `/guide/level-1/${currentSlug}`);
  }
  // A print page the web folds into another opens that page's screen.
  const folded = GUIDE_BODY_PAGES.find((page) => page.id === params.slug)?.web;
  if (folded) {
    const screen = folded.screen ? `?screen=${folded.screen}` : "";
    redirect(308, `/guide/level-1/${folded.into}${screen}`);
  }
  // An unknown slug used to render the chapter frame around nothing, as a
  // 200 that search engines could index. It is a missing page.
  if (!GUIDE_BODY_PAGES.some((page) => page.id === params.slug)) {
    error(404, "Level 1 guide topic not found");
  }
  return { slug: params.slug };
};
