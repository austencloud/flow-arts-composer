/**
 * Tag a link to this site as it leaves the app, so the visit it brings back
 * says where it came from.
 *
 * Phone visitors mostly arrive with no referrer at all: Instagram's in-app
 * browser and most messaging apps strip it. A UTM tag survives that, and both
 * PostHog (`utm_*` on the first pageview, `$initial_utm_*` on the person) and
 * the visit report (`visit-report.ts`) already read it. Nothing else here has
 * to change to see the tags.
 *
 * What is never tagged, and why:
 * - `tka.run/<code>` and `/q/<code>`. They are the QR scan path. Every printed
 *   card encodes the bare URL, `/q/` counts each hit as a card scan, and the
 *   redirect worker has to stay a dumb, fast hop. A tag would not tell a copied
 *   link from a scan anyway, because `/q/` cannot tell them apart.
 * - Other sites. A tag only means something to our own analytics.
 * - Anything that does not parse. The link goes out unchanged rather than not
 *   at all.
 *
 * `/sequence/<id>` is safe to tag: the page reads its own named parameters and
 * the viewer's address-bar writer only touches its own keys, so `utm_*` rides
 * along untouched.
 *
 * Search terms checked before writing this (never-hand-roll): utm, campaign,
 * outbound, share link, post link. No existing owner; the read side lives in
 * `visit-report.ts`.
 */

/** How the link left: copied as text, or handed to the device's share sheet. */
export type OutboundLinkMedium = "copy_link" | "share_sheet";

/**
 * `utm_source` for every in-app share. The app cannot know which app the
 * person pastes into, so the source names the app, and the medium says how.
 * Links Austen posts by hand use the platform as the source instead (see
 * docs/reference/honest-visitor-numbers.md).
 */
export const IN_APP_SHARE_SOURCE = "app_share";
export const IN_APP_SHARE_CAMPAIGN = "sequence_share";

const OWN_HOST_SUFFIX = "tkaflowarts.com";
const SCAN_HOST = "tka.run";
const SCAN_PATH_PREFIX = "/q/";

function isOwnSiteHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === OWN_HOST_SUFFIX || host.endsWith(`.${OWN_HOST_SUFFIX}`)) {
    return true;
  }
  // Links built from window.location.origin on a dev or preview server.
  return (
    typeof location !== "undefined" &&
    host === location.hostname.toLowerCase()
  );
}

export function tagOutboundLink(
  url: string,
  medium: OutboundLinkMedium,
  campaign: string = IN_APP_SHARE_CAMPAIGN
): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return url;
  if (parsed.hostname.toLowerCase() === SCAN_HOST) return url;
  if (parsed.pathname.startsWith(SCAN_PATH_PREFIX)) return url;
  if (!isOwnSiteHost(parsed.hostname)) return url;

  // `set`, not `append`: a link that arrived tagged and is shared again now
  // credits this share, which is where the next visitor actually came from.
  parsed.searchParams.set("utm_source", IN_APP_SHARE_SOURCE);
  parsed.searchParams.set("utm_medium", medium);
  parsed.searchParams.set("utm_campaign", campaign);
  return parsed.toString();
}
