import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
  let product: Record<string, unknown> | null = null;
  try {
    const { getAdminDb } = await import("#lib/server/firebaseAdmin.js");
    const db = getAdminDb();
    const doc = await db.collection("products").doc(params.productId).get();
    if (doc.exists) {
      // JSON round-trip strips Firestore Timestamps/refs so the payload
      // serializes across the SSR boundary. The Product model (src/lib/features/
      // store/domain/models/product.ts) is all strings/numbers/arrays, so this
      // is a no-op safety net rather than a lossy conversion.
      product = JSON.parse(JSON.stringify({ id: doc.id, ...doc.data() }));
    }
  } catch {
    // Non-fatal: page falls back to client-side product load.
  }
  return { serverProduct: product, productId: params.productId };
};
