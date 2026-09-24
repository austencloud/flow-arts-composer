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

export function resolveNativeDeepLinkTarget(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const originalTarget = parsed.pathname + parsed.search + parsed.hash;
  if (!originalTarget || originalTarget === "/") return null;

  const scanCode = scanLinkCode(parsed);
  if (!scanCode) return originalTarget;

  // A printed card carries its prop pair and physical-card identity in the
  // query string. Keep all of that scan intent when Android opens the in-app
  // viewer; dropping it makes a club card fall back to the user's saved prop.
  const searchParams = new URLSearchParams(parsed.search);
  searchParams.set("v", scanCode);
  const search = searchParams.size > 0 ? `?${searchParams.toString()}` : "";
  return `/browse/gallery${search}${parsed.hash}`;
}
