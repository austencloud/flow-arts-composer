import * as functions from "firebase-functions";
import Stripe from "stripe";
import { defineString } from "firebase-functions/params";

const stripeSecretKey = defineString("STRIPE_SECRET_KEY");
const appBaseUrl = defineString("APP_BASE_URL", { default: "https://tkaflowarts.com" });

interface DonationRequest {
  /** Donation amount in cents (USD). */
  amountCents: number;
  /** Origin to return to after checkout (e.g. the page the visitor is on). */
  returnOrigin?: string;
}

interface DonationResponse {
  url: string;
}

// $1 floor (Stripe's minimum charge) and a $1000 ceiling so a typo / abuse can't
// create a huge session. Mirrors the validation the client does, enforced again
// server-side because the client value is untrusted.
const MIN_CENTS = 100;
const MAX_CENTS = 100_000;

// success/cancel redirect targets are attacker-influencable, so only return to a
// known origin. Anything else falls back to the configured APP_BASE_URL.
const ALLOWED_RETURN_ORIGINS = new Set([
  "https://tkaflowarts.com",
  "https://www.tkaflowarts.com",
  "https://tka.run",
  "https://localhost:5173",
  "https://localhost:5174",
  "http://localhost:5173",
  "http://localhost:5174",
]);

/**
 * Creates a one-off Stripe Checkout session for a "buy me a coffee" donation of
 * an arbitrary amount. Mirrors createMerchCheckout (same Stripe key + base URL
 * params) but builds the line item from a dynamic amount instead of a catalog
 * price, and returns to /support on success/cancel.
 */
export const createDonationCheckout = functions.https.onCall(
  async (data: DonationRequest): Promise<DonationResponse> => {
    const amountCents = Math.round(Number(data?.amountCents));

    if (!Number.isFinite(amountCents) || amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `amountCents must be an integer between ${MIN_CENTS} and ${MAX_CENTS}`
      );
    }

    const stripe = new Stripe(stripeSecretKey.value());

    // Return the visitor to wherever they started (localhost in dev, prod in
    // prod) when it's an allowed origin; otherwise the configured base URL.
    const requested = data?.returnOrigin;
    const baseUrl =
      requested && ALLOWED_RETURN_ORIGINS.has(requested)
        ? requested
        : appBaseUrl.value();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      submit_type: "donate",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Support Flow Arts Composer",
              description: "A contribution toward the development of Flow Arts Composer.",
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/support?donated=1`,
      cancel_url: `${baseUrl}/support?canceled=1`,
      metadata: { kind: "donation", amountCents: String(amountCents) },
    });

    if (!session.url) {
      throw new functions.https.HttpsError("internal", "Failed to create checkout session");
    }

    return { url: session.url };
  }
);
