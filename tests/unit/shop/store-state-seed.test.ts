import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "$lib/features/store/domain/models/product";

const env = vi.hoisted(() => ({ browser: false }));

vi.mock("$app/environment", () => ({
  get browser() {
    return env.browser;
  },
  dev: true,
  building: false,
  version: "test",
}));

vi.mock("$lib/features/store/analytics/shop-funnel", () => ({
  trackCheckoutStarted: vi.fn(),
}));

const SEED = [{ id: "loop", name: "LOOP Deck", status: "active" }] as Product[];
const FRESH = [
  { id: "loop", name: "LOOP Deck", status: "active", coverCards: [] },
] as unknown as Product[];

function loaderReturning(products: Product[]) {
  return {
    loadActiveProducts: vi.fn(async () => products),
    loadAllProducts: vi.fn(async () => products),
    loadProduct: vi.fn(async () => null),
  };
}

const checkout = { createCheckoutSession: vi.fn() };

// store-state keeps a module-level products cache; load a fresh copy per test.
async function freshStoreState() {
  vi.resetModules();
  return (await import("$lib/features/store/state/store-state.svelte")).createStoreState;
}

beforeEach(() => {
  env.browser = false;
});

describe("store seed from the server catalog snapshot", () => {
  it("renders the seeded catalog on the server without the browser SDK", async () => {
    const createStoreState = await freshStoreState();
    const loader = loaderReturning(FRESH);
    const store = createStoreState(loader, checkout);

    await store.loadProducts(false, SEED);

    expect(store.products).toEqual(SEED);
    expect(store.isLoading).toBe(false);
    expect(store.error).toBeNull();
    expect(loader.loadActiveProducts).not.toHaveBeenCalled();
  });

  it("keeps the loading state on the server when the snapshot is empty", async () => {
    const createStoreState = await freshStoreState();
    const loader = loaderReturning(FRESH);
    const store = createStoreState(loader, checkout);

    await store.loadProducts(false, []);

    expect(store.isLoading).toBe(true);
    expect(loader.loadActiveProducts).not.toHaveBeenCalled();
  });

  it("paints the seed on hydration, then swaps in the full catalog", async () => {
    env.browser = true;
    const createStoreState = await freshStoreState();
    const loader = loaderReturning(FRESH);
    const store = createStoreState(loader, checkout);

    const loading = store.loadProducts(false, SEED);
    // Synchronous: the first client render matches the server HTML.
    expect(store.products).toEqual(SEED);
    expect(store.isLoading).toBe(false);

    await loading;
    await vi.waitFor(() => expect(store.products).toEqual(FRESH));
    expect(loader.loadActiveProducts).toHaveBeenCalledTimes(1);
  });

  it("prefers the client cache over a seed, so covers survive back-navigation", async () => {
    env.browser = true;
    const createStoreState = await freshStoreState();
    const first = createStoreState(loaderReturning(FRESH), checkout);
    await first.loadProducts();

    const second = createStoreState(loaderReturning(FRESH), checkout);
    void second.loadProducts(false, SEED);

    expect(second.products).toEqual(FRESH);
  });
});
