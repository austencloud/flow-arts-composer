import { browser } from "$app/environment";
import type { Product } from "../domain/models/product";
import type { LoopConfig } from "../domain/loop-config";
import { trackCheckoutStarted } from "../analytics/shop-funnel";

interface ProductLoader {
  loadActiveProducts(): Promise<Product[]>;
  loadAllProducts(): Promise<Product[]>;
  loadProduct(productId: string): Promise<Product | null>;
}

interface CheckoutCreator {
  createCheckoutSession(
    productId: string,
    propType?: string,
    loopConfig?: LoopConfig
  ): Promise<string>;
}

// Module-level cache (survives component unmount/remount) so navigating from the
// grid into a product and back paints the grid on the first frame — no loading
// flash, and the view-transition reverse morph keeps its target cards. Keyed by
// the admin "all" vs public "active" set. See feedback_cache_expensive_renders.
const productsCache = new Map<"all" | "active", Product[]>();

export function createStoreState(
  productLoader: ProductLoader,
  checkoutCreator: CheckoutCreator,
  initialProduct: Product | null = null
) {
  let products = $state<Product[]>([]);
  let selectedProduct = $state<Product | null>(initialProduct);
  let isLoading = $state(false);
  let isCheckingOut = $state(false);
  let error = $state<string | null>(null);
  // Separate from `error` (which is a load error that replaces the page) so a
  // failed checkout shows inline by the Buy button instead of blanking the product.
  let checkoutError = $state<string | null>(null);

  // includeAll = admin "play with it" view: drafts + sold-out too. Public
  // buyers always get the active-only list.
  function fetchProducts(includeAll: boolean): Promise<Product[]> {
    return includeAll
      ? productLoader.loadAllProducts()
      : productLoader.loadActiveProducts();
  }

  // Cache-first: if this set was already loaded, paint it synchronously (no loading
  // state) and revalidate in the background. Only the first visit shows loading.
  // This keeps a back-navigation instant so the reverse view-transition morph lands.
  //
  // `seed` is the server's catalog snapshot (no cover cards). It stands in for
  // the cache on a first visit, so the server renders a real product page and
  // hydration paints that same page, then the fetch below brings the covers.
  // The server itself never fetches: the browser SDK has no place in an SSR
  // request, and its answer could not reach the HTML anyway.
  async function loadProducts(includeAll = false, seed: readonly Product[] = []) {
    const key = includeAll ? "all" : "active";
    const cached = productsCache.get(key) ?? (seed.length > 0 ? [...seed] : null);
    if (cached) {
      products = cached;
      isLoading = false;
      error = null;
      if (!browser) return;
      void fetchProducts(includeAll)
        .then((fresh) => {
          products = fresh;
          productsCache.set(key, fresh);
        })
        .catch((e) => console.error("[Store] Background product revalidate failed:", e));
      return;
    }
    isLoading = true;
    error = null;
    if (!browser) return;
    try {
      const fresh = await fetchProducts(includeAll);
      products = fresh;
      productsCache.set(key, fresh);
    } catch (e) {
      error = "Failed to load products. Please try again.";
      console.error("[Store] Failed to load products:", e);
    } finally {
      isLoading = false;
    }
  }

  async function loadProduct(productId: string) {
    isLoading = true;
    error = null;
    try {
      selectedProduct = await productLoader.loadProduct(productId);
      if (!selectedProduct) {
        error = "Product not found.";
      }
    } catch (e) {
      error = "Failed to load product. Please try again.";
      console.error("[Store] Failed to load product:", e);
    } finally {
      isLoading = false;
    }
  }

  async function startCheckout(
    productId: string,
    propType?: string,
    loopConfig?: LoopConfig
  ) {
    isCheckingOut = true;
    checkoutError = null;
    try {
      // Single-buy rides the same spine as the cart: a one-item draft order.
      const url = await checkoutCreator.createCheckoutSession(productId, propType, loopConfig);
      // Funnel step 4, fired between the session resolving and the redirect.
      // Deliberately NOT before the await: "checkout started" means the buyer
      // reached Stripe, so the checkout→purchase drop reads as real abandonment
      // instead of being polluted by our own session-creation failures (those
      // surface as checkoutError + a captured $exception). trackCheckoutStarted
      // beacons the event so assigning location.href on the next line can't
      // strand it in PostHog's batch queue.
      //
      // The two mobile sticky docks (LoopDeckConfiguratorPage, DeckArchitectPage)
      // call straight into here, so they are covered without their own call.
      const product =
        selectedProduct?.id === productId
          ? selectedProduct
          : (products.find((p) => p.id === productId) ?? null);
      trackCheckoutStarted({
        surface: "buy_button",
        productId,
        lineItemCount: 1,
        subtotalCents: product?.price ?? null,
        propType,
        loopConfig,
        isPreorder: product?.preorder ?? null,
      });
      window.location.href = url;
    } catch (e) {
      checkoutError = "Checkout isn't available yet. Try again later.";
      console.error("[Store] Checkout failed:", e);
    } finally {
      isCheckingOut = false;
    }
  }

  return {
    get products() { return products; },
    get selectedProduct() { return selectedProduct; },
    get isLoading() { return isLoading; },
    get isCheckingOut() { return isCheckingOut; },
    get error() { return error; },
    get checkoutError() { return checkoutError; },
    loadProducts,
    loadProduct,
    startCheckout,
  };
}

export type StoreState = ReturnType<typeof createStoreState>;
