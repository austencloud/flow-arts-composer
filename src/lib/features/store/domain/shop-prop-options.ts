/**
 * shop-prop-options
 *
 * The props a buyer can order a physical deck printed with. Deliberately a
 * limited launch set (full picker taxonomy lives in
 * prop-type-display-registry); every entry here must have print-pipeline SVG
 * assets and a baked cover pass. The firebase function keeps a mirrored
 * whitelist (firebase-functions/src/merch/createMerchCheckout.ts) — update
 * both when this list changes.
 */

import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { getPropTypeDisplayInfo } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
import type { CoverCard } from "./models/product";

export const SHOP_PROP_OPTIONS: readonly PropType[] = [
  PropType.STAFF,
  PropType.CLUB,
  PropType.FAN,
  PropType.TRIAD,
  PropType.BUUGENG,
];

/** Staves are the canonical TKA prop and the pre-selected default. */
export const DEFAULT_SHOP_PROP = PropType.STAFF;

/**
 * The card-back theme every printed deck ships with today (deck-releaser-state's
 * theme getter). Lives here rather than inside the renderer because it is a fact
 * about the PRINTED product, and surfaces that depict a printed card — the shop
 * hero's live back — have to agree with the bake instead of following the
 * viewer's own background theme. When back-theme choice lands, this becomes the
 * default rather than the constant.
 */
export const SHOP_BACK_THEME = "rainbow";

export function shopPropLabel(prop: PropType): string {
  return getPropTypeDisplayInfo(prop).label;
}

export function shopPropImage(prop: PropType): string {
  return getPropTypeDisplayInfo(prop).image;
}

/**
 * Baked cover URL for a card rendered with the given prop, if one exists.
 * Staff keeps reading the legacy single `imageUrl` field (the original bake
 * predates prop choice); every prop also resolves through `propImageUrls`.
 */
export function bakedCoverUrl(card: CoverCard, prop: PropType): string | undefined {
  const perProp = card.propImageUrls?.[prop];
  if (perProp) return perProp;
  return prop === PropType.STAFF ? card.imageUrl : undefined;
}
