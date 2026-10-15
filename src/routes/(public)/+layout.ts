import { browser } from "$app/env";
import { localizedPageLocale } from "#lib/shared/i18n/seo-locales.js";
import type { LayoutLoad } from "./$types";

// Public routes are prerendered as static HTML at build time
export const prerender = true;
export const ssr = true;

// A localized page's HTML (/de/guide/...) is already in its language. Load
// that catalog before hydration so the first browser render matches it, and
// return to English on unprefixed public pages. Neither is saved to the
// visitor's cookie: public pages follow their URL.
export const load: LayoutLoad = async ({ url }) => {
  if (!browser) return {};
  const { setPageLocale } = await import("#lib/shared/i18n/i18n.svelte.js");
  await setPageLocale(localizedPageLocale(url.pathname) ?? "en");
  return {};
};
