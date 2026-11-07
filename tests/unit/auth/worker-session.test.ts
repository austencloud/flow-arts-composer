import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { createWorkerSession } from "#lib/shared/auth/phone-sign-in/worker-session.js";
import { readSavedFirebaseUsers } from "#lib/shared/auth/services/saved-firebase-user.js";

const NOW = 1_800_000_000_000;
const KEY = "firebase:authUser:the-api-key:[DEFAULT]";

function record(
  overrides: { expirationTime?: number; isAnonymous?: boolean; uid?: string } = {}
) {
  return {
    key: KEY,
    value: {
      uid: overrides.uid ?? "austen",
      isAnonymous: overrides.isAnonymous ?? false,
      stsTokenManager: {
        accessToken: "saved-token",
        refreshToken: "refresh-token",
        expirationTime: overrides.expirationTime ?? NOW + 30 * 60_000,
      },
    },
  };
}

function session(records: ReturnType<typeof record>[]) {
  const fetchMock = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) =>
    String(url).includes("securetoken")
      ? new Response(JSON.stringify({ id_token: "minted-token" }))
      : new Response("{}")
  );
  return {
    fetchMock,
    worker: createWorkerSession({
      readUsers: async () => records,
      fetch: fetchMock as unknown as typeof fetch,
      now: () => NOW,
    }),
  };
}

function bearer(fetchMock: ReturnType<typeof session>["fetchMock"]) {
  const init = fetchMock.mock.calls.at(-1)?.[1];
  return new Headers(init?.headers).get("Authorization");
}

describe("uid", () => {
  it("names the signed-in account", async () => {
    expect(await session([record()]).worker.uid()).toBe("austen");
  });

  it("finds nobody when nothing is saved, as on Safari", async () => {
    expect(await session([]).worker.uid()).toBeNull();
  });

  // A guest record is saved the same way, and must never approve anything.
  it("does not count a guest", async () => {
    expect(
      await session([record({ isAnonymous: true })]).worker.uid()
    ).toBeNull();
  });

  it("takes the most recently refreshed of several", async () => {
    const { worker } = session([
      record({ uid: "older", expirationTime: NOW + 1000 }),
      record({ uid: "newer", expirationTime: NOW + 2000 }),
    ]);
    expect(await worker.uid()).toBe("newer");
  });
});

describe("apiFetch", () => {
  it("uses the saved token while it has over a minute left", async () => {
    const { worker, fetchMock } = session([
      record({ expirationTime: NOW + 61_000 }),
    ]);
    await worker.apiFetch("/api/x");
    expect(bearer(fetchMock)).toBe("Bearer saved-token");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("exchanges the refresh token when the saved one is nearly out", async () => {
    const { worker, fetchMock } = session([
      record({ expirationTime: NOW + 59_000 }),
    ]);
    await worker.apiFetch("/api/x");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://securetoken.googleapis.com/v1/token?key=the-api-key"
    );
    expect(init?.body).toBe(
      "grant_type=refresh_token&refresh_token=refresh-token"
    );
    expect(bearer(fetchMock)).toBe("Bearer minted-token");
  });

  // The approve route refuses a token over five minutes old, however long it
  // has left, so a saved one would fail every tap made late in its hour.
  it("always mints a token when asked to force a refresh", async () => {
    const { worker, fetchMock } = session([record()]);
    await worker.apiFetch("/api/x", { method: "POST" }, { forceRefresh: true });
    expect(bearer(fetchMock)).toBe("Bearer minted-token");
  });

  it("rejects when the exchange fails, so the tap ends on the review page", async () => {
    const fetchMock = vi.fn(async () => new Response("no", { status: 400 }));
    const worker = createWorkerSession({
      readUsers: async () => [record()],
      fetch: fetchMock as unknown as typeof fetch,
      now: () => NOW,
    }).apiFetch;
    await expect(
      worker("/api/x", {}, { forceRefresh: true })
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("readSavedFirebaseUsers", () => {
  const DB = "firebaseLocalStorageDb";
  const STORE = "firebaseLocalStorage";

  function wipe() {
    return new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(DB);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  }

  beforeEach(wipe);
  afterEach(wipe);

  it("reads Firebase's own record shape and skips its other keys", async () => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () =>
        open.result.createObjectStore(STORE, { keyPath: "fbase_key" });
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put({ fbase_key: KEY, value: { uid: "austen" } });
        tx.objectStore(STORE).put({ fbase_key: "other", value: 1 });
        tx.oncomplete = () => {
          open.result.close();
          resolve();
        };
      };
    });

    expect(await readSavedFirebaseUsers()).toEqual([
      { key: KEY, value: { uid: "austen" } },
    ]);
  });

  it("answers nothing and does not create the database when it is missing", async () => {
    expect(await readSavedFirebaseUsers()).toEqual([]);
    const names = (await indexedDB.databases()).map((d) => d.name);
    expect(names).not.toContain(DB);
  });
});
