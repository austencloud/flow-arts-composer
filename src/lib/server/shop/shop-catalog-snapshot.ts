/**
 * The active shop catalog, read on the server so product pages ship their
 * copy, prices, and cross-links in the first HTML response.
 *
 * Search Console reported /shop/loop-deck and /shop/starter-pack as soft 404s
 * (2026-09-23): the server sent "Loading the deck..." and the real page only
 * appeared after the browser SDK finished its Firestore read, 3-11 s later.
 * The /shop catalog tried to do this with the admin SDK, but that reads
 * `process.env`, which Cloudflare Pages never populates, so production has
 * been server-rendering an empty catalog. This goes through the Firestore
 * REST owner with the request's platform credential instead, the same path
 * the sitemap and card pages use.
 *
 * Cover cards stay behind: each one carries a full sequence document, and the
 * page would ship roughly half a megabyte of JSON for art the browser fetches
 * anyway. Pages paint from this snapshot, then swap in the full catalog from
 * the client once they mount.
 *
 * The snapshot is cached per isolate for a few minutes and the lookup gives
 * up after `SNAPSHOT_TIMEOUT_MS`, so a slow Firestore costs one request its
 * server-rendered copy rather than holding every request hostage. A lookup
 * that loses the race still fills the cache for the next request.
 */
import {
  fromFirestoreFields,
  getFirestoreRest,
  type FirestoreDocument,
  type FirestoreRest,
} from "$lib/server/firestore/firestore-rest";
import type { Product } from "$lib/features/store/domain/models/product";

/** Everything a product page, the catalog, and the cross-sell rail read,
 *  minus `coverCards`. */
export const SHOP_SNAPSHOT_FIELDS = [
  "name",
  "description",
  "type",
  "listing",
  "price",
  "status",
  "sortOrder",
  "stripePriceId",
  "preorder",
  "shipBy",
  "cardCount",
  "coverImageUrl",
  "deckId",
  "regularPrice",
  "regularStripePriceId",
  "preorderPriceCutoff",
  "boxContents",
  "loopComponents",
] as const;

const SNAPSHOT_TTL_MS = 5 * 60 * 1000;
const SNAPSHOT_TIMEOUT_MS = 2500;
// The catalog is a few dozen SKUs; this only bounds a runaway collection.
const SNAPSHOT_LIMIT = 200;

type CatalogClient = Pick<FirestoreRest, "queryDocuments">;

/**
 * Active products in catalog order. The query filters on status only, so the
 * sort happens here instead of leaning on a composite index.
 */
export function toSnapshotProducts(
  documents: readonly FirestoreDocument[]
): Product[] {
  return documents
    .map((document) => {
      const id = document.name.split("/").pop() ?? "";
      return { ...fromFirestoreFields(document.fields ?? {}), id } as unknown as Product;
    })
    .filter((product) => product.id && product.status === "active")
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

interface SnapshotLoaderOptions {
  getClient?: (platformCredential?: string) => CatalogClient;
  ttlMs?: number;
  timeoutMs?: number;
  now?: () => number;
}

export function createShopCatalogSnapshotLoader(
  options: SnapshotLoaderOptions = {}
) {
  const {
    getClient = getFirestoreRest,
    ttlMs = SNAPSHOT_TTL_MS,
    timeoutMs = SNAPSHOT_TIMEOUT_MS,
    now = Date.now,
  } = options;
  let cached: { expiresAt: number; products: Promise<Product[]> } | null = null;

  function lookup(platformCredential?: string): Promise<Product[]> {
    const current = now();
    if (cached && cached.expiresAt > current) return cached.products;

    const products = (async () => {
      const documents = await getClient(platformCredential).queryDocuments({
        collectionId: "products",
        fieldPath: "status",
        value: "active",
        limit: SNAPSHOT_LIMIT,
        fieldPaths: SHOP_SNAPSHOT_FIELDS,
      });
      return toSnapshotProducts(documents);
    })();
    const entry = { expiresAt: current + ttlMs, products };
    cached = entry;
    // A failed read must not be served from cache for the next five minutes.
    products.catch(() => {
      if (cached === entry) cached = null;
    });
    return products;
  }

  /** The snapshot, or [] when Firestore fails or outlasts the deadline. The
   *  pages fall back to their client-side load in that case. */
  return async function loadShopCatalogSnapshot(
    platformCredential?: string
  ): Promise<Product[]> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${timeoutMs} ms`)),
          timeoutMs
        );
      });
      return await Promise.race([lookup(platformCredential), deadline]);
    } catch (error) {
      // Logged, never swallowed: a silent empty snapshot is exactly how the
      // catalog shipped empty HTML in production with no trace.
      console.error(
        "[shop] catalog snapshot failed:",
        error instanceof Error ? error.message : error
      );
      return [];
    } finally {
      clearTimeout(timer);
    }
  };
}

export const loadShopCatalogSnapshot = createShopCatalogSnapshotLoader();
