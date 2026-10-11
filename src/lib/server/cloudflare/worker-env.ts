import { building } from "$app/env";
import { env } from "cloudflare:workers";

/**
 * The Worker's bindings and variables: the R2 buckets, the rate limiters,
 * and the secrets set in the Cloudflare dashboard.
 *
 * Until adapter-cloudflare 8 these arrived on each request as
 * `event.platform.env`. The adapter now leaves `event.platform` undefined and
 * serves the same object from the Worker's `cloudflare:workers` module (under
 * `vite dev`, Wrangler's local stand-in for it). Nothing backs that module
 * while the site builds and prerenders, and reading it then throws, so this
 * returns undefined there, as `event.platform` did. Callers keep the
 * fallbacks they had for a missing binding.
 */
export function workerEnv(): Partial<Cloudflare.Env> | undefined {
  return building ? undefined : env;
}

/**
 * Cloudflare's metadata for this request (`request.cf`): the visitor's
 * country, city and coordinates. Cloudflare sets it on the incoming request
 * itself, and adapter-cloudflare 8 no longer copies it to `event.platform.cf`.
 * Undefined off Cloudflare and while prerendering.
 */
export function requestCf(
  request: Request
): Record<string, unknown> | undefined {
  return (request as Request & { cf?: Record<string, unknown> }).cf;
}
