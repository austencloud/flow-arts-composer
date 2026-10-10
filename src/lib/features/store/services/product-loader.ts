import type { Product } from "../domain/models/product";

// Shop pages paint from the catalog the server renders into the page, then ask
// for the live catalog here once they have mounted. Loading Firebase on that
// first request keeps it off the shop's first download. The import() names the
// Firebase modules themselves: the build's small-chunk merge (vite.config.ts)
// can fold a small wrapper module back into the page.
async function loadFirestore() {
  const { getFirestoreInstance } = await import("#lib/shared/auth/firebase.js");
  return getFirestoreInstance();
}

export async function loadActiveProducts(): Promise<Product[]> {
  const { collection, getDocs, query, where, orderBy } = await import(
    "firebase/firestore"
  );
  const firestore = await loadFirestore();
  const productsRef = collection(firestore, "products");
  const q = query(
    productsRef,
    where("status", "==", "active"),
    orderBy("sortOrder", "asc")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Product);
}

/**
 * Admin path: every product regardless of status (active, draft, sold-out),
 * ordered by sortOrder. The signed-out store only ever calls
 * loadActiveProducts(); this powers the admin "play with it" view and the
 * Products editor list.
 */
export async function loadAllProducts(): Promise<Product[]> {
  const { collection, getDocs, query, orderBy } = await import(
    "firebase/firestore"
  );
  const firestore = await loadFirestore();
  const productsRef = collection(firestore, "products");
  const q = query(productsRef, orderBy("sortOrder", "asc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Product);
}

export async function loadProduct(productId: string): Promise<Product | null> {
  const { doc, getDoc } = await import("firebase/firestore");
  const firestore = await loadFirestore();
  const docRef = doc(firestore, "products", productId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as Product;
}
