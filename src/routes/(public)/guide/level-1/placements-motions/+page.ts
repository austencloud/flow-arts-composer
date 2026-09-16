import { redirect } from "@sveltejs/kit";

// Legacy animated-sections route - retired in favor of the in-app reader.
export const prerender = true;

export function load(): never {
  redirect(308, "/learn/guide/the-grid");
}
