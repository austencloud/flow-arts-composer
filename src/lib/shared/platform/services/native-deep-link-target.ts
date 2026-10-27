import { isScannableShortCode } from "#lib/shared/qr/domain/physical-card.js";

const SHORT_DOMAIN_HOSTS = ["tka.run", "www.tka.run"];

/**
 * The short code a printed-card link opens: `tka.run/{code}` (what cards
 * encode) or `/q/{code}` (where the Worker sends a browser). Null for every
 * other link the app claims, including the `/store/open` handoff that a
 * browser scan uses after `/q` has already recorded the scan.
 */
export function scanLinkCode(url: URL): string | null {
  const qMatch = url.pathname.match(/^\/q\/([^/?#]+)/);
  const shortDomainMatch = SHORT_DOMAIN_HOSTS.includes(
    url.hostname.toLowerCase()
  )
    ? url.pathname.match(/^\/([^/?#]+)\/?$/)
    : null;
  return qMatch?.[1] ?? shortDomainMatch?.[1] ?? null;
}

function sharedSequenceCode(url: URL): string | null {
  const match = url.pathname.match(/^\/sequence\/([^/?#]+)\/?$/);
  const id = match?.[1];
  return id && isScannableShortCode(id) ? id : null;
}

export function resolveNativeDeepLinkTarget(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const originalTarget = parsed.pathname + parsed.search + parsed.hash;
  if (!originalTarget || originalTarget === "/") return null;

  // A shared sequence link (`/sequence/{code}`, what Copy link and Show QR
  // code hand out) has no page in the app's bundle: that route loads on the
  // server, so opening it here falls back to the landing page and then
  // Create. Open its code in the in-app viewer instead. It stays out of
  // scanLinkCode, which only names printed-card scans.
  const scanCode = scanLinkCode(parsed) ?? sharedSequenceCode(parsed);
  if (!scanCode) return originalTarget;

  // A printed card carries its prop pair and physical-card identity in the
  // query string. Keep all of that scan intent when Android opens the in-app
  // viewer; dropping it makes a club card fall back to the user's saved prop.
  const searchParams = new URLSearchParams(parsed.search);
  searchParams.set("v", scanCode);
  const search = searchParams.size > 0 ? `?${searchParams.toString()}` : "";
  return `/browse/gallery${search}${parsed.hash}`;
}
