/**
 * Deduplicates visits to the dedicated `/q/{code}` scan route.
 *
 * Browser navigation timing cannot tell a camera scan from a typed URL or a
 * clicked link. It only distinguishes a new navigation from reload and history
 * traversal. The route is therefore the attribution boundary; this helper
 * suppresses only immediate repeat visits in the same tab. A later visit is
 * allowed because the server can recognize a new city while deduplicating the
 * same device, card, day, and place.
 */

const SCAN_ROUTE_PREFIX = "/q/";
const SCAN_ROUTE_SESSION_PREFIX = "tka:scanned:";
const ROUTE_DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

export function isFirstScanRouteVisit(
  code: string,
  physicalCardId: string | null = null
): boolean {
  if (typeof window === "undefined") return false;
  if (!window.location.pathname.startsWith(SCAN_ROUTE_PREFIX)) return false;

  const navEntries = performance.getEntriesByType?.("navigation") ?? [];
  const nav = navEntries[0] as PerformanceNavigationTiming | undefined;
  if (nav) {
    // A scan-route reload or history traversal is still the same visit.
    if (nav.type !== "navigate") return false;
  }

  return claimScanVisit(code, physicalCardId);
}

/**
 * Claims one scan of this card for the current tab or app session, unless the
 * same card was claimed within the last five minutes.
 *
 * `/q` reaches it through `isFirstScanRouteVisit`. The installed app calls it
 * directly, because Android can deliver one printed-card link twice (the
 * launch URL and `appUrlOpen`) and a WebView reload re-reads the launch URL.
 */
export function claimScanVisit(
  code: string,
  physicalCardId: string | null = null
): boolean {
  try {
    // Shared shortcodes can back many separately serialized cards. Deduplicate
    // this physical identity, not the choreography payload, so scanning two
    // different copies in one tab still produces two legitimate facts.
    const identity = physicalCardId ?? "legacy";
    const key = `${SCAN_ROUTE_SESSION_PREFIX}${code}:${identity}`;
    const now = Date.now();
    const previous = Number(sessionStorage.getItem(key));
    if (
      Number.isFinite(previous) &&
      previous > 0 &&
      now - previous < ROUTE_DUPLICATE_WINDOW_MS
    ) {
      return false;
    }
    sessionStorage.setItem(key, String(now));
  } catch {
    // With storage disabled, treat the first visit as an eligible scan.
  }

  return true;
}
