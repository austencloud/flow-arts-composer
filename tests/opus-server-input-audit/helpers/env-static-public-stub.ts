/**
 * `$env/static/public` for the audit suite.
 *
 * SvelteKit generates this module at build time; vitest has no build, so the
 * audit provides the shape the transitively-imported modules read. Values are
 * empty on purpose — the audit never contacts an external service.
 */
export const PUBLIC_GOOGLE_MAPS_API_KEY = "";
