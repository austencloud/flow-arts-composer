import { redirect } from "@sveltejs/kit";
import { effectGridDestination } from "../viewer-3d/effect-review.js";
import type { PageLoad } from "./$types";

export const load: PageLoad = ({ url }) => {
  redirect(307, effectGridDestination(url.searchParams));
};
