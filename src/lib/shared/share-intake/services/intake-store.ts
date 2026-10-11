import { browser } from "$app/env";
import type {
  IntakeProblem,
  ShareIntakeSource,
  ShareIntakeStatus,
  SharedIntake,
} from "../domain/share-intake-models";

/**
 * Durable record for a received share.
 *
 * Persisted BEFORE any auth check so a share that cold-starts the app while
 * signed out survives the sign-in round trip. Reads never delete - a reload or
 * crash mid-flow must be recoverable.
 *
 * Honest limitation: IndexedDB is best-effort and quota writes can fail. This
 * makes loss rare and VISIBLE (putIntake throws; the caller logs) rather than
 * impossible.
 */

const DB_NAME = "tka-share-intake";
const DB_VERSION = 1;
const STORE = "intakes";
const OPEN_TIMEOUT_MS = 5000;

export const INTAKE_TTL_MS = 60 * 60 * 1000;

/**
 * needs-auth outlives the ordinary TTL by a wide margin. Reaping it at one
 * hour would destroy the exact case this store exists for - a share held
 * across a sign-in. Seven days keeps it bounded rather than immortal.
 */
export const NEEDS_AUTH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Aggregate ceiling, in the spirit of thumbnail-local-cache's own cap. */
export const MAX_INTAKE_STORE_BYTES = 64 * 1024 * 1024;

/**
 * What actually goes into IndexedDB.
 *
 * Bytes, not File. jsdom's structuredClone of a File returns a plain object
 * with no name, type, or content, so a File-valued record is untestable under
 * vitest and silently lossy anywhere structured clone is partial. An
 * ArrayBuffer clones identically everywhere.
 */
interface StoredFile {
  bytes: ArrayBuffer;
  name: string;
  type: string;
}

interface StoredIntake {
  receiptId: string;
  source: ShareIntakeSource;
  files: StoredFile[];
  text?: string;
  title?: string;
  status: ShareIntakeStatus;
  receivedAt: number;
  problems: IntakeProblem[];
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Both of these are load-bearing. An upgrade held open by another tab
    // fires neither onsuccess nor onerror, so without them every caller awaits
    // a promise that never settles. ShareIntakeHost awaits this on mount, so
    // without them a blocked upgrade would hang the share pipeline silently
    // for the rest of the session.
    const timer = setTimeout(
      () => reject(new Error("share-intake: IndexedDB open timed out")),
      OPEN_TIMEOUT_MS
    );
    request.onblocked = () => {
      clearTimeout(timer);
      reject(new Error("share-intake: IndexedDB open blocked by another connection"));
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "receiptId" });
        store.createIndex("receivedAt", "receivedAt");
      }
    };

    request.onsuccess = () => {
      clearTimeout(timer);
      const db = request.result;
      // Close on versionchange so a later upgrade in another tab is never
      // blocked by this cached connection, and drop the cache so the next call
      // reopens rather than reusing a closed handle.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error ?? new Error("share-intake: IndexedDB open failed"));
    };
  }).catch((error: unknown) => {
    // Never cache a rejection: one transient failure would poison the store
    // for the rest of the session.
    dbPromise = null;
    throw error;
  });

  return dbPromise;
}

/**
 * Await one IDBRequest. Resolution happens inside the request's own success
 * callback, which keeps the surrounding transaction alive - awaiting a
 * macrotask between requests is what auto-commits a transaction out from under
 * you, and this deliberately does not do that.
 */
function awaitRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("share-intake: request failed"));
  });
}

/**
 * Run work inside one transaction. The connection is cached and is NOT closed
 * here; the first draft closed it in `oncomplete` only, which leaked a
 * connection on every error path.
 */
async function withStore<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  const db = await openDb();

  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    let outcome: T;
    let failed = false;

    transaction.oncomplete = () => {
      if (!failed) resolve(outcome);
    };
    transaction.onabort = () => {
      failed = true;
      reject(transaction.error ?? new Error("share-intake: transaction aborted"));
    };
    transaction.onerror = () => {
      failed = true;
      reject(transaction.error ?? new Error("share-intake: transaction failed"));
    };

    work(transaction.objectStore(STORE)).then(
      (value) => {
        outcome = value;
      },
      (error: unknown) => {
        failed = true;
        try {
          transaction.abort();
        } catch {
          // Already finished; the rejection below is still the real answer.
        }
        reject(error);
      }
    );
  });
}

async function toStored(record: SharedIntake): Promise<StoredIntake> {
  const files = await Promise.all(
    record.files.map(async (file) => ({
      bytes: await file.arrayBuffer(),
      name: file.name,
      type: file.type,
    }))
  );
  return { ...record, files };
}

function fromStored(stored: StoredIntake): SharedIntake {
  return {
    ...stored,
    files: stored.files.map(
      (file) => new File([file.bytes], file.name, { type: file.type })
    ),
  };
}

