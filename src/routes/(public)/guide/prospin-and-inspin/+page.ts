import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

export const prerender = false;

export const load: PageLoad = () => {
  // Prospin and Inspin folded into Level 1's Staff Motions on 2026-10-11; old
  // links and search results land on the note that closes that page.
  redirect(301, "/guide/level-1/staff-motions");
};
