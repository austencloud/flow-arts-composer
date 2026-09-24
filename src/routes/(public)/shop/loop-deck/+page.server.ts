import type { PageServerLoad } from "./$types";
import { loadShopCatalogSnapshot } from "$lib/server/shop/shop-catalog-snapshot";

// The catalog snapshot seeds the configurator, so the server renders the
// price, the packs, and the cross-sell rail instead of a loading line.
export const load: PageServerLoad = async ({ platform }) => ({
  products: await loadShopCatalogSnapshot(
    platform?.env?.FIREBASE_SERVICE_ACCOUNT_JSON
  ),
});