function storedBytes(stored: StoredIntake): number {
  return stored.files.reduce((sum, file) => sum + file.bytes.byteLength, 0);
}

function ttlFor(status: ShareIntakeStatus): number {
  return status === "needs-auth" ? NEEDS_AUTH_TTL_MS : INTAKE_TTL_MS;
}

async function listStored(): Promise<StoredIntake[]> {
  return withStore("readonly", (store) =>
    awaitRequest<StoredIntake[]>(store.getAll())
  );
}

/**
 * Evict oldest-first inside the CALLER'S transaction, never a `needs-auth`
 * record.
 *
 * Takes an open `IDBObjectStore` rather than opening its own: an earlier
 * revision ran the eviction sweep and the subsequent `put` in two separate
 * transactions, so a concurrent write between them could push the store back
 * over the cap and the `put` would land anyway. Everything below runs on one
 * store handle, and `awaitRequest` resolves inside each request's own success
 * callback, which keeps that transaction alive.
 */
async function makeRoomFor(
  store: IDBObjectStore,
  incoming: number,
  replacing: string
): Promise<void> {
  const all = await awaitRequest<StoredIntake[]>(store.getAll());
  const others = all.filter((record) => record.receiptId !== replacing);
  let used = others.reduce((sum, record) => sum + storedBytes(record), 0);
  if (used + incoming <= MAX_INTAKE_STORE_BYTES) return;

  // Oldest first, and NEVER a needs-auth record: trace 3 parks the only copy
  // of the user's bytes there while they are away at their email client.
  const evictable = others
    .filter((record) => record.status !== "needs-auth")
    .sort((a, b) => a.receivedAt - b.receivedAt);

  for (const victim of evictable) {
    if (used + incoming <= MAX_INTAKE_STORE_BYTES) break;
    await awaitRequest(store.delete(victim.receiptId));
    used -= storedBytes(victim);
  }

  if (used + incoming > MAX_INTAKE_STORE_BYTES) {
    // Aborts the transaction via withStore, so no partial eviction survives.
    throw new Error(
      "share-intake: store is full of pending sign-in shares; refusing the write"
    );
  }
}

export async function putIntake(record: SharedIntake): Promise<void> {
  if (!browser) return;

  // File.arrayBuffer() is a macrotask await, so it MUST finish before the
  // transaction opens - awaiting it inside one auto-commits the transaction
  // out from under the eviction sweep.
  const stored = await toStored(record);
  const incoming = storedBytes(stored);

  if (incoming > MAX_INTAKE_STORE_BYTES) {
    throw new Error(
      `share-intake: record is ${incoming} bytes, over the ${MAX_INTAKE_STORE_BYTES} store cap`
    );
  }

  await withStore("readwrite", async (store) => {
    await makeRoomFor(store, incoming, stored.receiptId);
    await awaitRequest(store.put(stored));
  });
}

export async function getIntake(receiptId: string): Promise<SharedIntake | null> {
  if (!browser) return null;

  const stored = await withStore("readonly", (store) =>
    awaitRequest<StoredIntake | undefined>(store.get(receiptId))
  );
  return stored ? fromStored(stored) : null;
}

export async function listIntakes(): Promise<SharedIntake[]> {
  if (!browser) return [];
  return (await listStored()).map(fromStored);
}

/**
 * Read and write in ONE transaction. Two transactions is a lost-update race:
 * the runner advancing a record and a second delivery appending a problem
 * would each write a copy built from a stale read.
 */
export async function updateStatus(
  receiptId: string,
  status: ShareIntakeStatus,
  problems: IntakeProblem[] = []
): Promise<void> {
  if (!browser) return;

  await withStore("readwrite", async (store) => {
    const existing = await awaitRequest<StoredIntake | undefined>(
      store.get(receiptId)
    );
    if (!existing) {
      throw new Error(`share-intake: no record ${receiptId} to update`);
    }
    await awaitRequest(
      store.put({
        ...existing,
        status,
        problems:
          problems.length > 0
            ? [...existing.problems, ...problems]
            : existing.problems,
      })
    );
  });
}

export async function deleteIntake(receiptId: string): Promise<void> {
  if (!browser) return;
  await withStore("readwrite", (store) => awaitRequest(store.delete(receiptId)));
}

/**
 * Sweep abandoned records. Called on intake write AND at app boot -
 * write-only sweeping would leave records forever if no later share arrives.
 * Returns how many were removed.
 */
export async function reapExpired(now = Date.now()): Promise<number> {
  if (!browser) return 0;

  // One transaction, same reason as putIntake: an earlier revision opened
  // N+1 of them, one per stale record.
  return withStore("readwrite", async (store) => {
    const all = await awaitRequest<StoredIntake[]>(store.getAll());
    const stale = all.filter(
      (record) => now - record.receivedAt > ttlFor(record.status)
    );
    for (const record of stale) {
      await awaitRequest(store.delete(record.receiptId));
    }
    return stale.length;
  });
}
