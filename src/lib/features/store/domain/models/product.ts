import type { Timestamp } from "firebase/firestore";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

export type ProductType =
  | "physical-deck"
  | "sampler-pack"
  | "digital"
  | "guide"
  | "material"
  | "poster";

export type ProductStatus = "active" | "draft" | "sold-out";

/** One cover card: the sequence plus the frame styling the printed card gets
 *  (TnD element accent for trilogy decks, LOOP flavor color for LOOP decks). */
export interface CoverCard {
  readonly sequence: SequenceData;
  /** Frame accent color. Neutral print gray when absent. */
  readonly accentColor?: string;
  readonly darkComplement?: string;
  /** Card interior tint opacity (TnD elements carry a tuned value). */
  readonly tintOpacity?: number;
  /** Footer element icon (TnD decks). */
  readonly iconPath?: string;
  /** Footer center label (e.g. "Split-Same" or "Rotated LOOP"). */
  readonly footerCenter?: string;
  /** Baked render of this card front (Firebase Storage URL). When present the
   *  fan loads this image directly instead of running the print pipeline in
   *  the visitor's browser. Written by the admin cover bake. Legacy staff-prop
   *  render; per-prop bakes live in propImageUrls. */
  readonly imageUrl?: string;
  /** Baked renders keyed by PropType value (staff/club/fan/...), one per
   *  offered shop prop (see shop-prop-options). Written by the admin bake. */
  readonly propImageUrls?: Record<string, string>;
}

export interface Product {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly type: ProductType;
  readonly price: number;
  /** Only decks/samplers carry a card count; guides and materials don't. */
  readonly cardCount?: number;
  readonly deckId?: string;
  /** Empty until a Stripe Price is created for this product (set on publish). */
  readonly stripePriceId: string;
  readonly status: ProductStatus;
  readonly previewImageUrls: string[];
  readonly coverImageUrl?: string;
  /** A representative sequence (steps) from the deck, embedded so the grid card
   *  renders its tip-path mandala cover without a second Firestore read. Decks only. */
  readonly coverSequence?: { steps: unknown[] };
  /** Curated cover cards (full sequence doc + frame accent/footer), rendered
   *  through the REAL print pipeline as a fan. Takes precedence over
   *  coverSequence. Decks only. */
  readonly coverCards?: CoverCard[];
  /** LOOP component ids for this deck's flavor (enum string values, e.g.
   *  ["mirrored","swapped"]) — drives the color-coded chips. */
  readonly loopComponents?: string[];
  /** Products sharing a listing collapse into ONE storefront entry (the deck
   *  configurator). They stay individually purchasable backing SKUs. */
  readonly listing?: string;
  /** Physical box contents, one line each — rendered as the what's-in-the-box
   *  check-list on bundle listings (the starter pack). */
  readonly boxContents?: string[];
  /** True when the deck is sold ahead of printing; pairs with shipBy. From Stripe metadata. */
  readonly preorder?: boolean;
  /** Human ship-by label shown on pre-order products, e.g. "September 2026". From Stripe metadata. */
  readonly shipBy?: string;
  /** Post-cutoff Stripe price. Set by the `tier=regular` price.* sync. Absent ⇒
   *  no swap. `stripePriceId`/`price` are the preorder (pre-cutoff) price. */
  readonly regularStripePriceId?: string;
  /** Post-cutoff display price in cents (matches `price`). Set alongside
   *  `regularStripePriceId`. */
  readonly regularPrice?: number;
  /** ISO instant the preorder price jumps to the regular price, e.g.
   *  "2026-09-30T23:59:59-05:00". From Stripe product metadata. Absent ⇒ evergreen. */
  readonly preorderPriceCutoff?: string;
  readonly sortOrder: number;
}

export interface Order {
  readonly id: string;
  readonly stripeSessionId: string;
  readonly stripePaymentIntentId: string;
  readonly customerEmail: string;
  readonly shippingAddress: ShippingAddress;
  readonly items: readonly OrderItem[];
  readonly totalAmount: number;
  readonly status: "paid" | "shipped" | "delivered";
  readonly createdAt: Timestamp;
  readonly shippedAt?: Timestamp;
  readonly trackingNumber?: string;
}

export interface OrderItem {
  readonly productId: string;
  readonly productName: string;
  readonly quantity: number;
  readonly unitPrice: number;
  /** Buyer's chosen print prop (PropType value, e.g. "club"). Absent on
   *  pre-prop-picker orders and non-deck items; treat as "staff". */
  readonly propType?: string;
  /** LOOP configurator dials (flat metadata strings). Absent on non-LOOP items. */
  readonly loopLevel?: string;
  readonly loopLength?: string;
  readonly loopFlavor?: string;
  /** JSON of the advanced-panel choices; present only when it was touched. */
  readonly loopCustom?: string;
}

export interface ShippingAddress {
  readonly name: string;
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
  readonly country: string;
}

/** A line in a pre-payment draft order (orders/{id} with status "pending").
 *  Written server-side by createCartCheckout; the webhook flips the doc to
 *  paid. Distinct from OrderItem (the legacy metadata-reconstructed shape). */
export type DraftOrderLine =
  | {
      readonly kind: "sku";
      readonly productId: string;
      readonly stripePriceId: string;
      readonly name: string;
      readonly unitPrice: number;
      readonly qty: number;
      readonly propType?: string;
    }
  | {
      readonly kind: "loopDeck";
      readonly productId: string;
      readonly stripePriceId: string;
      readonly name: string;
      readonly unitPrice: number;
      readonly qty: 1;
      readonly propType?: string;
      readonly loopConfig: Record<string, unknown>;
      /** Reserved for the approve/reject preview phase. */
      readonly sequenceIds?: string[];
    };

export type DraftOrderStatus = "pending" | "paid" | "expired";

export interface DraftOrder {
  readonly id: string;
  readonly status: DraftOrderStatus;
  readonly lineItems: readonly DraftOrderLine[];
  readonly subtotal: number;
  readonly stripeSessionId?: string;
  readonly stripePaymentIntentId?: string;
  readonly customerEmail?: string;
  readonly shippingAddress?: ShippingAddress | null;
  readonly totalAmount?: number;
}
