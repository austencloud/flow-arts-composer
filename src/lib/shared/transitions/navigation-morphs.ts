import { LAUNCHPAD_TILES } from "$lib/shared/landing/components/launchpad/launchpad-tiles";

/** Landing destinations with a shared-element counterpart on the home page. */
export const LAUNCHPAD_MORPH_PATHS: readonly string[] = Object.freeze(
  LAUNCHPAD_TILES.filter((tile) => tile.morphName).map((tile) => tile.href)
);

const launchpadMorphPaths = new Set(LAUNCHPAD_MORPH_PATHS);

type RouteLocation = {
  url: Pick<URL, "pathname">;
  route: { id: string | null };
};

const SHOP_INDEX_PATH = "/shop";

/**
 * Shop paths that live under /shop but are not a product, so a morph from the
 * index would have no shared participant to match.
 */
const SHOP_NON_PRODUCT_PATHS = new Set(["/shop/success"]);

function isRouteWithin(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

/**
 * True only when both ends of a client navigation provide the same named
 * transition participant. Keeping this pure makes allowlist drift testable.
 */
export function navigationMorphs(
  from: RouteLocation | null | undefined,
  to: RouteLocation | null | undefined
): boolean {
  if (!from || !to || from.url.pathname === to.url.pathname) return false;

  const a = from.url.pathname;
  const b = to.url.pathname;
  const sequencePair = (x: string, y: string): boolean =>
    isRouteWithin(x, "/browse") && isRouteWithin(y, "/sequence");
  if (sequencePair(a, b) || sequencePair(b, a)) return true;

  // Match on path, not route id. Every shipped product has its own bespoke
  // route (/shop/loop-deck, /shop/tnd-trilogy, ...) rather than going through
  // the generic /shop/[productId] fallback, so an exact route-id pair matched
  // nothing real and no transition ever started for shop navigation. A path
  // test covers the bespoke routes and the fallback alike, and keeps covering
  // them as products are added.
  const isShopProduct = (x: RouteLocation): boolean =>
    isRouteWithin(x.url.pathname, SHOP_INDEX_PATH) &&
    x.url.pathname !== SHOP_INDEX_PATH &&
    !SHOP_NON_PRODUCT_PATHS.has(x.url.pathname);
  const shopProductPair = (x: RouteLocation, y: RouteLocation): boolean =>
    x.url.pathname === SHOP_INDEX_PATH && isShopProduct(y);
  if (shopProductPair(from, to) || shopProductPair(to, from)) return true;

  const launchpadPair = (x: string, y: string): boolean =>
    x === "/" && launchpadMorphPaths.has(y);
  return launchpadPair(a, b) || launchpadPair(b, a);
}
