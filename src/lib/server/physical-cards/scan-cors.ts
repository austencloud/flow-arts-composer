/**
 * CORS for the scan ingest endpoint.
 *
 * The site's `/q` page posts same-origin and needs none of this. The installed
 * Android app loads its bundle from https://localhost (Capacitor's
 * `androidScheme: 'https'` in capacitor.config.ts) and posts scans to the site
 * by absolute URL, so its JSON POST is cross-origin and preflighted. Only that
 * origin is answered; any other origin gets no CORS grant.
 */

const NATIVE_APP_ORIGINS: ReadonlySet<string> = new Set(["https://localhost"]);

const ALLOWED_METHODS = "POST, OPTIONS";
// Content-Type for the JSON body; Authorization when a signed-in scanner is
// attributed (authedFetch sends a Firebase ID token, never cookies).
const ALLOWED_HEADERS = "Content-Type, Authorization";
const PREFLIGHT_MAX_AGE_SECONDS = "86400";

export function isScanCorsOrigin(origin: string | null): origin is string {
  return origin !== null && NATIVE_APP_ORIGINS.has(origin);
}

/** Answers the browser's preflight for a scan POST. */
export function scanPreflightResponse(request: Request): Response {
  const origin = request.headers.get("origin");
  if (!isScanCorsOrigin(origin)) {
    return new Response(null, { status: 403, headers: { Vary: "Origin" } });
  }
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": ALLOWED_METHODS,
      "Access-Control-Allow-Headers": ALLOWED_HEADERS,
      "Access-Control-Max-Age": PREFLIGHT_MAX_AGE_SECONDS,
      Vary: "Origin",
    },
  });
}

/**
 * Lets the app read the endpoint's answer, success or refusal alike, so its
 * client can report the outcome instead of a blanket network error.
 */
export function withScanCors(request: Request, response: Response): Response {
  const origin = request.headers.get("origin");
  if (!isScanCorsOrigin(origin)) return response;

  // Every response the endpoint returns is built locally (`json()` or the rate
  // limiter's `new Response()`), so its headers are mutable.
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.append("Vary", "Origin");
  return response;
}
