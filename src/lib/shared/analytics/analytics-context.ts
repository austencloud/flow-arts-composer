/**
 * Analytics Route Context
 *
 * Every custom event in the landing/shop taxonomy carries a `page` property so
 * events segment by surface. That value is always `page.route.id` — the
 * SvelteKit route *pattern* (`/shop/[id]`, `/(public)/composer`) — and never
 * `page.url.pathname`. PostHog already attaches `$current_url` to every event,
 * but that carries query strings and real ids (`/shop/loop-deck-mild?ref=x`),
 * which explodes as a breakdown dimension. Route ids are a bounded set of ~60
 * values that stays bounded as the site grows, so they're the segmentation key
 * and `$current_url` is left for drill-down.
 *
 * Deriving this in one place means the five analytics workstreams can't each
 * pick a slightly different route string.
 *
 * Spec: docs/architecture/landing-analytics-taxonomy.md §2
 */

import { browser } from "$app/env";
import { page } from "$app/state";

/** Route id we fall back to when there is no request context to read. */
export const UNKNOWN_ROUTE = "unknown";

/**
 * The current SvelteKit route pattern, safe to call from anywhere.
 *
 * `$app/state`'s `page` is bound to the request via component context on the
 * server and throws outright if read outside a component render. Analytics only
 * ever fires from the browser, so short-circuit rather than let a stray SSR call
 * site crash a page render. This is an SSR-safety guard, not a dev gate — the
 * dev gating lives in `captureEvent` and stays there.
 */
export function analyticsRoute(): string {
  if (!browser) return UNKNOWN_ROUTE;
  return page.route.id ?? UNKNOWN_ROUTE;
}

/**
 * Merge the base route property into an event's own properties.
 *
 * An explicit `page` in `props` wins, so a call site that already knows its
 * surface (the /composer CTAs pass `page: "composer"`) keeps its value.
 */
export function withRoute(
  props?: Record<string, unknown>
): Record<string, unknown> {
  return { page: analyticsRoute(), ...props };
}
