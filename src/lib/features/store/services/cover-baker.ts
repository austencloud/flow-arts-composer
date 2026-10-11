/**
 * cover-baker
 *
 * Bakes shop cover-card fronts into Firebase Storage so public visitors load
 * plain <img> URLs instead of running the print pipeline in their browser
 * (the /shop fan used to render 12+ cards from scratch per fresh session).
 *
 * Admin-only: renders each unbaked cover through the REAL print pipeline
 * (renderCoverFront — pixel-identical to what ships), uploads the PNG, and
 * writes the download URL back onto the product doc's coverCards entry.
 * DeckFanCover prefers the baked URL and falls back to live rendering, so
 * unbaked/new products keep working.
 *
 * One pass PER SHOP PROP (see shop-prop-options): the composition worker holds
 * one prop asset bundle at a time, so the bake seeds per prop and renders all
 * products' cards for that prop before moving on. Storage layout stays flat
 * under shop-covers/{productId}/ (the storage rule matches a single filename
 * segment): the legacy staff bake lives at {index}.png, per-prop bakes at
 * {index}-{prop}.png.
 *
 * Re-bake: clear imageUrl / propImageUrls fields to force a re-render (the
 * bake only fills missing URLs).
 */

import { doc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getFirestoreInstance, getStorageInstance } from "#lib/shared/auth/firebase.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { Product, CoverCard } from "../domain/models/product";
import { SHOP_PROP_OPTIONS, bakedCoverUrl } from "../domain/shop-prop-options";
import { renderCoverFront, prewarmCovers } from "./cover-front-renderer";

export interface BakeProgress {
  readonly totalCards: number;
  readonly bakedCards: number;
  readonly currentProduct: string | null;
  readonly errors: string[];
}

function unbakedFor(cards: readonly CoverCard[] | undefined, prop: PropType): CoverCard[] {
  return (cards ?? []).filter((c) => c.sequence && !bakedCoverUrl(c, prop));
}

/** Count of (card, prop) renders across products that still need baking. */
export function countUnbaked(products: readonly Product[]): number {
  return SHOP_PROP_OPTIONS.reduce(
    (n, prop) => n + products.reduce((m, p) => m + unbakedFor(p.coverCards, prop).length, 0),
    0
  );
}

function storagePath(productId: string, index: number, prop: PropType): string {
  // Staff keeps the legacy flat name so already-baked files stay canonical.
  return prop === PropType.STAFF
    ? `shop-covers/${productId}/${index}.png`
    : `shop-covers/${productId}/${index}-${prop}.png`;
}

/**
 * Bake every unbaked (card, prop) combination across the given products.
 * Sequential per card (the renderer already lane-throttles); one worker seed
 * per prop; progress via callback.
 */
export async function bakeCoverImages(
  products: readonly Product[],
  onProgress?: (p: BakeProgress) => void
): Promise<BakeProgress> {
  const progress: {
    totalCards: number;
    bakedCards: number;
    currentProduct: string | null;
    errors: string[];
  } = {
    totalCards: countUnbaked(products),
    bakedCards: 0,
    currentProduct: null,
    errors: [],
  };
  if (progress.totalCards === 0) return progress;

  const firestore = await getFirestoreInstance();
  const storage = await getStorageInstance();

  // Live card state per product: earlier prop passes update the doc, so later
  // passes must build their write from THIS map, not the stale `products`
  // snapshot — spreading a stale card would drop the URLs a prior pass baked.
  const live = new Map<string, CoverCard[]>(
    products.map((p) => [p.id, [...(p.coverCards ?? [])]])
  );

  for (const prop of SHOP_PROP_OPTIONS) {
    const targets = products.filter(
      (p) => unbakedFor(live.get(p.id), prop).length > 0
    );
    if (!targets.length) continue;

    // Seed the composition worker for THIS prop's renders (re-seeds the pool).
    prewarmCovers(targets.flatMap((p) => live.get(p.id) ?? []), prop);

    for (const product of targets) {
      progress.currentProduct = `${product.name} · ${prop}`;
      onProgress?.({ ...progress });

      const cards = live.get(product.id) ?? [];
      const updated: CoverCard[] = [];
      let changed = false;

      for (const [i, card] of cards.entries()) {
        if (!card.sequence || bakedCoverUrl(card, prop)) {
          updated.push(card);
          continue;
        }
        try {
          const objectUrl = await renderCoverFront(card, {
            deckId: product.deckId,
            deckName: product.name,
            propType: prop,
          });
          const blob = await (await fetch(objectUrl)).blob();
          const storageRef = ref(storage, storagePath(product.id, i, prop));
          await uploadBytes(storageRef, blob, {
            contentType: "image/png",
            cacheControl: "public,max-age=31536000,immutable",
          });
          const downloadUrl = await getDownloadURL(storageRef);
          updated.push({
            ...card,
            ...(prop === PropType.STAFF && !card.imageUrl && { imageUrl: downloadUrl }),
            propImageUrls: { ...card.propImageUrls, [prop]: downloadUrl },
          });
          changed = true;
          progress.bakedCards++;
          onProgress?.({ ...progress });
        } catch (e) {
          progress.errors.push(`${product.name} card ${i} (${prop}): ${e}`);
          updated.push(card);
          onProgress?.({ ...progress });
        }
      }

      live.set(product.id, updated);
      if (changed) {
        try {
          await updateDoc(doc(firestore, "products", product.id), {
            coverCards: updated,
          });
        } catch (e) {
          progress.errors.push(`${product.name} doc update: ${e}`);
        }
      }
    }
  }

  progress.currentProduct = null;
  onProgress?.({ ...progress });
  return progress;
}
