import { dev } from "$app/environment";
import { redirect } from "@sveltejs/kit";
import type { LayoutLoad } from "./$types";

// This reset layout bypasses /test's parent load, so it repeats the dev guard.
export const ssr = false;
export const prerender = false;

export const load: LayoutLoad = () => {
  if (!dev) redirect(307, "/browse/gallery");
  return {};
};
