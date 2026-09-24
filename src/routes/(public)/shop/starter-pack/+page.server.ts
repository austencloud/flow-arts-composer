import type { PageServerLoad } from "./$types";
import { loadShopCatalogSnapshot } from "$lib/server/shop/shop-catalog-snapshot";

// The catalog snapshot seeds the page, so the server renders the bundle's
// description, contents, price, and cross-sell rail instead of a loading line.
export const load: PageServerLoad = async ({ platform }) => ({
  products: await loadShopCatalogSnapshot(
    platform?.env?.FIREBASE_SERVICE_ACCOUNT_JSON
  ),
});
