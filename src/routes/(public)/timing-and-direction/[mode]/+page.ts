import { error, redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";
import {
  getTimingDirectionArticle,
  timingDirectionModeHref,
} from "../_data/timing-direction-articles";

// Each mode had its own page until Austen chose one timing-and-direction page
// (2026-10-31). The old addresses open that page on the same mode's
// sequences, and they redirect at request time with a 308.
//
// "auto" with no entries, not prerendered: the prerenderer writes every
// redirect target it follows as a file, and
// "timing-and-direction?mode=<slug>#mode-sequences.html" is not a name
// Windows allows, so the build died on d2 (2026-10-31), as the folded guide
// pages did on 2026-10-27. Nothing on the site links to these addresses.
export const prerender = "auto";

export const load: PageLoad = ({ params }) => {
  const article = getTimingDirectionArticle(params.mode);
  if (!article) error(404, "Timing and direction mode not found");
  redirect(308, timingDirectionModeHref(article.slug));
};
