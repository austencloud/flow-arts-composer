import type { PageLoad } from "./$types";
import { browser } from "$app/env";
import type { Product } from "#lib/features/store/domain/models/product.js";

export const prerender = false;
export const ssr = true;

// Client nav still loads via the client SDK (keeps the view-transition
// holding until data-ready — see comment history above). On SSR the server
// load (+page.server.ts, Admin SDK) already provided the product; reuse it
// instead of hitting Firestore from the server-rendered pass. Dynamic import
// keeps the Firebase client loader out of the SSR module graph.
export const load: PageLoad = async ({ params, data }) => {
  // The server load returns the raw Firestore doc; it IS the products
  // collection's Product shape (see +page.server.ts).
  const serverProduct = (data?.serverProduct ?? null) as Product | null;
  if (browser) {
    const { getProductLoader } = await import(
      "#lib/features/store/get-product-loader.js"
    );
    const product = await getProductLoader().loadProduct(params.productId);
    return { product: product ?? serverProduct, productId: params.productId };
  }
  return { product: serverProduct, productId: params.productId };
};
