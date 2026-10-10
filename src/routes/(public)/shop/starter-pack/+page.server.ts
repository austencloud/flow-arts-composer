import type { PageServerLoad } from "./$types";
import { loadShopCatalogSnapshot } from "#lib/server/shop/shop-catalog-snapshot.js";
import { workerEnv } from "#lib/server/cloudflare/worker-env.js";

// The catalog snapshot seeds the page, so the server renders the bundle's
// description, contents, price, and cross-sell rail instead of a loading line.
export const load: PageServerLoad = async () => ({
  products: await loadShopCatalogSnapshot(
    workerEnv()?.FIREBASE_SERVICE_ACCOUNT_JSON
  ),
});
