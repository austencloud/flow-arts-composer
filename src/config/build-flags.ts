/**
 * Runtime readers for the compile-time feature constants.
 *
 * Vite's `define` map replaces `__FEATURE_*__` textually, so a guard written
 * inline against the constant folds away entirely. Inline constants are
 * therefore still correct wherever the goal is to make code VANISH from the
 * production client bundle.
 *
 * Route load guards are a different job: they must REDIRECT, and their behavior
 * has to be provable in both states. Vitest loads `vite.config.ts`, so the same
 * define map inlines `__FEATURE_COVEN__` as `true` under `NODE_ENV=test` and
 * the disabled branch becomes unreachable from a test. Reading the constant
 * through this module gives those guards a seam a test can mock, without
 * introducing a second source of truth — the value still comes from the one
 * decision made in `feature-flags.ts`.
 */

import { dev } from "$app/env";
import { redirect } from "@sveltejs/kit";

/** True when this build ships the unfinished Coven hub route. */
export function isCovenBuildEnabled(): boolean {
  return typeof __FEATURE_COVEN__ !== "undefined" && __FEATURE_COVEN__;
}

/**
 * Where an internal-only route sends a production visitor.
 *
 * One destination for every guarded surface, so the redirect target can't
 * drift route by route.
 */
export const INTERNAL_ROUTE_FALLBACK = "/browse/gallery";

/**
 * Guard for a route that exists only for development — scratch harnesses,
 * one-off render pages, retro experiments, unfinished hubs.
 *
 * Pair this with `emptyClientRouteComponents` on the owning feature (or an
 * entry in GUARDED_DEV_ROUTE_PATTERNS). The build empties the page component
 * so its implementation never ships; this guard is what keeps the now-empty
 * route from rendering a blank page to whoever typed the URL.
 *
 * `dev` is statically false in a production build, so the whole check folds
 * away to an unconditional redirect — verified in the built route nodes.
 *
 * NOT for outward-facing routes that merely look internal. `/embed/spinner`
 * is the standing example: third parties iframe it, so it stays public even
 * though it sits under a dev-sounding path.
 */
export function guardInternalRoute(): void {
  if (!dev) redirect(307, INTERNAL_ROUTE_FALLBACK);
}
