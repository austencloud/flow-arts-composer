import { json } from "@sveltejs/kit";
import * as publicEnv from "$app/env/public";
import type { RequestHandler } from "./$types";

/**
 * The live site's PUBLIC_ settings, for the phone app's over-the-air build
 * (scripts/write-live-public-env.mjs).
 *
 * Production values live only in the Cloudflare dashboard. SvelteKit 3 inlines
 * the static ones (PostHog, Maps) into the bundle and serves only the dynamic
 * ones at /_app/env.js, so CI has no other way to read them. Nothing here is
 * secret: static values ship in the client bundle and dynamic ones at
 * /_app/env.js.
 */
export const GET: RequestHandler = () => {
  const settings: Record<string, string> = {};
  for (const [name, value] of Object.entries(publicEnv)) {
    if (typeof value === "string") settings[name] = value;
  }
  return json(settings, { headers: { "cache-control": "no-store" } });
};
