import { afterEach, describe, expect, it, vi } from "vitest";
import {
  toFirestoreFields,
  type FirestoreDocument,
  type FirestoreQuery,
} from "$lib/server/firestore/firestore-rest";
import {
  createShopCatalogSnapshotLoader,
  toSnapshotProducts,
} from "$lib/server/shop/shop-catalog-snapshot";

function productDoc(id: string, fields: Record<string, unknown>): FirestoreDocument {
  return {
    name: `projects/tka/databases/(default)/documents/products/${id}`,
    fields: toFirestoreFields(fields),
  };
}

const CATALOG = [
  productDoc("pack", { name: "Starter Pack", status: "active", sortOrder: 3, price: 6500 }),
  productDoc("draft", { name: "Draft", status: "draft", sortOrder: 0 }),
  productDoc("loop", { name: "LOOP Deck", status: "active", sortOrder: 1, price: 2400 }),
  productDoc("unsorted", { name: "Unsorted", status: "active" }),
];

function fakeClient(queryDocuments: (query: FirestoreQuery) => Promise<FirestoreDocument[]>) {
  const spy = vi.fn(queryDocuments);
  return { spy, getClient: vi.fn(() => ({ queryDocuments: spy })) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("toSnapshotProducts", () => {
  it("keeps active products in catalog order, with ids from the document path", () => {
    const products = toSnapshotProducts(CATALOG);
    expect(products.map((p) => p.id)).toEqual(["unsorted", "loop", "pack"]);
    expect(products[2]).toMatchObject({ name: "Starter Pack", price: 6500 });
  });
});

describe("createShopCatalogSnapshotLoader", () => {
  it("reads a projection without cover cards, with the request's credential", async () => {
    const { spy, getClient } = fakeClient(async () => CATALOG);
    const load = createShopCatalogSnapshotLoader({ getClient });

    const products = await load("platform-secret");

    expect(products.map((p) => p.id)).toEqual(["unsorted", "loop", "pack"]);
    expect(getClient).toHaveBeenCalledWith("platform-secret");
    const query = spy.mock.calls[0]![0];
    expect(query).toMatchObject({ collectionId: "products", fieldPath: "status", value: "active" });
    expect(query.fieldPaths).toContain("boxContents");
    expect(query.fieldPaths).not.toContain("coverCards");
  });

  it("serves one read per TTL window", async () => {
    let clock = 0;
    const { spy, getClient } = fakeClient(async () => CATALOG);
    const load = createShopCatalogSnapshotLoader({ getClient, ttlMs: 1000, now: () => clock });

    await load();
    clock = 999;
    await load();
    expect(spy).toHaveBeenCalledTimes(1);

    clock = 1000;
    await load();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("returns [] on a failed read, logs it, and retries on the next request", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let fail = true;
    const { spy, getClient } = fakeClient(async () => {
      if (fail) throw new Error("PERMISSION_DENIED");
      return CATALOG;
    });
    const load = createShopCatalogSnapshotLoader({ getClient });

    expect(await load()).toEqual([]);
    expect(errors).toHaveBeenCalledWith("[shop] catalog snapshot failed:", "PERMISSION_DENIED");

    fail = false;
    expect(await load()).toHaveLength(3);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("gives up at the deadline, and the late answer serves the next request", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let answer!: (documents: FirestoreDocument[]) => void;
    const { spy, getClient } = fakeClient(
      () => new Promise<FirestoreDocument[]>((resolve) => (answer = resolve))
    );
    const load = createShopCatalogSnapshotLoader({ getClient, timeoutMs: 5 });

    expect(await load()).toEqual([]);

    answer(CATALOG);
    expect(await load()).toHaveLength(3);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
