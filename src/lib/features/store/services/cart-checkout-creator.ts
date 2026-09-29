import type { CheckoutItem } from "../state/shop-cart.svelte";

// Every shop page imports this through the cart drawer, but it only runs when
// a buyer presses Checkout. Loading Firebase here keeps it off the shop's
// first download. The import() names the Firebase modules themselves: the
// build's small-chunk merge (vite.config.ts) can fold a small wrapper module
// back into the page.
export async function createCartCheckoutSession(items: CheckoutItem[]): Promise<string> {
  const { getFunctions, httpsCallable } = await import("firebase/functions");
  const { app } = await import("$lib/shared/auth/firebase");
  const functions = getFunctions(app);
  const createCartCheckout = httpsCallable<{ items: CheckoutItem[] }, { url: string }>(
    functions,
    "createCartCheckout"
  );
  const result = await createCartCheckout({ items });
  return result.data.url;
}
