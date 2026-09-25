import type { PageServerLoad } from "./$types";
import { loadShopCatalogSnapshot } from "$lib/server/shop/shop-catalog-snapshot";

/**
 * The catalog, server-rendered.
 *
 * /shop used to render a "Coming soon" panel for everyone but an admin, so the
 * server had nothing to load. It's the storefront now: crawlers and the first
 * paint both need the real product list in the HTML. The snapshot leaves the
 * cover cards behind; the page paints its text and prices from it, then swaps
 * in the full catalog (covers included) from the client once it mounts.
 */
export const load: PageServerLoad = async ({ platform }) => ({
  products: await loadShopCatalogSnapshot(
    platform?.env?.FIREBASE_SERVICE_ACCOUNT_JSON
  ),
});
