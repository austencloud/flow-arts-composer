/**
 * Links and path checks for components that render on localized pages. On
 * /de/guide/ratios a guide link points at its German page, and path checks
 * read the route path (/guide/ratios). Off a localized page both pass
 * through unchanged.
 */
import { page } from "$app/state";
import { localizeHref, routePathFor } from "./seo-locales.js";

/** An internal link, kept in the current page's language when it can be. */
export function localHref(href: string): string {
  return localizeHref(href, page.url);
}

/** The route path the current URL renders. */
export function currentRoutePath(): string {
  return routePathFor(page.url.pathname);
}
