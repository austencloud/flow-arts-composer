/**
 * What the page remembers on the visitor's own PC between reloads: the last
 * plan's text (localStorage) and the banner picture (IndexedDB, since a
 * picture can be large). Every access can fail in a private window or with
 * blocked site data, so every one is wrapped and a failure just means "not
 * remembered". Nothing here is sent anywhere.
 */

const PLAN_KEY = "site-walk:plan";
const DB_NAME = "site-walk";
const STORE = "pictures";
const BANNER_KEY = "banner";

export function rememberPlan(text: string): void {
  try {
    localStorage.setItem(PLAN_KEY, text);
  } catch {
    /* not remembered */
  }
}

export function recallPlan(): string | null {
  try {
    return localStorage.getItem(PLAN_KEY);
  } catch {
    return null;
  }
}

export function forgetPlan(): void {
  try {
    localStorage.removeItem(PLAN_KEY);
  } catch {
    /* nothing to forget */
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = run(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
        tx.onabort = () => db.close();
      }),
  );
}

export async function rememberBanner(picture: Blob): Promise<void> {
  try {
    await request("readwrite", (store) => store.put(picture, BANNER_KEY));
  } catch {
    /* not remembered */
  }
}

export async function recallBanner(): Promise<Blob | null> {
  try {
    const found = await request<unknown>("readonly", (store) => store.get(BANNER_KEY));
    return found instanceof Blob ? found : null;
  } catch {
    return null;
  }
}

const AROUND_KEY = "site-walk:around";

export function rememberAround(text: string): void {
  try {
    localStorage.setItem(AROUND_KEY, text);
  } catch {
    /* not remembered */
  }
}

export function recallAround(): string | null {
  try {
    return localStorage.getItem(AROUND_KEY);
  } catch {
    return null;
  }
}

export function forgetAround(): void {
  try {
    localStorage.removeItem(AROUND_KEY);
  } catch {
    /* nothing to forget */
  }
}
