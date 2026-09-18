import { redirect } from "@sveltejs/kit";

// Legacy slug - the two-hand "position" concept was renamed to "placement".
export const prerender = true;

export function load(): never {
  redirect(308, "/guide/level-1/placements-motions");
}
