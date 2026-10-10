import { redirect } from "@sveltejs/kit";
import { safeInternalPath } from "#lib/shared/auth/services/escape-target.js";
import type { PageLoad } from "./$types";

// The destination arrives in the request query, which does not exist during
// prerendering. Keep this bridge in the server manifest so every request gets
// its own validated redirect.
export const prerender = false;

/**
 * App deep-link bridge.
 *
 * The native app only claims https App Links for /q/, /sequence/, and /store/.
 * A link to any other route (e.g. /create/construct) can't open the installed
 * app directly, so the Android escape intent routes it through here — a claimed
 * /store/ path — carrying the real destination as ?to=. This restores it.
 *
 * safeInternalPath rejects external and protocol-relative destinations, so the
 * bridge can never be turned into an open redirect. Runs the same on web and
 * inside the app; on web it is simply a redirect.
 */
export const load: PageLoad = ({ url }) => {
  redirect(307, safeInternalPath(url.searchParams.get("to")));
};
