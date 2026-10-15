import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

// The five per-prop pages merged into /notation/props on 2026-10-15. 301
// carries indexing, bookmarks, and backlinks over, and the hash opens the
// merged page with this prop already picked.
export const prerender = false;
export const load: PageLoad = () => {
  redirect(301, "/notation/props#clubs");
};
