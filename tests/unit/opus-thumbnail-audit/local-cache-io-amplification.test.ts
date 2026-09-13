/**
 * Audit repro: IndexedDB work per thumbnail, measured against the real
 * ThumbnailLocalCache with fake-indexeddb.
 *
 * Two shapes matter for gallery latency:
 *
 *  1. `get()` opens a READWRITE transaction and re-`put()`s the whole entry —
 *     blob included — on every hit, purely to refresh an LRU timestamp. Per the
 *     IndexedDB spec, readwrite transactions with overlapping scope run
 *     strictly in sequence, so every warm hit in a gallery serializes behind
 *     another card's blob rewrite. `get()` also gives up after 500ms
 *     (CACHE_READ_BUDGET_MS) and reports a *miss*, which promotes a contended
 *     hit into a full local render.
 *
 *  2. `set()` fires `prune()`, and `prune()` calls `getStats()`, which walks the
 *     entire store with `openCursor()` (values, not keys). So writing one
 *     thumbnail costs O(store size) cursor steps, making a cold gallery pass
 *     O(n^2) in IndexedDB work.
 *
 * The wall-clock numbers here come from an in-memory shim, so they are shape
 * evidence (growth curve), not device latency.
 */

import { Blob as NodeBlob } from "node:buffer";
import { IDBFactory } from "fake-indexeddb";
import FDBDatabase from "fake-indexeddb/lib/FDBDatabase";
import FDBObjectStore from "fake-indexeddb/lib/FDBObjectStore";
import FDBCursor from "fake-indexeddb/lib/FDBCursor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/environment", () => ({ browser: true }));

import { ThumbnailLocalCache } from "$lib/shared/browse/services/thumbnail-local-cache";

interface IdbCounters {
  transactionModes: string[];
  puts: number;
  openCursors: number;
  cursorSteps: number;
}

let counters: IdbCounters;

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  // jsdom's Blob does not survive fake-indexeddb's structuredClone.
  vi.stubGlobal("Blob", NodeBlob);

  counters = { transactionModes: [], puts: 0, openCursors: 0, cursorSteps: 0 };
  const transaction = FDBDatabase.prototype.transaction;
  vi.spyOn(FDBDatabase.prototype, "transaction").mockImplementation(function (
    this: unknown,
    ...args: unknown[]
  ) {
    counters.transactionModes.push((args[1] as string) ?? "readonly");
    return (transaction as (...a: unknown[]) => unknown).apply(this, args);
  } as never);
  const put = FDBObjectStore.prototype.put;
  vi.spyOn(FDBObjectStore.prototype, "put").mockImplementation(function (
    this: unknown,
    ...args: unknown[]
  ) {
    counters.puts++;
    return (put as (...a: unknown[]) => unknown).apply(this, args);
  } as never);
  const openCursor = FDBObjectStore.prototype.openCursor;
  vi.spyOn(FDBObjectStore.prototype, "openCursor").mockImplementation(function (
    this: unknown,
    ...args: unknown[]
  ) {
    counters.openCursors++;
    return (openCursor as (...a: unknown[]) => unknown).apply(this, args);
  } as never);
  const advance = FDBCursor.prototype.continue;
  vi.spyOn(FDBCursor.prototype, "continue").mockImplementation(function (
    this: unknown,
    ...args: unknown[]
  ) {
    counters.cursorSteps++;
    return (advance as (...a: unknown[]) => unknown).apply(this, args);
  } as never);

  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const thumbnailBlob = () =>
  // Representative of a rendered gallery WebP by shape, not by bytes.
  new Blob([new Uint8Array(32 * 1024)], { type: "image/webp" });

describe("local thumbnail cache read cost", () => {
  it("DEFECT: every cache HIT opens a readwrite transaction and rewrites the entry", async () => {
    const cache = new ThumbnailLocalCache();
    await cache.set("card-1", thumbnailBlob());
    // Snapshot by value: `counters.transactionModes` is a live array.
    const transactionsBefore = counters.transactionModes.length;
    const putsBefore = counters.puts;

    const hit = await cache.get("card-1");
    expect(hit).not.toBeNull();

    const readTransactions =
      counters.transactionModes.slice(transactionsBefore);
    // DEFECT: a read that only needs the bytes takes the exclusive lane and
    // writes the whole record back. Should be ["readonly"] with 0 extra puts
    // once the LRU timestamp stops riding on the read path.
    expect(readTransactions).toEqual(["readwrite"]);
    expect(counters.puts - putsBefore).toBe(1);
  });

  it("CONTROL: a cache MISS performs no write", async () => {
    const cache = new ThumbnailLocalCache();
    await cache.set("card-1", thumbnailBlob());
    const putsBefore = counters.puts;

    expect(await cache.get("absent")).toBeNull();
    expect(counters.puts - putsBefore).toBe(0);
  });

  it("DEFECT: 40 warm hits perform 40 blob rewrites in the exclusive lane", async () => {
    const cache = new ThumbnailLocalCache();
    const ids = Array.from({ length: 40 }, (_, i) => `card-${i}`);
    for (const id of ids) await cache.set(id, thumbnailBlob());
    const transactionsBefore = counters.transactionModes.length;
    const putsBefore = counters.puts;

    // A gallery pass: every visible card asks the local tier at once.
    const blobs = await Promise.all(ids.map((id) => cache.get(id)));
    expect(blobs.every((blob) => blob !== null)).toBe(true);

    const readTransactions =
      counters.transactionModes.slice(transactionsBefore);
    expect(readTransactions).toHaveLength(40);
    expect(readTransactions.every((mode) => mode === "readwrite")).toBe(true);
    expect(counters.puts - putsBefore).toBe(40);
  });
});

describe("local thumbnail cache write cost", () => {
  /** Drain fake-indexeddb's task queue so every fire-and-forget prune scan
   *  finishes before the counters are read. */
  async function drain(): Promise<void> {
    for (let i = 0; i < 200; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  /** Cursor steps spent writing `count` thumbnails into an empty store. */
  async function scanCostFor(count: number): Promise<number> {
    vi.stubGlobal("indexedDB", new IDBFactory());
    counters.cursorSteps = 0;
    counters.openCursors = 0;
    const cache = new ThumbnailLocalCache();
    for (let i = 0; i < count; i++) {
      await cache.set(`card-${i}`, thumbnailBlob());
    }
    await drain();
    return counters.cursorSteps;
  }

  it("DEFECT: cold-pass IndexedDB scan work grows quadratically with the store", async () => {
    // prune() -> getStats() walks every record on every write. The store stays
    // far below the 100MB budget here, so the scan is pure overhead: nothing is
    // ever evicted.
    const ten = await scanCostFor(10);
    const thirty = await scanCostFor(30);
    const sixty = await scanCostFor(60);

    // Linear would be 10 / 30 / 60. Quadratic (n(n+1)/2) is 55 / 465 / 1830.
    expect(ten).toBeGreaterThanOrEqual(10);
    expect(thirty / ten).toBeGreaterThan(3);
    expect(sixty / thirty).toBeGreaterThan(3);
    expect(sixty).toBeGreaterThan(1_000);
  });

  it("records one full-store scan per write for a 60-thumbnail cold pass", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    counters.openCursors = 0;
    const cache = new ThumbnailLocalCache();
    for (let i = 0; i < 60; i++) {
      await cache.set(`card-${i}`, thumbnailBlob());
    }
    await drain();

    // One getStats() value cursor per write, on the same object store the
    // visible cards are reading through.
    expect(counters.openCursors).toBeGreaterThanOrEqual(60);
  });
});
