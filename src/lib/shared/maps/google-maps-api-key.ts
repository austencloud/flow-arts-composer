import * as staticPublicEnv from "$env/static/public";

// Read through the module namespace so a host without the key still builds.
// A named import of a missing $env/static/public value fails the whole build,
// which is why every Cloudflare preview failed: previews have no Maps key.
// Each map already shows its own "add a key" state when this is empty.
export const PUBLIC_GOOGLE_MAPS_API_KEY = (
  staticPublicEnv as Record<string, string | undefined>
).PUBLIC_GOOGLE_MAPS_API_KEY;
