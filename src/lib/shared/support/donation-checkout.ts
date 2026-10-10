import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "#lib/shared/auth/firebase.js";

/**
 * Starts a Stripe Checkout session for a donation of `amountCents` and returns
 * the hosted checkout URL. Mirrors the merch checkout creator; the caller
 * redirects the browser to the returned URL.
 *
 * Import this DYNAMICALLY (await import(...)) from the public /support page so
 * the firebase SDK stays out of the landing-lite bundle and only loads when the
 * visitor actually chooses to pay by card.
 */
export async function createDonationCheckout(
  amountCents: number,
  returnOrigin?: string
): Promise<string> {
  const functions = getFunctions(app);
  const fn = httpsCallable<
    { amountCents: number; returnOrigin?: string },
    { url: string }
  >(functions, "createDonationCheckout");
  const result = await fn({ amountCents, returnOrigin });
  return result.data.url;
}
